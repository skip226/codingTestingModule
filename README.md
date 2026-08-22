# TestForge

TestForge is a modern virtual testing environment that converts uploaded lesson plans and tests into interactive, graded practice exams.

## MVP features

- Organize content by class
- Upload PDF, DOCX, TXT, and Markdown lesson/test files
- Smart import mode that preserves existing tests when structured questions are detected
- AI lesson-to-test generation when an upload contains study material instead of a ready-made assessment
- Choose 5, 10, 15, 20, or 30 generated questions
- Choose beginner, intermediate, or advanced generated difficulty
- Review and edit every extracted or generated question before publishing
- Run tests in a polished virtual testing interface
- Score completed tests automatically
- Visually mark correct answers and cross out incorrect selected answers
- Show a brief explanation under each graded answer
- Store completed tests and grades in browser storage for the MVP
- Calculate and display an overall grade near the user profile

## Import modes

### Smart
TestForge first looks for structured multiple-choice questions in the source file. When it finds a real test, those questions are preserved. When the file looks like lesson material instead, TestForge uses AI to build a new assessment.

### Extract existing test
Only searches the source document for existing numbered multiple-choice questions, answer keys, and explanations. AI generation is skipped.

### AI generate from lesson
Uses the uploaded lesson/study material as the source of truth and creates a new multiple-choice assessment. The generated questions are always sent to the edit/review screen before they can be saved.

## Local setup

Requirements: Node.js 22 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add your server-side OpenAI API key to `.env.local`:

```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.6
```

The API key is used only by the server route and must never be exposed with a `NEXT_PUBLIC_` prefix or committed to GitHub.

If `OPENAI_API_KEY` is not configured, structured test extraction still works. Smart mode will explain that AI generation needs to be configured when a lesson file does not already contain a test.

## AI generation behavior

The generator uses the lesson as its source of truth, requests four-option multiple-choice questions, and returns a correct-answer index plus an explanation for every question. The current server route limits generated assessments to 30 questions per upload and shortens very large extracted documents before sending them for generation.

## Next development phase

The next major phase is persistent user accounts and database storage so classes, tests, uploads, generated assessments, grades, and completed attempts follow the user across devices.

Development is managed through feature branches and pull requests.
