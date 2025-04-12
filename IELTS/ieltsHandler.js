const { Markup } = require('telegraf');
// Убедись, что ieltsQuestions.js находится В ЭТОЙ ЖЕ папке (IELTS)
const ieltsQuestions = require('./ieltsQuestions'); // Важно, чтобы этот файл содержал обновленную структуру Part 2 (объект)

// Храним ссылку на функции из bot.js
let sharedFunctions = {};

// --- Клавиатуры ---
const getPartsKeyboard = () => Markup.inlineKeyboard([
    [Markup.button.callback('Part 1', 'ielts_select_part_1')],
    [Markup.button.callback('Part 2 ', 'ielts_select_part_2')],
    [Markup.button.callback('Part 3 ', 'ielts_select_part_3')],
    [Markup.button.callback('❌ Cancel', 'ielts_cancel')]
]);

// Клавиатура выбора тем Part 1 (без изменений)
const getPart1TopicsKeyboard = () => {
    const buttons = Object.keys(ieltsQuestions.part1).map(topicKey => [
        Markup.button.callback(
            ieltsQuestions.part1[topicKey].title,
            `ielts_select_topic_part1_${topicKey}`
        )
    ]);
    buttons.push([Markup.button.callback('⬅️ Back to Parts', 'ielts_back_parts')]);
    return Markup.inlineKeyboard(buttons);
};

// ✨ ИЗМЕНЕНО: Клавиатура для выбора тем Part 2 ✨
const getPart2TopicsKeyboard = () => {
    // Проверяем, есть ли вообще темы в Part 2
    if (!ieltsQuestions.part2 || Object.keys(ieltsQuestions.part2).length === 0) {
        return Markup.inlineKeyboard([
            [Markup.button.callback('No Part 2 topics available yet.', 'no_op')], // Кнопка без действия
            [Markup.button.callback('⬅️ Back to Parts', 'ielts_back_parts')]
        ]);
    }
    // Создаем кнопки из ключей объекта part2
    const buttons = Object.keys(ieltsQuestions.part2).map(topicKey => [
        Markup.button.callback(
            ieltsQuestions.part2[topicKey].title, // Текст кнопки - заголовок темы
            `ielts_select_topic_part2_${topicKey}` // Callback data с ключом темы
        )
    ]);
    buttons.push([Markup.button.callback('⬅️ Back to Parts', 'ielts_back_parts')]); // Кнопка назад
    return Markup.inlineKeyboard(buttons);
};

// Клавиатура выбора тем Part 3 (без изменений)
const getPart3TopicsKeyboard = () => {
    const buttons = Object.keys(ieltsQuestions.part3).map(topicKey => [
        Markup.button.callback(
            ieltsQuestions.part3[topicKey].title,
            `ielts_select_topic_part3_${topicKey}`
        )
    ]);
    buttons.push([Markup.button.callback('⬅️ Back to Parts', 'ielts_back_parts')]);
    return Markup.inlineKeyboard(buttons);
};

// Клавиатура во время практики (без изменений)
const getPracticeKeyboard = () => Markup.inlineKeyboard([
    [Markup.button.callback('⏹️ Stop Practice', 'ielts_stop_practice')]
]);

// --- Логика ---
// Функция запуска (без изменений)
const startIeltsPractice = (ctx) => {
    ctx.session = {};
    ctx.reply('Choose IELTS Speaking Part:', getPartsKeyboard());
};

