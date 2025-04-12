const dotenv = require('dotenv');
const { Telegraf, session, MemorySessionStore, Markup } = require('telegraf');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const fs = require('fs').promises; // Keep fs.promises if needed elsewhere, though not used in this version
const os = require('os');
const path = require('path'); // Keep path if needed elsewhere
const { GoogleGenerativeAI } = require("@google/generative-ai");
const speech = require('@google-cloud/speech');

const ieltsHandler = require('./IELTS/ieltsHandler');

dotenv.config();
const CONFIG = {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB
    GOOGLE_SPEECH_LANG_CODE: 'en-US',
    GOOGLE_SPEECH_SAMPLE_RATE: 48000 // Частота для OGG_OPUS из Telegram
};

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const tempDir = os.tmpdir(); // Keep tempDir if needed elsewhere
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const speechClient = new speech.SpeechClient();
console.log("Google Cloud Speech Client initialized (using OGG directly).");

const startMenuKeyboard = Markup.keyboard([
  ['IELTS Practice'],
]).resize();

const replyToUser = async (ctx, message, extra = {}) => {
  const options = { ...extra };
  // Ensure no parse_mode is set initially, unless explicitly provided in 'extra'
  // delete options.parse_mode; // Removed this line as parse_mode might be needed in 'extra'

  try {
    const MAX_LENGTH = 4000; // Telegram max message length is 4096, use a slightly smaller buffer
    if (message.length > MAX_LENGTH) {
        console.warn(`Message too long (${message.length} chars), splitting.`);
        let currentPos = 0;
        while(currentPos < message.length) {
            let chunkEnd = currentPos + MAX_LENGTH;
            let chunk = message.substring(currentPos, chunkEnd);

            // Try to split at a newline near the end for better readability
            if (chunkEnd < message.length) {
                const lastNewline = chunk.lastIndexOf('\n');
                // Only split at newline if it's reasonably far into the chunk
                if (lastNewline > MAX_LENGTH / 2) {
                    chunk = chunk.substring(0, lastNewline);
                    chunkEnd = currentPos + lastNewline + 1; // Move start position after the newline
                }
            }
            // Pass options only for the first part or if specifically needed
            const partOptions = currentPos === 0 ? options : { reply_to_message_id: options.reply_to_message_id, parse_mode: options.parse_mode }; // Carry over relevant options
            await ctx.reply(chunk, partOptions);
            currentPos = chunkEnd;
            await new Promise(resolve => setTimeout(resolve, 250)); // Small delay between chunks
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
        return null; // Indicate failure
    }

    // Clean potential markdown code blocks
    if (responseText.startsWith('```json')) responseText = responseText.substring(7);
    else if (responseText.startsWith('```')) responseText = responseText.substring(3);
    if (responseText.endsWith('```')) responseText = responseText.substring(0, responseText.length - 3);
    responseText = responseText.trim();

    try {
        const analysisResult = JSON.parse(responseText);

        // Validate the structure
        if (typeof analysisResult === 'object' &&
            analysisResult !== null &&
            typeof analysisResult.corrected_text === 'string' &&
            Array.isArray(analysisResult.corrections))
        {
            // Sanitize the results further
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
             // Attempt fallback if corrected_text exists but structure is wrong
             const fallbackCorrected = analysisResult?.corrected_text?.trim() || (typeof analysisResult === 'string' ? analysisResult.trim() : null);
             if (fallbackCorrected) {
                 console.warn('Using fallback corrected_text due to structure mismatch.');
                 return { corrected_text: fallbackCorrected, corrections: [] };
             }
             return null; // Indicate failure due to structure mismatch
        }
    } catch (parseError) {
      console.error('Gemini JSON parse error:', parseError, 'Received:', responseText);
      // If the response is just plain text (likely the correction itself), use it
      if (responseText && !responseText.includes('{') && !responseText.includes('[')) {
          console.warn('Gemini response was not JSON, treating as corrected text.');
          return { corrected_text: responseText.trim(), corrections: [] };
      }
      return null; // Indicate failure due to parsing error
    }
  } catch (error) {
    console.error('Gemini API error:', error);
    return null; // Indicate API failure
  } finally {
    console.timeEnd('CheckGrammarWithDetails');
  }
};

const recognizeSpeech = async (audioBuffer) => {
    console.time('SpeechRecognition Google (OGG)');
    try {
        const audio = { content: audioBuffer.toString('base64') }; // Send as base64 string
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
        return transcription || ""; // Return empty string if no transcription

    } catch (error) {
        console.error('Google Cloud Speech API Error:', error.details || error.message || error);
        console.timeEnd('SpeechRecognition Google (OGG)');
        return null; // Indicate an error occurred
    }
};

// --- Bot Logic ---
const sessionStore = new MemorySessionStore();
bot.use(session({ store: sessionStore }));

ieltsHandler.register(bot, {
    replyToUser,
    checkGrammar,
    getMainMenuKeyboard: () => startMenuKeyboard
});

bot.start(async (ctx) => {
    ctx.session = {}; // Initialize or reset session on /start
    await replyToUser(ctx, 'Hi! Send me a voice message or text in English for correction, or use the button below to practice IELTS Speaking questions. 🚀✨', {
        reply_markup: startMenuKeyboard.reply_markup
    });
});

bot.hears('IELTS Practice', (ctx) => {
    if (ctx.session?.ieltsState?.waitingAnswer) {
        replyToUser(ctx, "You are already in an IELTS practice session. Use /stop or the 'Stop Practice' button if available.");
        return;
    }
    ctx.session = ctx.session || {}; // Ensure session exists
    ctx.session.ieltsState = undefined; // Clear previous IELTS state if any
    ieltsHandler.startIeltsPractice(ctx);
});

// Обработчик для инлайн-кнопок
bot.on('callback_query', async (ctx) => {
    try {
        const data = ctx.callbackQuery.data;
        const chatId = ctx.chat.id;

        if (data.startsWith('show_corrections_')) {
            const correctionId = data.split('show_corrections_')[1];
            const corrections = ctx.session?.corrections?.[correctionId]; // Use optional chaining
            if (corrections && corrections.length > 0) { // Check if array has items
                let correctionsMessage = `📝 Corrections:\n`;
                corrections.forEach((corr, index) => {
                    // Basic escaping for MarkdownV2
                    const escapeMd = (str) => str.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
                    correctionsMessage += `${index + 1}\\. *"${escapeMd(corr.original_phrase)}"* → *"${escapeMd(corr.corrected_phrase)}"*\n`;
                    correctionsMessage += `   Reason: ${escapeMd(corr.explanation)}\n`;
                });
                // Use MarkdownV2 for formatting
                await ctx.telegram.sendMessage(chatId, correctionsMessage, { parse_mode: 'MarkdownV2' });
                // Consider deleting corrections after showing to prevent reuse/memory leak
                // delete ctx.session.corrections[correctionId];
            } else {
                await ctx.telegram.sendMessage(chatId, 'Corrections not found or already shown.');
            }
            await ctx.answerCbQuery(); // Acknowledge the callback query
        } else {
             await ctx.answerCbQuery("Action not recognized."); // Handle unknown callbacks
        }
    } catch (error) {
        console.error("Error processing callback query:", error);
        await ctx.answerCbQuery("Error processing your request."); // Inform user about error
    }
});

// Text Message Handler
bot.on('text', async (ctx) => {
    const userMessage = ctx.message.text;
    const chatId = ctx.chat.id;
    const messageId = ctx.message.message_id;

    // Ignore the command itself if sent as text
    if (userMessage === 'IELTS Practice') return;

    // Check if it's an IELTS answer first
    if (ctx.session?.ieltsState?.waitingAnswer) {
        if (await ieltsHandler.handleIeltsAnswerAndAskNext(ctx, userMessage)) {
            console.log(`[${chatId}] Handled text as IELTS answer.`);
            return;
        } else {
            console.log(`[${chatId}] Text was potentially IELTS answer, but handler returned false. Processing normally.`);
            // If handler returns false, it means it wasn't a valid answer in that context,
            // so we proceed to normal grammar check.
        }
    }

    console.log(`[${chatId}] User Text Input (Normal): "${userMessage}"`);
    await ctx.telegram.sendChatAction(chatId, 'typing');

    try {
        const grammarResult = await checkGrammar(userMessage);

        // --- ИСПРАВЛЕНИЕ ---
        if (!grammarResult) {
            // Если checkGrammar вернул null или undefined, отправляем сообщение об ошибке и выходим
            console.error(`[${chatId}] checkGrammar failed for text input.`);
            await replyToUser(ctx, 'Sorry, an error occurred while checking grammar. Please try again later.', { reply_to_message_id: messageId });
            return; // Прекращаем обработку этого сообщения
        }
        // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

        // Теперь мы уверены, что grammarResult - это объект
        const { corrected_text, corrections } = grammarResult;

        if (corrections && corrections.length > 0) {
            const correctionId = Date.now().toString() + Math.random().toString(36).substring(2, 7); // More unique ID
            ctx.session = ctx.session || {}; // Ensure session object exists
            ctx.session.corrections = ctx.session.corrections || {};
            ctx.session.corrections[correctionId] = corrections;

            let responseMessage = `❌ Your Message:\n_"${userMessage}"_\n\n`; // Using markdown for italics
            responseMessage += `✅ Improved Version:\n_"${corrected_text}"_`;
            const keyboard = Markup.inlineKeyboard([
                Markup.button.callback('Show Corrections', `show_corrections_${correctionId}`)
            ]);
            await replyToUser(ctx, responseMessage, {
                reply_to_message_id: messageId,
                reply_markup: keyboard.reply_markup,
                parse_mode: 'Markdown' // Enable Markdown for italics
            });
        } else if (corrected_text && corrected_text.toLowerCase() !== userMessage.trim().toLowerCase()) {
            // No specific errors found, but the text was improved/changed
            let responseMessage = `❌ Your Message:\n_"${userMessage}"_\n\n`;
            responseMessage += `✅ Improved Version (minor changes):\n_"${corrected_text}"_`;
            await replyToUser(ctx, responseMessage, { reply_to_message_id: messageId, parse_mode: 'Markdown' });
        } else {
            // Text is likely correct or couldn't be improved
            await replyToUser(ctx, `✅ Your message seems correct:\n_"${userMessage}"_`, { reply_to_message_id: messageId, parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error(`[${chatId}] Error processing text:`, error);
        await replyToUser(ctx, 'An error occurred while processing your text. Please try again.', { reply_to_message_id: messageId });
    }
});

// Voice Message Handler
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
           // Try to delete the "Processing" message, but don't fail if it doesn't work
           await ctx.deleteMessage(processingMessage.message_id).catch(e => console.warn("Failed to delete processing message:", e.message));
           processingMessage = null; // Ensure we don't try to delete it again in finally
        }

        if (recognizedText === null) {
             // recognizeSpeech returned null, indicating an error
             await replyToUser(ctx, 'An error occurred during speech recognition. Please try again.', { reply_to_message_id: messageId });
             return;
        }
        if (!recognizedText) {
             // Recognition was successful, but returned an empty string
             await replyToUser(ctx, 'Could not recognize speech in the voice message. Please try speaking clearly.', { reply_to_message_id: messageId });
             return;
        }
        console.log(`[${chatId}] Recognized text (Google OGG): "${recognizedText}"`);

        // Check if it's an IELTS answer first
        if (isPotentiallyIeltsAnswer) {
             if (await ieltsHandler.handleIeltsAnswerAndAskNext(ctx, recognizedText)) {
                console.log(`[${chatId}] Handled voice as IELTS answer.`);
                return; // Stop further processing if handled as IELTS
            } else {
                 console.log(`[${chatId}] Voice was potentially IELTS answer, but handler returned false. Processing normally.`);
            }
        }

        // If not handled as IELTS, proceed with normal grammar check
        console.log(`[${chatId}] Voice Input (Normal): "${recognizedText}"`);
        await ctx.telegram.sendChatAction(chatId, 'typing');
        const grammarResult = await checkGrammar(recognizedText);

        // --- ИСПРАВЛЕНИЕ ---
        if (!grammarResult) {
            // Если checkGrammar вернул null или undefined, отправляем сообщение об ошибке и выходим
            console.error(`[${chatId}] checkGrammar failed for voice input.`);
            await replyToUser(ctx, 'Sorry, an error occurred while checking grammar for your voice message. Please try again later.', { reply_to_message_id: messageId });
            return; // Прекращаем обработку этого сообщения
        }
        // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

        // Теперь мы уверены, что grammarResult - это объект
        const { corrected_text, corrections } = grammarResult;

        if (corrections && corrections.length > 0) {
            const correctionId = Date.now().toString() + Math.random().toString(36).substring(2, 7); // More unique ID
            ctx.session = ctx.session || {}; // Ensure session object exists
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
            // No specific errors, but text improved/changed
            let responseMessage = `🗣️ Your Message (from voice):\n_"${recognizedText}"_\n\n`;
            responseMessage += `✅ Improved Version (minor changes):\n_"${corrected_text}"_`;
            await replyToUser(ctx, responseMessage, { reply_to_message_id: messageId, parse_mode: 'Markdown' });
        } else {
            // Text seems correct
            await replyToUser(ctx, `✅ Your message (from voice) seems correct:\n_"${recognizedText}"_`, { reply_to_message_id: messageId, parse_mode: 'Markdown' });
        }

    } catch (error) {
        console.error(`[${chatId}] Error processing voice message:`, error);
        if (processingMessage) {
            // Attempt to delete processing message again in case of error after it was sent but before it was deleted
            try { await ctx.deleteMessage(processingMessage.message_id); } catch (e) { /* ignore secondary delete error */ }
        }
        await replyToUser(ctx, `An error occurred while processing your voice message: ${error.message || 'Unknown error'}. Please try again.`, { reply_to_message_id: messageId });
    } finally {
        // This block executes regardless of errors in the try block
        console.log(`[${chatId}] Finished processing voice message.`);
        // No need to delete processingMessage here as it's handled within the try block or if an error occurred before it was set
    }
});

// --- Start Bot ---
console.log('Starting bot (without FFmpeg)...');
bot.launch()
    .then(() => console.log('Bot started successfully! Using Google Cloud Speech API (OGG) and Gemini API.'))
    .catch(err => {
        console.error('Error launching bot:', err);
        process.exit(1); // Exit if the bot fails to start
    });

// --- Handle Shutdown Signals ---
process.once('SIGINT', () => { console.log("SIGINT received, stopping bot..."); bot.stop('SIGINT'); });
process.once('SIGTERM', () => { console.log("SIGTERM received, stopping bot..."); bot.stop('SIGTERM'); });   