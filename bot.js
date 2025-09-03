// Файл: bot.js (Версия с "полировкой")

const dotenv = require('dotenv');
const { Telegraf, session, MemorySessionStore, Markup } = require('telegraf');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const speech = require('@google-cloud/speech');
const express = require('express');

const ieltsHandler = require('./IELTS/ieltsHandler');

dotenv.config();

// --- НОВОЕ: Расширенная конфигурация ---
const CONFIG = {
    GEMINI_MODEL: "gemma-3-4b-it",
    GRAMMAR_PROMPT: `Analyze the following English text for grammar, style, spelling, and punctuation errors.
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
{TEXT}
\`\`\`
`,
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB
    GOOGLE_SPEECH_LANG_CODE: 'en-US',
    GOOGLE_SPEECH_SAMPLE_RATE: 48000
};

// --- Инициализация ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: CONFIG.GEMINI_MODEL });
const speechClient = new speech.SpeechClient();
console.log("Google Cloud Speech Client initialized (using OGG directly).");

const startMenuKeyboard = Markup.keyboard([
  ['IELTS Practice'],
]).resize();

// --- Основные функции-помощники ---

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
  const prompt = CONFIG.GRAMMAR_PROMPT.replace('{TEXT}', trimmedText); // Используем промпт из конфига
  try {
    const result = await geminiModel.generateContent(prompt);
    const response = result.response;
    let responseText = response.text()?.trim();
    if (!responseText) {
        console.error('Gemini API returned empty response.');
        return null;
    }
    // Очистка от Markdown-блоков JSON
    if (responseText.startsWith('```json')) responseText = responseText.substring(7);
    else if (responseText.startsWith('```')) responseText = responseText.substring(3);
    if (responseText.endsWith('```')) responseText = responseText.substring(0, responseText.length - 3);
    responseText = responseText.trim();
    try {
        const analysisResult = JSON.parse(responseText);
        // Валидация структуры
        if (typeof analysisResult === 'object' && analysisResult !== null && typeof analysisResult.corrected_text === 'string' && Array.isArray(analysisResult.corrections)) {
            analysisResult.corrected_text = analysisResult.corrected_text.trim();
            analysisResult.corrections = analysisResult.corrections.filter(c =>
                typeof c === 'object' && c !== null && typeof c.original_phrase === 'string' && typeof c.corrected_phrase === 'string' && typeof c.explanation === 'string'
            ).map(c => ({
                original_phrase: c.original_phrase.trim(),
                corrected_phrase: c.corrected_phrase.trim(),
                explanation: c.explanation.trim()
            }));
            return analysisResult;
        } else { // Структура неверна, но есть `corrected_text`
            console.error('Gemini API JSON structure mismatch:', responseText);
             const fallbackCorrected = analysisResult?.corrected_text?.trim() || (typeof analysisResult === 'string' ? analysisResult.trim() : null);
             if (fallbackCorrected) {
                 console.warn('Using fallback corrected_text due to structure mismatch.');
                 return { corrected_text: fallbackCorrected, corrections: [] };
             }
             return null;
        }
    } catch (parseError) { // Не удалось распарсить JSON
      console.error('Gemini JSON parse error:', parseError, 'Received:', responseText);
      // Если это просто текст, используем его как исправление
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
        const request = {
            audio: { content: audioBuffer.toString('base64') },
            config: {
                encoding: 'OGG_OPUS',
                sampleRateHertz: CONFIG.GOOGLE_SPEECH_SAMPLE_RATE,
                languageCode: CONFIG.GOOGLE_SPEECH_LANG_CODE,
                enableAutomaticPunctuation: true,
            },
        };
        const [response] = await speechClient.recognize(request);
        const transcription = response.results.map(result => result.alternatives[0].transcript).join('\n').trim();
        return transcription || "";
    } catch (error) {
        console.error('Google Cloud Speech API Error:', error.details || error.message || error);
        return null;
    } finally {
        console.timeEnd('SpeechRecognition Google (OGG)');
    }
};