// ---- START OF MINIMALLY CORRECTED FUNCTION ----
// Функция обработки ответа и запроса следующего вопроса (ИСПРАВЛЕНА ТОЛЬКО 1 СТРОКА)
const handleIeltsAnswerAndAskNext = async (ctx, userAnswerText) => {
    if (!ctx.session?.ieltsState?.waitingAnswer) return false;

    const state = ctx.session.ieltsState;

    // --- Проверка грамматики ---
    if (userAnswerText && sharedFunctions.checkGrammar) {
        console.log(`[${ctx.chat?.id}] Checking grammar for IELTS answer (Part ${state.part})...`);
        try {
            // Call checkGrammar and expect an object { corrected_text, corrections } or null
            const grammarResult = await sharedFunctions.checkGrammar(userAnswerText);

            // Check if grammar check was successful AND if the corrected text is different from the original
            // Access the 'corrected_text' property from the result object
            // VVVVVVVVVV ИСПРАВЛЕНИЕ ЗДЕСЬ VVVVVVVVVVVVVV
            if (grammarResult && grammarResult.corrected_text && grammarResult.corrected_text !== userAnswerText) {
                // Use grammarResult.corrected_text in the reply message
                await sharedFunctions.replyToUser(ctx,
                   `Your Answer Analysis:\n❌ Original:\n"${userAnswerText}"\n\n✅ Suggestion:\n"${grammarResult.corrected_text}"`, // <-- ИСПОЛЬЗУЕТСЯ ИСПРАВЛЕННЫЙ ТЕКСТ
                   { disable_notification: true }
                );
                // Optional TODO: You could add logic here to display detailed corrections
                // from grammarResult.corrections if you wanted to.
            // ^^^^^^^^^^ ИСПРАВЛЕНИЕ ЗДЕСЬ ^^^^^^^^^^^^^^
            } else if (grammarResult) {
                // Answer seems correct or no significant changes were suggested by the API
                 console.log(`[${ctx.chat?.id}] Grammar check found no significant changes or answer is correct.`);
                 // You might want to uncomment the line below if you want feedback even for "correct" answers
                 // await sharedFunctions.replyToUser(ctx, `✅ Your answer seems grammatically correct:\n"${userAnswerText}"`, { disable_notification: true });
            } else {
                 // Handle the case where checkGrammar returned null (e.g., API error)
                 console.warn(`[${ctx.chat?.id}] Grammar check failed or returned null for IELTS answer.`);
                 // Optionally inform the user, or just proceed without grammar feedback for this turn.
            }
        } catch (e) {
            console.error("Error during grammar check integration in IELTS handler:", e);
            // Handle potential errors during the check itself
        }
    }
    // --- Конец проверки грамматики ---

    const currentPartKey = `part${state.part}`;

    // --- Логика для Part 2 ---
    if (state.part === 2) {
        // The rest of your Part 2 logic remains unchanged...
        await sharedFunctions.replyToUser(ctx, "OK, that's the end of Part 2.");
        await ctx.reply("Now, let's move to Part 3 discussion questions, or you can stop here.", Markup.inlineKeyboard([
             [Markup.button.callback('Go to Part 3 Topics', 'ielts_select_part_3_direct')], // Предлагаем перейти к Part 3
             [Markup.button.callback('Stop Practice', 'ielts_stop_practice')]
        ]));
        state.waitingAnswer = false;
        delete state.topicKey; // Используем topicKey вместо cueCardIndex
        return true;
    }

    // --- Логика для Part 1 и Part 3 ---
    if (state.part === 1 || state.part === 3) {
        // The rest of your Part 1 & 3 logic remains unchanged...
        const partQuestions = ieltsQuestions[currentPartKey];
        const topic = partQuestions?.[state.topicKey];

        if (!topic) {
            console.error(`IELTS state error: topic not found for Part ${state.part}`, state);
            ctx.session.ieltsState = null;
            await sharedFunctions.replyToUser(ctx, "Something went wrong with the topic. Stopping practice.");
            if (sharedFunctions.getMainMenuKeyboard) await ctx.reply('Choose an option:', sharedFunctions.getMainMenuKeyboard());
            return true;
        }

        const nextIndex = state.questionIndex + 1;

        if (nextIndex < topic.questions.length) { // Есть следующий вопрос
            state.questionIndex = nextIndex;
            const nextQuestion = topic.questions[nextIndex];
            const totalQuestions = topic.questions.length;
            await sharedFunctions.replyToUser(ctx,
                `📌 Topic: ${topic.title}\n❓ Question ${nextIndex + 1}/${totalQuestions}:\n\n${nextQuestion}`,
                getPracticeKeyboard() // Отправляем с кнопкой Stop
            );
        } else { // Вопросы закончились
            await sharedFunctions.replyToUser(ctx, `🏁 Topic "${topic.title}" finished!`);
            state.waitingAnswer = false;
            delete state.topicKey;
            delete state.questionIndex;

            // Предлагаем выбрать новую тему для соответствующей части
            if (state.part === 1) {
                await ctx.reply('You can choose another Part 1 Topic below, or just send me any message to chat! 😊', getPart1TopicsKeyboard());
            } else { // state.part === 3
                await ctx.reply('You can choose another Part 3 Topic below, or stop the practice. 😉', getPart3TopicsKeyboard());
            }
        }
        return true;
    }

    // Fallback error handling
    console.error("Reached end of handleIeltsAnswerAndAskNext without handling part:", state);
    ctx.session.ieltsState = null;
    await sharedFunctions.replyToUser(ctx, "An unexpected error occurred in practice logic.");
    return false; // Вернем false, чтобы основной обработчик знал, что что-то пошло не так
};
// ---- END OF MINIMALLY CORRECTED FUNCTION ----


