// Файл: SPEECH/IELTS/ieltsQuestions.js
// Версия с обновленными вопросами Part 2 и Part 3

const ieltsQuestions = {
    part1: {
      work_studies: {
        title: "Work and studies, schools and workplaces",
        questions: [
          "Do you work or are you a student?",
          "What work do you do? What subjects are you studying?",
          "Why did you choose that job?",
          "Why did you choose to study that subject?",
          "Do you like your job?",
          "Is there anything you dislike about your job?",
          "What do you like about your studies?",
          "What do you dislike about your studies?",
          "What was your dream job when you were young?",
          "Have you changed your mind on your dream job?"
        ]
      },
      hometown: {
          title: "Hometown",
          questions: [
              "Where is your hometown?",
              "What do you like most about your hometown?",
              "What is the oldest part of your hometown?",
              "Has your hometown changed much since you were a child?"
          ]
      }
    },
    part2: {
        // Используем ключ для темы/карточки
        energetic_person: {
          title: "Energetic person", // Короткий заголовок для кнопки
          // Полный текст карточки
          card: "Topic: Energetic person (January - August 2025)\n\nDescribe an energetic person you know.\n\nYou should say:\n*   who this person is, how you know this person\n*   why you consider this person energetic\n*   how you feel about this person"
        }
        // Сюда можно будет добавить другие карточки Part 2 с уникальными ключами:
        // , another_topic_key: { title: "Another Topic", card: "Describe..." }
      },
    part3: {
      physical_work_robots: {
        title: "Physical work, robots (Jan - Aug 2025)",
        questions: [
          "What's the difference between payment for mental work and that for physical work?",
          "Can physical workers receive higher salaries in the future?",
          "What kinds of jobs need a lot of physical work?",
          "Do you think that nowadays all jobs could be done by robots?",
          "Do you think machines could replace human workers in the future?",
          "What are the benefits of replacing human workers with robots?",
          "How have robots and computers changed the way people work?",
          "Why are so many processes controlled by robots instead of people?"
        ]
      }
      // Сюда можно будет добавить другие темы Part 3
    }
  };
  
  module.exports = ieltsQuestions;