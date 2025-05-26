// Файл: bot.js

const dotenv = require('dotenv');
const { Telegraf, session, MemorySessionStore, Markup } = require('telegraf');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const speech = require('@google-cloud/speech');
const express = require('express'); // <--- НОВОЕ: Добавляем Express

const ieltsHandler = require('./IELTS/ieltsHandler');

dotenv.config();
const CONFIG = {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB
    GOOGLE_SPEECH_LANG_CODE: 'en-US',
    GOOGLE_SPEECH_SAMPLE_RATE: 48000
};

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const tempDir = os.tmpdir();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const speechClient = new speech.SpeechClient();
console.log("Google Cloud Speech Client initialized (using OGG directly).");

const startMenuKeyboard = Markup.keyboard([
  ['IELTS Practice'],
]).resize();

const replyToUser = async (ctx, message, extra = {}) => {
  const options = { ...extra };
  try {
    const MAX_LENGTH = 4000;
    if (message.length > MAX_LENGTH) {
        console.warn(`Message too long (${message.length} chars), splitting.`);
        let currentPos = 0;
        while(currentPos < message.length) {
            let chunkEnd = currentPos + MAX_LENGTH;
            let chunk = message.substring(currentPos, chunkEnd);
            if (chunkEnd < message.length) {
                const lastNewline = chunk.lastIndexOf('\n');
                if (lastNewline > MAX_LENGTH / 2) {
                    chunk = chunk.substring(0, lastNewline);
                    chunkEnd = currentPos + lastNewline + 1;
                }
            }
            const partOptions = currentPos === 0 ? options : { reply_to_message_id: options.reply_to_message_id, parse_mode: options.parse_mode };
            await ctx.reply(chunk, partOptions);
            currentPos = chunkEnd;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    } else {
        await ctx.reply(message, options);
    }
  } catch (error) {
    if (error.code === 400 && error.description?.includes('message is not modified')) {
        console.warn(`Attempted to send unmodified message: ${message.substring(0, 50)}...`);
    } else if (error.code === 403 && error.description?.includes('bot was blocked by the user')) {
        console.warn(`Bot was blocked by user: ${ctx.chat?.id}`);
    } else if (error.code === 400 && error.description?.includes('message is too long')) {
         console.error(`Message is too long even after splitting attempt: ${message.substring(0,100)}...`);
         await ctx.reply("Sorry, the response is too long to be sent.", { reply_to_message_id: options.reply_to_message_id }).catch(e => console.error("Failed to send 'too long' notification:", e));
    } else {
        console.error("Ошибка отправки сообщения:", error);
        await ctx.reply("Sorry, an error occurred while sending the response.", { reply_to_message_id: options.reply_to_message_id }).catch(e => console.error("Failed to send error notification:", e));
    }
  }
};

const checkGrammar = async (text) => {
  if (!text || !text.trim()) return { corrected_text: text || '', corrections: [] };
  const trimmedText = text.trim();
  console.time('CheckGrammarWithDetails');
  const prompt = `Analyze the following English text for grammar, style, spelling, and punctuation errors.
Respond ONLY with a valid JSON object containing two keys:
1. "corrections": An array of objects. Each object MUST have these three keys:
   - "original_phrase": The specific part of the original text with the error.
   - "corrected_phrase": The corrected version of that specific part.
   - "explanation": A brief, concise explanation (max 10 words) of why the correction was needed.
2. "corrected_text": The full, corrected version of the entire input text, incorporating all fixes.

If no errors are found, the "corrections" array MUST be empty, and "corrected_text" MUST be the original input text.
Do NOT include any text outside the single JSON object. Ensure the JSON is strictly valid.

Input Text:
\`\`\`
${trimmedText}
\`\`\`
`;
  try {
    const result = await geminiModel.generateContent(prompt);
    const response = result.response;
    let responseText = response.text()?.trim();
    if (!responseText) {
        console.error('Gemini API returned empty response.');
        return null;
    }
    if (responseText.startsWith('```json')) responseText = responseText.substring(7);
    else if (responseText.startsWith('```')) responseText = responseText.substring(3);
    if (responseText.endsWith('```')) responseText = responseText.substring(0, responseText.length - 3);
    responseText = responseText.trim();
    try {
        const analysisResult = JSON.parse(responseText);
        if (typeof analysisResult === 'object' &&
            analysisResult !== null &&
            typeof analysisResult.corrected_text === 'string' &&
            Array.isArray(analysisResult.corrections))
        {
            analysisResult.corrected_text = analysisResult.corrected_text.trim();
            analysisResult.corrections = analysisResult.corrections.filter(c =>
                typeof c === 'object' && c !== null &&
                typeof c.original_phrase === 'string' &&
                typeof c.corrected_phrase === 'string' &&
                typeof c.explanation === 'string'
            ).map(c => ({
                original_phrase: c.original_phrase.trim(),
                corrected_phrase: c.corrected_phrase.trim(),
                explanation: c.explanation.trim()
            }));
            return analysisResult;
        } else {
            console.error('Gemini API JSON structure mismatch:', responseText);
             const fallbackCorrected = analysisResult?.corrected_text?.trim() || (typeof analysisResult === 'string' ? analysisResult.trim() : null);
             if (fallbackCorrected) {
                 console.warn('Using fallback corrected_text due to structure mismatch.');
                 return { corrected_text: fallbackCorrected, corrections: [] };
             }
             return null;
        }
    } catch (parseError) {
      console.error('Gemini JSON parse error:', parseError, 'Received:', responseText);
      if (responseText && !responseText.includes('{') && !responseText.includes('[')) {
          console.warn('Gemini response was not JSON, treating as corrected text.');
          return { corrected_text: responseText.trim(), corrections: [] };
      }
      return null;
    }
  } catch (error) {
    console.error('Gemini API error:', error);
    return null;
  } finally {
    console.timeEnd('CheckGrammarWithDetails');
  }
};

const recognizeSpeech = async (audioBuffer) => {
    console.time('SpeechRecognition Google (OGG)');
    try {
        const audio = { content: audioBuffer.toString('base64') };
        const config = {
            encoding: 'OGG_OPUS',
            sampleRateHertz: CONFIG.GOOGLE_SPEECH_SAMPLE_RATE,
            languageCode: CONFIG.GOOGLE_SPEECH_LANG_CODE,
            enableAutomaticPunctuation: true,
        };
        const request = { audio, config };
        const [response] = await speechClient.recognize(request);
        const transcription = response.results
            .map(result => result.alternatives[0].transcript)
            .join('\n')
            .trim();
        console.timeEnd('SpeechRecognition Google (OGG)');
        return transcription || "";
    } catch (error) {
        console.error('Google Cloud Speech API Error:', error.details || error.message || error);
        console.timeEnd('SpeechRecognition Google (OGG)');
        return null;
    }
};

const sessionStore = new MemorySessionStore();
bot.use(session({ store: sessionStore }));

ieltsHandler.register(bot, {
    replyToUser,
    checkGrammar,
    getMainMenuKeyboard: () => startMenuKeyboard
});

bot.start(async (ctx) => {
    ctx.session = {};
    await replyToUser(ctx, 'Hi! Send me a voice message or text in English for correction, or use the button below to practice IELTS Speaking questions. 🚀✨', {
        reply_markup: startMenuKeyboard.reply_markup
    });
});

bot.hears('IELTS Practice', (ctx) => {
    if (ctx.session?.ieltsState?.waitingAnswer) {
        replyToUser(ctx, "You are already in an IELTS practice session. Use /stop or the 'Stop Practice' button if available.");
        return;
    }
    ctx.session = ctx.session || {};
    ctx.session.ieltsState = undefined;
    ieltsHandler.startIeltsPractice(ctx);
});

bot.on('callback_query', async (ctx) => {
    console.log('--- Callback Query Received ---');
    console.log('Callback Data:', ctx.callbackQuery.data);
    try {
        const data = ctx.callbackQuery.data;
        const chatId = ctx.chat.id;
        if (data.startsWith('show_corrections_')) {
            const correctionId = data.split('show_corrections_')[1];
            const correctionsData = ctx.session?.corrections?.[correctionId];
            if (correctionsData && correctionsData.length > 0) {
                const escapeMd = (str) => str.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
                let correctionsMessage = `*❗️ Объяснение:*\n\n`;
                correctionsData.forEach((corr, index) => {
                    correctionsMessage += `${index + 1}\\. ${escapeMd(corr.original_phrase)} → ❌\n`;
                    correctionsMessage += `   ✅ ${escapeMd(corr.corrected_phrase)} — _${escapeMd(corr.explanation)}_\n\n`;
                });
                const messageWithButtonId = ctx.callbackQuery.message?.message_id;
                await ctx.telegram.sendMessage(chatId, correctionsMessage.trim(), {
                    parse_mode: 'MarkdownV2',
                    reply_to_message_id: messageWithButtonId
                });
                if (ctx.session?.corrections?.[correctionId]) {
                    delete ctx.session.corrections[correctionId];
                    if (Object.keys(ctx.session.corrections).length === 0) {
                        delete ctx.session.corrections;
                    }
                }
            } else {
                console.warn(`Corrections not found for ID: ${correctionId} or corrections array is empty. Session corrections:`, ctx.session?.corrections);
                await ctx.telegram.sendMessage(chatId, 'Коррекции не найдены или уже были показаны.');
            }
            await ctx.answerCbQuery();
        } else {
             console.log(`Received unhandled callback_query data: ${data}`);
             await ctx.answerCbQuery("Действие не распознано.");
        }
    } catch (error) {
        console.error("Ошибка обработки callback query:", error);
        if (!ctx.answered) {
            await ctx.answerCbQuery("Произошла ошибка при обработке вашего запроса.").catch(e => console.error("Не удалось ответить на callback query после ошибки:", e));
        }
    }
});

bot.on('text', async (ctx) => {
    const userMessage = ctx.message.text;
    const chatId = ctx.chat.id;
    const messageId = ctx.message.message_id;
    if (userMessage === 'IELTS Practice') return;
    if (ctx.session?.ieltsState?.waitingAnswer) {
        if (await ieltsHandler.handleIeltsAnswerAndAskNext(ctx, userMessage)) {
            console.log(`[${chatId}] Handled text as IELTS answer.`);
            return;
        } else {
            console.log(`[${chatId}] Text was potentially IELTS answer, but handler returned false. Processing normally.`);
        }
    }
    console.log(`[${chatId}] User Text Input (Normal): "${userMessage}"`);
    await ctx.telegram.sendChatAction(chatId, 'typing');
    try {
        const grammarResult = await checkGrammar(userMessage);
        if (!grammarResult) {
            console.error(`[${chatId}] checkGrammar failed for text input.`);
            await replyToUser(ctx, 'Sorry, an error occurred while checking grammar. Please try again later.', { reply_to_message_id: messageId });
            return;
        }
        const { corrected_text, corrections } = grammarResult;
        if (corrections && corrections.length > 0) {
            const correctionId = Date.now().toString() + Math.random().toString(36).substring(2, 7);
            ctx.session = ctx.session || {};
            ctx.session.corrections = ctx.session.corrections || {};
            ctx.session.corrections[correctionId] = corrections;
            let responseMessage = `❌ Your Message:\n_"${userMessage}"_\n\n`;
            responseMessage += `✅ Improved Version:\n_"${corrected_text}"_`;
            const keyboard = Markup.inlineKeyboard([
                Markup.button.callback('Show Corrections', `show_corrections_${correctionId}`)
            ]);
            await replyToUser(ctx, responseMessage, {
                reply_to_message_id: messageId,
                reply_markup: keyboard.reply_markup,
                parse_mode: 'Markdown'
            });
        } else if (corrected_text && corrected_text.toLowerCase() !== userMessage.trim().toLowerCase()) {
            let responseMessage = `❌ Your Message:\n_"${userMessage}"_\n\n`;
            responseMessage += `✅ Improved Version (minor changes):\n_"${corrected_text}"_`;
            await replyToUser(ctx, responseMessage, { reply_to_message_id: messageId, parse_mode: 'Markdown' });
        } else {
            await replyToUser(ctx, `✅ Your message seems correct:\n_"${userMessage}"_`, { reply_to_message_id: messageId, parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error(`[${chatId}] Error processing text:`, error);
        await replyToUser(ctx, 'An error occurred while processing your text. Please try again.', { reply_to_message_id: messageId });
    }
});

bot.on('voice', async (ctx) => {
    const voice = ctx.message.voice;
    const chatId = ctx.chat.id;
    const messageId = ctx.message.message_id;
    console.log(`[${chatId}] Received voice message (Duration: ${voice.duration}s, Size: ${voice.file_size} bytes, Type: ${voice.mime_type})`);
    const isPotentiallyIeltsAnswer = ctx.session?.ieltsState?.waitingAnswer ?? false;
    if (voice.file_size > CONFIG.MAX_FILE_SIZE) {
        return replyToUser(ctx, `File is too large. Maximum size is ${CONFIG.MAX_FILE_SIZE / 1024 / 1024} MB.`, { reply_to_message_id: messageId });
    }
    let processingMessage = null;
    let recognizedText = null;
    let audioBuffer = null;
    try {
        processingMessage = await ctx.reply('Processing your voice message... ⏳', { reply_to_message_id: messageId, disable_notification: true });
        await ctx.telegram.sendChatAction(chatId, 'typing');
        console.time('FetchVoice');
        const fileLink = await ctx.telegram.getFileLink(voice.file_id);
        const response = await fetch(fileLink.href);
        if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
        audioBuffer = Buffer.from(await response.arrayBuffer());
        console.timeEnd('FetchVoice');
        recognizedText = await recognizeSpeech(audioBuffer);
        if (processingMessage) {
           await ctx.deleteMessage(processingMessage.message_id).catch(e => console.warn("Failed to delete processing message:", e.message));
           processingMessage = null;
        }
        if (recognizedText === null) {
             await replyToUser(ctx, 'An error occurred during speech recognition. Please try again.', { reply_to_message_id: messageId });
             return;
        }
        if (!recognizedText) {
             await replyToUser(ctx, 'Could not recognize speech in the voice message. Please try speaking clearly.', { reply_to_message_id: messageId });
             return;
        }
        console.log(`[${chatId}] Recognized text (Google OGG): "${recognizedText}"`);
        if (isPotentiallyIeltsAnswer) {
             if (await ieltsHandler.handleIeltsAnswerAndAskNext(ctx, recognizedText)) {
                console.log(`[${chatId}] Handled voice as IELTS answer.`);
                return;
            } else {
                 console.log(`[${chatId}] Voice was potentially IELTS answer, but handler returned false. Processing normally.`);
            }
        }
        console.log(`[${chatId}] Voice Input (Normal): "${recognizedText}"`);
        await ctx.telegram.sendChatAction(chatId, 'typing');
        const grammarResult = await checkGrammar(recognizedText);
        if (!grammarResult) {
            console.error(`[${chatId}] checkGrammar failed for voice input.`);
            await replyToUser(ctx, 'Sorry, an error occurred while checking grammar for your voice message. Please try again later.', { reply_to_message_id: messageId });
            return;
        }
        const { corrected_text, corrections } = grammarResult;
        if (corrections && corrections.length > 0) {
            const correctionId = Date.now().toString() + Math.random().toString(36).substring(2, 7);
            ctx.session = ctx.session || {};
            ctx.session.corrections = ctx.session.corrections || {};
            ctx.session.corrections[correctionId] = corrections;
            let responseMessage = `🗣️ Your Message (from voice):\n_"${recognizedText}"_\n\n`;
            responseMessage += `✅ Improved Version:\n_"${corrected_text}"_`;
            const keyboard = Markup.inlineKeyboard([
                Markup.button.callback('Show Corrections', `show_corrections_${correctionId}`)
            ]);
            await replyToUser(ctx, responseMessage, {
                reply_to_message_id: messageId,
                reply_markup: keyboard.reply_markup,
                parse_mode: 'Markdown'
            });
        } else if (corrected_text && corrected_text.toLowerCase() !== recognizedText.toLowerCase()) {
            let responseMessage = `🗣️ Your Message (from voice):\n_"${recognizedText}"_\n\n`;
            responseMessage += `✅ Improved Version (minor changes):\n_"${corrected_text}"_`;
            await replyToUser(ctx, responseMessage, { reply_to_message_id: messageId, parse_mode: 'Markdown' });
        } else {
            await replyToUser(ctx, `✅ Your message (from voice) seems correct:\n_"${recognizedText}"_`, { reply_to_message_id: messageId, parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error(`[${chatId}] Error processing voice message:`, error);
        if (processingMessage) {
            try { await ctx.deleteMessage(processingMessage.message_id); } catch (e) { /* ignore */ }
        }
        await replyToUser(ctx, `An error occurred while processing your voice message: ${error.message || 'Unknown error'}. Please try again.`, { reply_to_message_id: messageId });
    } finally {
        console.log(`[${chatId}] Finished processing voice message.`);
    }
});

// --- НОВОЕ: Настройка и запуск HTTP-сервера ---
const app = express();
const PORT = process.env.PORT || 3000; // Render предоставит PORT

// Health check endpoint для Render
app.get('/', (req, res) => {
  res.status(200).send('Telegram Bot (SpeakCheck) is running and healthy! Using long polling.');
});

// Опционально: еще один стандартный health check endpoint
app.get('/healthz', (req, res) => {
    res.status(200).send('ok');
});

// Запускаем HTTP-сервер
const server = app.listen(PORT, '0.0.0.0', () => { // Важно слушать на 0.0.0.0
  console.log(`HTTP server listening on port ${PORT}. Ready for Render health checks.`);

  // Теперь, когда HTTP-сервер запущен, запускаем Telegram-бота
  console.log('Starting Telegram bot (long polling mode, without FFmpeg)...');
  bot.launch()
    .then(() => {
        console.log('Bot started successfully! Using Google Cloud Speech API (OGG) and Gemini API.');
        console.log('Telegram bot is active and using long polling.');
    })
    .catch(err => {
        console.error('CRITICAL: Error launching Telegram bot:', err);
        // Если бот не запустился, останавливаем HTTP-сервер и выходим с ошибкой
        server.close(() => {
            console.log('HTTP server closed due to bot launch failure.');
            process.exit(1);
        });
    });
});
// --- КОНЕЦ HTTP-сервера ---


// --- ОБНОВЛЕНО: Корректное завершение работы ---
process.once('SIGINT', () => {
    console.log("SIGINT received, stopping bot and server...");
    bot.stop('SIGINT');
    server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0); // Успешное завершение
    });
});

process.once('SIGTERM', () => {
    console.log("SIGTERM received, stopping bot and server...");
    bot.stop('SIGTERM');
    server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0); // Успешное завершение
    });
});