// --- Регистрация обработчиков ---
const register = (botInstance, commonFuncs) => {
    sharedFunctions = commonFuncs;

    botInstance.action(/ielts_(.+)/, async (ctx) => {
        const action = ctx.match[1];
        ctx.session ??= {};

        // Функция для безопасного редактирования/отправки сообщения
        const tryEditMessage = async (text, keyboard) => {
             try {
                 if (ctx.callbackQuery.message) {
                    // Пытаемся отредактировать существующее сообщение
                    await ctx.editMessageText(text, keyboard).catch(async (e) => {
                         console.warn("Failed to edit message, sending new reply. Error:", e.description);
                         // Если редактирование не удалось (например, сообщение старое), отправляем новое
                         if (keyboard) await ctx.reply(text, keyboard); else await ctx.reply(text);
                    });
                } else {
                    // Если нет сообщения для редактирования (редкий случай), просто отправляем новое
                     if (keyboard) await ctx.reply(text, keyboard); else await ctx.reply(text);
                }
            } catch (e) {
                // Общая ошибка при редактировании/отправке
                console.error("Error in tryEditMessage:", e);
                 await ctx.reply(text || "An error occurred.").catch(()=>{}); // Пробуем отправить текст ошибки или стандартное сообщение
            }
        };


        try {
            // --- Обработка кнопок Cancel / Back / Stop ---
            if (action === 'cancel' || action === 'back_parts' || action === 'stop_practice') {
                let messageText = "IELTS practice cancelled or selection changed.";
                if (action === 'stop_practice') messageText = 'IELTS practice stopped.';
                if (action === 'back_parts') messageText = 'Returned to part selection.';

                await tryEditMessage(messageText); // Редактируем сообщение, убирая кнопки
                ctx.session.ieltsState = null; // Сбрасываем состояние IELTS

                 // Показываем основное меню бота после отмены/остановки
                 if (sharedFunctions.getMainMenuKeyboard) {
                     await ctx.reply("Alright! Feel free to send any message or use the button below to start a practice.", sharedFunctions.getMainMenuKeyboard());
                 }
                 if (!ctx.answered) await ctx.answerCbQuery().catch(()=>{}); // Отвечаем на колбэк, убираем "часики"
                 return;
            }

            // --- Проверка на активную сессию ---
            // Если пользователь пытается выбрать новую часть/тему, пока идет практика
            if ((action.startsWith('select_part_') || action.startsWith('select_topic_')) && ctx.session?.ieltsState?.waitingAnswer) {
                 await ctx.answerCbQuery("Please stop the current practice first ('Stop Practice' button).", { show_alert: true });
                 return; // Не даем продолжить
            }

            // --- Выбор Части ---
            if (action === 'select_part_1') {
                ctx.session.ieltsState = { part: 1 };
                await tryEditMessage('Choose Part 1 Topic:', getPart1TopicsKeyboard());
            }
            // ✨ ИЗМЕНЕНО: Выбор Part 2 показывает темы ✨
            else if (action === 'select_part_2') {
                 ctx.session.ieltsState = { part: 2 };
                 await tryEditMessage('Choose Part 2 Cue Card Topic:', getPart2TopicsKeyboard()); // Показываем темы Part 2
            }
            // Выбор Part 3 (или прямой переход из Part 2)
             else if (action === 'select_part_3' || action === 'select_part_3_direct') {
                 // Проверяем, есть ли вопросы для Part 3
                 if (!ieltsQuestions.part3 || Object.keys(ieltsQuestions.part3).length === 0) {
                    await ctx.answerCbQuery("Sorry, no Part 3 questions available yet.", { show_alert: true }); return;
                 }
                 // Устанавливаем/подтверждаем часть 3
                 ctx.session.ieltsState = { part: 3 }; // Перезаписываем или создаем состояние для Part 3
                 await tryEditMessage('Choose Part 3 Discussion Topic:', getPart3TopicsKeyboard());
             }

            // --- Выбор темы Part 1 ---
            else if (action.startsWith('select_topic_part1_')) {
                const topicKey = action.replace('select_topic_part1_', '');
                const partState = ctx.session.ieltsState;
                // Проверяем, что состояние соответствует Part 1 и тема существует
                if (partState?.part === 1 && ieltsQuestions.part1[topicKey]?.questions?.length > 0) {
                    partState.topicKey = topicKey; partState.questionIndex = 0; partState.waitingAnswer = true;
                    const topic = ieltsQuestions.part1[topicKey];
                    const firstQuestion = topic.questions[0]; const totalQuestions = topic.questions.length;
                    // Редактируем сообщение, показывая первый вопрос и кнопку Stop
                    await tryEditMessage(`📌 Topic: ${topic.title}\n❓ Question 1/${totalQuestions}:\n\n${firstQuestion}`, getPracticeKeyboard());
                } else {
                    // Обработка ошибки: тема не найдена или пуста
                    await ctx.answerCbQuery('Error selecting topic or topic is empty.');
                    ctx.session.ieltsState = null; // Сбрасываем состояние
                    await tryEditMessage('Choose IELTS Speaking Part:', getPartsKeyboard()).catch(()=>{}); // Возвращаем к выбору части
                 }
            }
            // ✨ ИЗМЕНЕНО: Обработчик выбора темы Part 2 ✨
            else if (action.startsWith('select_topic_part2_')) {
                const topicKey = action.replace('select_topic_part2_', '');
                const partState = ctx.session.ieltsState;
                // Проверяем, что состояние соответствует Part 2 и тема/карточка существуют
                if (partState?.part === 2 && ieltsQuestions.part2[topicKey]?.card) {
                    partState.topicKey = topicKey; // Запоминаем ключ темы
                    partState.waitingAnswer = true; // Начинаем ждать ответ

                    const cueCardData = ieltsQuestions.part2[topicKey];
                    const cueCardText = cueCardData.card; // Берем текст карточки

                    // Сначала редактируем сообщение с выбором тем, сообщая о начале Part 2
                    await tryEditMessage(`Part 2: Cue Card\nTopic: ${cueCardData.title}\n\nYou have 1 minute to prepare your answer.`);

                    // Отправляем текст карточки НОВЫМ сообщением с кнопкой Stop
                    await ctx.reply(cueCardText, getPracticeKeyboard());
                } else {
                    // Обработка ошибки: тема не найдена или карточка пуста
                    await ctx.answerCbQuery('Error selecting Part 2 topic or topic is empty.');
                    ctx.session.ieltsState = null; // Сбрасываем состояние
                    await tryEditMessage('Choose IELTS Speaking Part:', getPartsKeyboard()).catch(()=>{}); // Возвращаем к выбору части
                }
            }
            // --- Выбор темы Part 3 ---
            else if (action.startsWith('select_topic_part3_')) {
                 const topicKey = action.replace('select_topic_part3_', '');
                 const partState = ctx.session.ieltsState;
                 // Проверяем, что состояние соответствует Part 3 и тема существует
                 if (partState?.part === 3 && ieltsQuestions.part3[topicKey]?.questions?.length > 0) {
                    partState.topicKey = topicKey; partState.questionIndex = 0; partState.waitingAnswer = true;
                    const topic = ieltsQuestions.part3[topicKey];
                    const firstQuestion = topic.questions[0]; const totalQuestions = topic.questions.length;
                    // Редактируем сообщение, показывая первый вопрос и кнопку Stop
                    await tryEditMessage(`📌 Topic: ${topic.title}\n❓ Question 1/${totalQuestions}:\n\n${firstQuestion}`, getPracticeKeyboard());
                 } else {
                    // Обработка ошибки: тема не найдена или пуста
                    await ctx.answerCbQuery('Error selecting topic or topic is empty.');
                    ctx.session.ieltsState = null; // Сбрасываем состояние
                    await tryEditMessage('Choose IELTS Speaking Part:', getPartsKeyboard()).catch(()=>{}); // Возвращаем к выбору части
                  }
            }

            // Отвечаем на callback query в конце, если не было ответа ранее (например, alert)
             if (!ctx.answered) {
                await ctx.answerCbQuery().catch(()=>{}); // Убираем "часики"
             }

        } catch (error) {
             console.error('Error handling IELTS action:', error);
             if (!ctx.answered) await ctx.answerCbQuery('Sorry, an error occurred.').catch(()=>{}); // Отвечаем на коллбэк ошибкой
             ctx.session.ieltsState = null; // Сбрасываем состояние при ошибке
              // Пытаемся вернуть пользователя к выбору части
              try { await tryEditMessage('An error occurred. Choose IELTS Speaking Part:', getPartsKeyboard()).catch(()=>{}); } catch(e){}
        }
    });
};

module.exports = { register, startIeltsPractice, handleIeltsAnswerAndAskNext };