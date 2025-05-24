    // Файл: IELTS/ieltsHandler.js

    const { Markup } = require('telegraf');
    const ieltsQuestions = require('./ieltsQuestions');

    let sharedFunctions = {};

    // --- Клавиатуры ---
    const getPartsKeyboard = () => Markup.inlineKeyboard([
        [Markup.button.callback('Part 1', 'ielts_select_part_1')],
        [Markup.button.callback('Part 2 ', 'ielts_select_part_2')],
        [Markup.button.callback('Part 3 ', 'ielts_select_part_3')],
        [Markup.button.callback('❌ Cancel', 'ielts_cancel')]
    ]);

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

    const getPart2TopicsKeyboard = () => {
        if (!ieltsQuestions.part2 || Object.keys(ieltsQuestions.part2).length === 0) {
            return Markup.inlineKeyboard([
                [Markup.button.callback('No Part 2 topics available yet.', 'no_op')],
                [Markup.button.callback('⬅️ Back to Parts', 'ielts_back_parts')]
            ]);
        }
        const buttons = Object.keys(ieltsQuestions.part2).map(topicKey => [
            Markup.button.callback(
                ieltsQuestions.part2[topicKey].title,
                `ielts_select_topic_part2_${topicKey}`
            )
        ]);
        buttons.push([Markup.button.callback('⬅️ Back to Parts', 'ielts_back_parts')]);
        return Markup.inlineKeyboard(buttons);
    };

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

    const getPracticeKeyboard = () => Markup.inlineKeyboard([
        [Markup.button.callback('⏹️ Stop Practice', 'ielts_stop_practice')]
    ]);

    // --- Логика ---
    const startIeltsPractice = (ctx) => {
        ctx.session = {};
        ctx.reply('Choose IELTS Speaking Part:', getPartsKeyboard());
    };

    const handleIeltsAnswerAndAskNext = async (ctx, userAnswerText) => {
        if (!ctx.session?.ieltsState?.waitingAnswer) return false;

        const state = ctx.session.ieltsState;

        if (userAnswerText && sharedFunctions.checkGrammar) {
            console.log(`[${ctx.chat?.id}] [IELTS Handler] Checking grammar for IELTS answer (Part ${state.part}).`);
            try {
                const grammarResult = await sharedFunctions.checkGrammar(userAnswerText);

                if (grammarResult) {
                    const { corrected_text, corrections } = grammarResult;
                    let replyMessage = "";
                    let replyOptions = { disable_notification: true, parse_mode: 'Markdown' };

                    if (corrections && corrections.length > 0) {
                        const correctionId = `session_corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                        
                        ctx.session = ctx.session || {};
                        ctx.session.corrections = ctx.session.corrections || {};
                        ctx.session.corrections[correctionId] = corrections;

                        replyMessage = `Your Answer Analysis:\n❌ Original:\n_"${userAnswerText}"_\n\n✅ Suggestion:\n_"${corrected_text}"_`;
                        
                        const callbackButtonData = `show_corrections_${correctionId}`;
                        console.log(`[${ctx.chat?.id}] [IELTS Handler] Generating button with callback_data: "${callbackButtonData}" and saving corrections under ID: "${correctionId}"`);

                        const keyboard = Markup.inlineKeyboard([
                            Markup.button.callback('Show Corrections', callbackButtonData)
                        ]);
                        replyOptions.reply_markup = keyboard.reply_markup;

                    } else if (corrected_text && corrected_text.trim().toLowerCase() !== userAnswerText.trim().toLowerCase()) {
                        replyMessage = `Your Answer Analysis:\n❌ Original:\n_"${userAnswerText}"_\n\n✅ Suggestion (minor changes):\n_"${corrected_text}"_`;
                    } else if (corrected_text) {
                        console.log(`[${ctx.chat?.id}] [IELTS Handler] Grammar check found no significant changes or IELTS answer is correct.`);
                    } else {
                        console.warn(`[${ctx.chat?.id}] [IELTS Handler] Grammar check returned result but no corrected_text for IELTS answer.`);
                    }

                    if (replyMessage) {
                        await sharedFunctions.replyToUser(ctx, replyMessage, replyOptions);
                    }

                } else {
                    console.warn(`[${ctx.chat?.id}] [IELTS Handler] Grammar check failed or returned null for IELTS answer.`);
                }
            } catch (e) {
                console.error(`[${ctx.chat?.id}] [IELTS Handler] Error during grammar check integration:`, e);
            }
        }

        const currentPartKey = `part${state.part}`;

        if (state.part === 2) {
            await sharedFunctions.replyToUser(ctx, "OK, that's the end of Part 2.");
            await ctx.reply("Now, let's move to Part 3 discussion questions, or you can stop here.", Markup.inlineKeyboard([
                [Markup.button.callback('Go to Part 3 Topics', 'ielts_select_part_3_direct')],
                [Markup.button.callback('Stop Practice', 'ielts_stop_practice')]
            ]));
            state.waitingAnswer = false;
            delete state.topicKey;
            return true;
        }

        if (state.part === 1 || state.part === 3) {
            const partQuestions = ieltsQuestions[currentPartKey];
            const topic = partQuestions?.[state.topicKey];

            if (!topic) {
                console.error(`[${ctx.chat?.id}] [IELTS Handler] IELTS state error: topic not found for Part ${state.part}`, state);
                ctx.session.ieltsState = null;
                await sharedFunctions.replyToUser(ctx, "Something went wrong with the topic. Stopping practice.");
                if (sharedFunctions.getMainMenuKeyboard) await ctx.reply('Choose an option:', sharedFunctions.getMainMenuKeyboard());
                return true;
            }

            const nextIndex = state.questionIndex + 1;

            if (nextIndex < topic.questions.length) {
                state.questionIndex = nextIndex;
                const nextQuestion = topic.questions[nextIndex];
                const totalQuestions = topic.questions.length;
                await sharedFunctions.replyToUser(ctx,
                    `📌 Topic: ${topic.title}\n❓ Question ${nextIndex + 1}/${totalQuestions}:\n\n${nextQuestion}`,
                    getPracticeKeyboard()
                );
            } else {
                await sharedFunctions.replyToUser(ctx, `🏁 Topic "${topic.title}" finished!`);
                state.waitingAnswer = false;
                delete state.topicKey;
                delete state.questionIndex;

                if (state.part === 1) {
                    await ctx.reply('You can choose another Part 1 Topic below, or just send me any message to chat! 😊', getPart1TopicsKeyboard());
                } else { // state.part === 3
                    await ctx.reply('You can choose another Part 3 Topic below, or stop the practice. 😉', getPart3TopicsKeyboard());
                }
            }
            return true;
        }

        console.error(`[${ctx.chat?.id}] [IELTS Handler] Reached end of handleIeltsAnswerAndAskNext without handling part:`, state);
        ctx.session.ieltsState = null;
        await sharedFunctions.replyToUser(ctx, "An unexpected error occurred in practice logic.");
        return false;
    };

    const register = (botInstance, commonFuncs) => {
        sharedFunctions = commonFuncs;

        botInstance.action(/ielts_(.+)/, async (ctx) => {
            console.log(`[${ctx.chat?.id}] [IELTS Action Handler] Received callback_query with data: "${ctx.callbackQuery.data}"`);
            
            const action = ctx.match[1];
            ctx.session ??= {};

            const tryEditMessage = async (text, keyboard) => {
                try {
                    if (ctx.callbackQuery.message) {
                        await ctx.editMessageText(text, keyboard).catch(async (e) => {
                            console.warn(`[${ctx.chat?.id}] [IELTS Action Handler] Failed to edit message, sending new reply. Error:`, e.description);
                            if (keyboard) await ctx.reply(text, keyboard); else await ctx.reply(text);
                        });
                    } else {
                        if (keyboard) await ctx.reply(text, keyboard); else await ctx.reply(text);
                    }
                } catch (e) {
                    console.error(`[${ctx.chat?.id}] [IELTS Action Handler] Error in tryEditMessage:`, e);
                    await ctx.reply(text || "An error occurred.").catch(()=>{});
                }
            };

            try {
                if (action === 'cancel' || action === 'back_parts' || action === 'stop_practice') {
                    let messageText = "IELTS practice cancelled or selection changed.";
                    if (action === 'stop_practice') messageText = 'IELTS practice stopped.';
                    if (action === 'back_parts') messageText = 'Returned to part selection.';

                    await tryEditMessage(messageText);
                    ctx.session.ieltsState = null;

                    if (sharedFunctions.getMainMenuKeyboard) {
                        await ctx.reply("Alright! Feel free to send any message or use the button below to start a practice.", sharedFunctions.getMainMenuKeyboard());
                    }
                    if (!ctx.answered) await ctx.answerCbQuery().catch(()=>{});
                    return;
                }

                if ((action.startsWith('select_part_') || action.startsWith('select_topic_')) && ctx.session?.ieltsState?.waitingAnswer) {
                    await ctx.answerCbQuery("Please stop the current practice first ('Stop Practice' button).", { show_alert: true });
                    return;
                }

                if (action === 'select_part_1') {
                    ctx.session.ieltsState = { part: 1 };
                    await tryEditMessage('Choose Part 1 Topic:', getPart1TopicsKeyboard());
                }
                else if (action === 'select_part_2') {
                    ctx.session.ieltsState = { part: 2 };
                    await tryEditMessage('Choose Part 2 Cue Card Topic:', getPart2TopicsKeyboard());
                }
                else if (action === 'select_part_3' || action === 'select_part_3_direct') {
                    if (!ieltsQuestions.part3 || Object.keys(ieltsQuestions.part3).length === 0) {
                        await ctx.answerCbQuery("Sorry, no Part 3 questions available yet.", { show_alert: true }); return;
                    }
                    ctx.session.ieltsState = { part: 3 };
                    await tryEditMessage('Choose Part 3 Discussion Topic:', getPart3TopicsKeyboard());
                }
                else if (action.startsWith('select_topic_part1_')) {
                    const topicKey = action.replace('select_topic_part1_', '');
                    const partState = ctx.session.ieltsState;
                    if (partState?.part === 1 && ieltsQuestions.part1[topicKey]?.questions?.length > 0) {
                        partState.topicKey = topicKey; partState.questionIndex = 0; partState.waitingAnswer = true;
                        const topic = ieltsQuestions.part1[topicKey];
                        const firstQuestion = topic.questions[0]; const totalQuestions = topic.questions.length;
                        await tryEditMessage(`📌 Topic: ${topic.title}\n❓ Question 1/${totalQuestions}:\n\n${firstQuestion}`, getPracticeKeyboard());
                    } else {
                        await ctx.answerCbQuery('Error selecting topic or topic is empty.');
                        ctx.session.ieltsState = null;
                        await tryEditMessage('Choose IELTS Speaking Part:', getPartsKeyboard()).catch(()=>{});
                    }
                }
                else if (action.startsWith('select_topic_part2_')) {
                    const topicKey = action.replace('select_topic_part2_', '');
                    const partState = ctx.session.ieltsState;
                    if (partState?.part === 2 && ieltsQuestions.part2[topicKey]?.card) {
                        partState.topicKey = topicKey;
                        partState.waitingAnswer = true;
                        const cueCardData = ieltsQuestions.part2[topicKey];
                        const cueCardText = cueCardData.card;
                        await tryEditMessage(`Part 2: Cue Card\nTopic: ${cueCardData.title}\n\nYou have 1 minute to prepare your answer.`);
                        await ctx.reply(cueCardText, getPracticeKeyboard());
                    } else {
                        await ctx.answerCbQuery('Error selecting Part 2 topic or topic is empty.');
                        ctx.session.ieltsState = null;
                        await tryEditMessage('Choose IELTS Speaking Part:', getPartsKeyboard()).catch(()=>{});
                    }
                }
                else if (action.startsWith('select_topic_part3_')) {
                    const topicKey = action.replace('select_topic_part3_', '');
                    const partState = ctx.session.ieltsState;
                    if (partState?.part === 3 && ieltsQuestions.part3[topicKey]?.questions?.length > 0) {
                        partState.topicKey = topicKey; partState.questionIndex = 0; partState.waitingAnswer = true;
                        const topic = ieltsQuestions.part3[topicKey];
                        const firstQuestion = topic.questions[0]; const totalQuestions = topic.questions.length;
                        await tryEditMessage(`📌 Topic: ${topic.title}\n❓ Question 1/${totalQuestions}:\n\n${firstQuestion}`, getPracticeKeyboard());
                    } else {
                        await ctx.answerCbQuery('Error selecting topic or topic is empty.');
                        ctx.session.ieltsState = null;
                        await tryEditMessage('Choose IELTS Speaking Part:', getPartsKeyboard()).catch(()=>{});
                    }
                } else {
                    console.warn(`[${ctx.chat?.id}] [IELTS Action Handler] Unhandled IELTS action: "${action}" from callback_data: "${ctx.callbackQuery.data}"`);
                }

                if (!ctx.answered) {
                    await ctx.answerCbQuery().catch(()=>{});
                }

            } catch (error) {
                console.error(`[${ctx.chat?.id}] [IELTS Action Handler] Error handling IELTS action:`, error);
                if (!ctx.answered) await ctx.answerCbQuery('Sorry, an error occurred.').catch(()=>{});
                ctx.session.ieltsState = null;
                try { await tryEditMessage('An error occurred. Choose IELTS Speaking Part:', getPartsKeyboard()).catch(()=>{}); } catch(e){}
            }
        });
    };

    module.exports = { register, startIeltsPractice, handleIeltsAnswerAndAskNext };