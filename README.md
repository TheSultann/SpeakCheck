
## How `Show Corrections` Works

When the bot provides a corrected version of your text (either from a direct message or an IELTS answer), it may include a "Show Corrections" button.

*   **Storage:** The detailed corrections (original phrase, corrected phrase, explanation) are temporarily stored in the user's session data on the server.
*   **Button Click:** When you click "Show Corrections", the bot retrieves these details from the session.
*   **Display:** The corrections are then formatted and sent as a new message, clearly listing each error and its fix. For better context, this message is sent as a reply to the "Your Answer Analysis..." message.
*   **Cleanup:** After displaying, the specific set of corrections is usually removed from the session to save space.

## Future Enhancements (Ideas)

*   [ ] Persistent session storage (e.g., Redis, database) instead of `MemorySessionStore`.
*   [ ] More diverse IELTS questions and topics.
*   [ ] Option to get feedback on pronunciation (would require more advanced speech analysis).
*   [ ] User accounts/profiles to track progress.
*   [ ] More granular feedback on style, tone, or vocabulary for IELTS.
*   [ ] Support for other languages for grammar check (if Gemini model supports it well).

## Contributing

Contributions are welcome! If you have suggestions for improvements or new features, feel free to open an issue or submit a pull request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## License

This project is licensed under the MIT License. See the `LICENSE` file (you'll need to create one if you want to specify a license) for more details.

## Acknowledgments

*   Telegraf.js community
*   Google for Gemini and Cloud Speech-to-Text APIs
*   [Any other libraries or resources you found particularly helpful]
