# 📚 English Grammar & IELTS Speaking Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Telegram bot designed to help users improve their English grammar and practice IELTS Speaking. It leverages the power of **Google Gemini API** for advanced grammar checking and **Google Cloud Speech API** for accurate voice recognition.

---

## 🚀 Features

-   ✅ **Grammar Correction**: Automatically corrects grammar, spelling, and style in English text or voice messages using the Gemini Flash model.
-   🗣️ **IELTS Speaking Practice**: Interactive practice for IELTS Speaking Parts 1, 2, and 3 with dynamic topic selection and detailed grammar feedback on your answers.
-   🎙️ **Voice Recognition**: Seamlessly converts voice messages to text and provides grammar corrections for spoken English.
-   🧩 **User-Friendly Interface**: Intuitive inline keyboards for easy navigation and clear, detailed correction feedback.

---

## 📸 Screenshots

_✨ Showcase your bot in action! Replace these placeholders with actual screenshots._

| Grammar Correction (Text)                                 | IELTS Speaking Practice (Topic Selection)                 | IELTS Feedback                                     |
| :-------------------------------------------------------- | :-------------------------------------------------------- | :------------------------------------------------- |
| _[Link to Screenshot 1: Grammar correction for text]_    | _[Link to Screenshot 2: IELTS topic selection]_           | _[Link to Screenshot 3: IELTS feedback on answer]_ |
| *Example: A user sends a text, bot replies with corrections.* | *Example: Bot presents IELTS Part 1 topics via keyboard.* | *Example: Bot provides grammar feedback on a spoken answer.* |

---

## 🛠️ Tech Stack

-   🟩 **Node.js**: Backend JavaScript runtime environment.
-   🤖 **Telegraf**: Modern framework for building Telegram bots.
-   🧠 **Google Generative AI (Gemini Flash)**: For sophisticated grammar and style corrections.
-   🗣️ **Google Cloud Speech-to-Text API**: For converting audio voice messages to text.
-   🔒 **dotenv**: For managing environment variables securely.

---

## 📦 Installation

Follow these steps to set up the project locally:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/<your-username>/<your-repo-name>.git
    cd <your-repo-name>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Create a `.env` file in the root of your project and add the following variables. You can copy `.env.example` if you create one.

    ```env
    # Telegram Bot Token from BotFather
    TELEGRAM_BOT_TOKEN=<your-telegram-bot-token>

    # Google Gemini API Key
    GEMINI_API_KEY=<your-gemini-api-key>

    # Path to your Google Cloud service account key JSON file
    # This file is used by Google Cloud Speech-to-Text API
    GOOGLE_APPLICATION_CREDENTIALS=<path-to-your-google-cloud-credentials.json>
    ```
    *   `TELEGRAM_BOT_TOKEN`: Get this from BotFather on Telegram.
    *   `GEMINI_API_KEY`: Obtain this from Google AI Studio.
    *   `GOOGLE_APPLICATION_CREDENTIALS`: This is the absolute or relative path to the JSON file you download from Google Cloud Console after creating a service account with "Cloud Speech-to-Text API" permissions.

4.  **Run the bot:**
    ```bash
    npm start
    ```
    Or, for development with automatic restarts (if you have `nodemon` installed):
    ```bash
    npm run dev
    ```
    _(Ensure you add a `dev` script to your `package.json`, e.g., `"dev": "nodemon index.js"`)_

---

## 🖥️ Usage

1.  **Start the bot**: Open Telegram and send `/start` to your bot.
2.  **Grammar Check**:
    *   Send any English text message for immediate grammar, spelling, and style corrections.
    *   Send a voice message in English. The bot will transcribe it and provide corrections.
3.  **IELTS Speaking Practice**:
    *   Use the inline keyboard to select "IELTS Practice".
    *   Choose the part you want to practice (Part 1, Part 2, or Part 3).
    *   The bot will provide topics or questions.
    *   Answer the questions (text or voice).
---

---

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
_(Note: You'll need to create a `LICENSE` file with the MIT License text if you haven't already)._

---

## 📬 Contact

For questions, suggestions, or feedback, feel free to reach out:

-   **Telegram**: `@your_telegram_username` (Optional)
-   **Email**: `your-email@example.com`

---
    *   Receive tailored grammar feedback on your responses.

---
