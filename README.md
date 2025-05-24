📚 English Grammar & IELTS Speaking Bot
A Telegram bot designed to help users improve their English grammar and practice IELTS Speaking. It uses Google Gemini API for grammar checking and Google Cloud Speech API for voice recognition.

 

🚀 Features
Grammar Correction: Automatically corrects grammar, spelling, and style in English text or voice messages using the Gemini 2.0 Flash-Lite model.
IELTS Speaking Practice: Interactive practice for IELTS Speaking Parts 1, 2, and 3 with topic selection and grammar feedback.
Voice Recognition: Converts voice messages to text and provides grammar corrections.
User-Friendly Interface: Inline keyboards for easy navigation and detailed correction feedback.
📸 Screenshots
(Add screenshots here to showcase the bot in action. For example:)

A screenshot of grammar correction for a text message.
A screenshot of the IELTS Speaking practice session (e.g., selecting a topic or answering a question).
🛠️ Tech Stack
Node.js: Backend runtime environment.
Telegraf: Framework for building Telegram bots.
Google Generative AI (Gemini 2.0 Flash-Lite): For grammar and style corrections.
Google Cloud Speech API: For speech-to-text conversion.
dotenv: For managing environment variables.
📦 Installation
Clone the repository:
bash

Копировать
git clone https://github.com/<your-username>/<your-repo-name>.git
cd <your-repo-name>
Install dependencies:
bash

Копировать
npm install
Set up environment variables in a .env file:
env

Копировать
TELEGRAM_BOT_TOKEN=<your-telegram-bot-token>
GEMINI_API_KEY=<your-gemini-api-key>
GOOGLE_APPLICATION_CREDENTIALS=<path-to-your-google-cloud-credentials.json>
Run the bot:
bash

Копировать
npm start
🖥️ Usage
Start the bot on Telegram by sending /start.
Send a text or voice message to check grammar.
Choose "IELTS Practice" to start practicing IELTS Speaking (Parts 1, 2, or 3).
Follow the prompts to answer questions and receive grammar feedback.
📂 Project Structure
index.js: Main bot logic, including grammar checking and voice handling.
IELTS/ieltsHandler.js: Handles IELTS Speaking practice logic.
IELTS/ieltsQuestions.js: Contains IELTS questions for Parts 1, 2, and 3.
.env: Environment variables (not tracked in Git).
🤝 Contributing
Fork the repository.
Create a new branch: git checkout -b feature-name.
Make your changes and commit: git commit -m "Add feature".
Push to your branch: git push origin feature-name.
Create a pull request.
📜 License
This project is licensed under the MIT License - see the LICENSE file for details.

📬 Contact
For questions or suggestions, feel free to reach out via Telegram or email: your-email@example.com.