// --- НОВОЕ: Единый обработчик для проверки грамматики ---
async function processGrammarCheck(ctx, text, messageId, isFromVoice = false) {
    const chatId = ctx.chat.id;
    const originalMessageLabel = isFromVoice ? `🗣️ Your Message (from voice)` : `❌ Your Message`;
    
    try {
        await ctx.telegram.sendChatAction(chatId, 'typing');
        const grammarResult = await checkGrammar(text);

        if (!grammarResult) {
            console.error(`[${chatId}] checkGrammar failed for input.`);
            await replyToUser(ctx, 'Sorry, an error occurred while checking grammar. Please try again later.', { reply_to_message_id: messageId });
            return;
        }

        const { corrected_text, corrections } = grammarResult;

        if (corrections && corrections.length > 0) {
            const correctionId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            ctx.session.corrections = { ...ctx.session.corrections, [correctionId]: corrections };

            let responseMessage = `${originalMessageLabel}:\n_"${text}"_\n\n`;
            responseMessage += `✅ Improved Version:\n_"${corrected_text}"_`;
            
            const keyboard = Markup.inlineKeyboard([Markup.button.callback('Show Corrections', `show_corrections_${correctionId}`)]);
            await replyToUser(ctx, responseMessage, { reply_to_message_id: messageId, reply_markup: keyboard.reply_markup, parse_mode: 'Markdown' });

        } else if (corrected_text && corrected_text.toLowerCase() !== text.trim().toLowerCase()) {
            let responseMessage = `${originalMessageLabel}:\n_"${text}"_\n\n`;
            responseMessage += `✅ Improved Version (minor changes):\n_"${corrected_text}"_`;
            await replyToUser(ctx, responseMessage, { reply_to_message_id: messageId, parse_mode: 'Markdown' });
        } else {
            const correctMessageLabel = isFromVoice ? `✅ Your message (from voice) seems correct:` : `✅ Your message seems correct:`;
            await replyToUser(ctx, `${correctMessageLabel}\n_"${text}"_`, { reply_to_message_id: messageId, parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error(`[${chatId}] Error processing text/voice input:`, error);
        await replyToUser(ctx, 'An error occurred while processing your message. Please try again.', { reply_to_message_id: messageId });
    }
}

// --- НОВОЕ: Отдельный обработчик для кнопки "Show Corrections" ---
async function handleShowCorrections(ctx) {
    const correctionId = ctx.callbackQuery.data.split('show_corrections_')[1];
    const correctionsData = ctx.session?.corrections?.[correctionId];
    
    if (correctionsData && correctionsData.length > 0) {
        const escapeMd = (str) => str.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
        let correctionsMessage = `*❗️ Объяснение:*\n\n`;
        correctionsData.forEach((corr, index) => {
            correctionsMessage += `${index + 1}\\. ${escapeMd(corr.original_phrase)} → ❌\n`;
            correctionsMessage += `   ✅ ${escapeMd(corr.corrected_phrase)} — _${escapeMd(corr.explanation)}_\n\n`;
        });
        
        await ctx.reply(correctionsMessage.trim(), {
            parse_mode: 'MarkdownV2',
            reply_to_message_id: ctx.callbackQuery.message?.message_id
        });
        // УЛУЧШЕНИЕ: Не удаляем коррекции, чтобы пользователь мог нажать кнопку снова.
        // delete ctx.session.corrections[correctionId];
    } else {
        console.warn(`Corrections not found for ID: ${correctionId}`);
        await ctx.reply('Corrections not found or have already been shown.');
    }
    await ctx.answerCbQuery();
}


// --- Настройка сессий и обработчиков ---
const sessionStore = new MemorySessionStore(); // ВНИМАНИЕ: Для продакшена лучше использовать Redis
bot.use(session({ store: sessionStore, defaultSession: () => ({ corrections: {} }) }));

ieltsHandler.register(bot, {
    replyToUser,
    checkGrammar,
    getMainMenuKeyboard: () => startMenuKeyboard
});

// --- Обработчики команд и сообщений Telegraf ---

bot.start(async (ctx) => {
    ctx.session = { corrections: {} }; // Сброс сессии
    await replyToUser(ctx, 'Hi! Send me a voice message or text in English for correction, or use the button below to practice IELTS Speaking questions. 🚀✨', {
        reply_markup: startMenuKeyboard.reply_markup
    });
});

bot.hears('IELTS Practice', (ctx) => {
    if (ctx.session?.ieltsState?.waitingAnswer) {
        return replyToUser(ctx, "You are already in an IELTS practice session. Use the 'Stop Practice' button if available.");
    }
    ieltsHandler.startIeltsPractice(ctx);
});

bot.on('callback_query', async (ctx) => {
    try {
        const data = ctx.callbackQuery.data;
        if (data.startsWith('show_corrections_')) {
            await handleShowCorrections(ctx);
        } else {
             // ieltsHandler сам обрабатывает свои callback'и
             console.log(`Received unhandled callback_query data in bot.js: ${data}`);
             await ctx.answerCbQuery("Action not recognized.");
        }
    } catch (error) {
        console.error("Error processing callback query in bot.js:", error);
        if (!ctx.answered) {
            await ctx.answerCbQuery("An error occurred.").catch(e => console.error("Failed to answer callback query after error:", e));
        }
    }
});

bot.on('text', async (ctx) => {
    const userMessage = ctx.message.text;
    if (userMessage === 'IELTS Practice') return; // Уже обработано в .hears

    // Если это ответ в рамках IELTS сессии, передаем его хендлеру
    if (ctx.session?.ieltsState?.waitingAnswer && await ieltsHandler.handleIeltsAnswerAndAskNext(ctx, userMessage)) {
        console.log(`[${ctx.chat.id}] Handled text as IELTS answer.`);
        return;
    }
    
    // Иначе, это обычная проверка грамматики
    console.log(`[${ctx.chat.id}] User Text Input (Normal): "${userMessage}"`);
    await processGrammarCheck(ctx, userMessage, ctx.message.message_id, false);
});

bot.on('voice', async (ctx) => {
    const { voice, message_id, chat } = ctx.message;
    console.log(`[${chat.id}] Received voice message (Duration: ${voice.duration}s, Size: ${voice.file_size} bytes)`);

    if (voice.file_size > CONFIG.MAX_FILE_SIZE) {
        return replyToUser(ctx, `File is too large. Maximum size is ${CONFIG.MAX_FILE_SIZE / 1024 / 1024} MB.`, { reply_to_message_id: message_id });
    }

    let processingMessage = null;
    try {
        processingMessage = await ctx.reply('Processing your voice message... ⏳', { reply_to_message_id: message_id, disable_notification: true });
        
        const fileLink = await ctx.telegram.getFileLink(voice.file_id);
        const response = await fetch(fileLink.href);
        if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
        
        const audioBuffer = Buffer.from(await response.arrayBuffer());
        const recognizedText = await recognizeSpeech(audioBuffer);

        await ctx.deleteMessage(processingMessage.message_id).catch(e => console.warn("Failed to delete processing message:", e.message));

        if (recognizedText === null) {
             return replyToUser(ctx, 'An error occurred during speech recognition. Please try again.', { reply_to_message_id: message_id });
        }
        if (!recognizedText) {
             return replyToUser(ctx, 'Could not recognize speech. Please try speaking clearly.', { reply_to_message_id: message_id });
        }

        console.log(`[${chat.id}] Recognized text: "${recognizedText}"`);
        
        // Если это ответ в рамках IELTS сессии
        if (ctx.session?.ieltsState?.waitingAnswer && await ieltsHandler.handleIeltsAnswerAndAskNext(ctx, recognizedText)) {
            console.log(`[${chat.id}] Handled voice as IELTS answer.`);
            return;
        }

        // Иначе, это обычная проверка грамматики
        console.log(`[${chat.id}] Voice Input (Normal): "${recognizedText}"`);
        await processGrammarCheck(ctx, recognizedText, message_id, true);

    } catch (error) {
        console.error(`[${chat.id}] Error processing voice message:`, error);
        if (processingMessage) {
            await ctx.deleteMessage(processingMessage.message_id).catch(e => {});
        }
        await replyToUser(ctx, `An error occurred while processing your voice message: ${error.message || 'Unknown error'}.`, { reply_to_message_id: message_id });
    }
});

// --- Настройка и запуск HTTP-сервера для Render ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.status(200).send('Telegram Bot (SpeakCheck) is running!'));
app.get('/healthz', (req, res) => res.status(200).send('ok'));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP server listening on port ${PORT}. Ready for Render health checks.`);
  console.log('Starting Telegram bot (long polling mode)...');
  bot.launch().then(() => {
        console.log('Bot started successfully!');
    }).catch(err => {
        console.error('CRITICAL: Error launching Telegram bot:', err);
        server.close(() => process.exit(1));
    });
});

// --- Корректное завершение работы ---
const stopGracefully = (signal) => {
    console.log(`${signal} received, stopping bot and server...`);
    bot.stop(signal);
    server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
    });
};
process.once('SIGINT', () => stopGracefully('SIGINT'));
process.once('SIGTERM', () => stopGracefully('SIGTERM'));