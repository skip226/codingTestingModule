# TestForge

TestForge is a modern virtual testing environment that converts uploaded lesson plans and tests into interactive, graded practice exams.

## MVP features

- Private user accounts with email/password authentication
- Cloud-synced classes, tests, import records, attempts, and grades
- PostgreSQL persistence through Supabase
- Row Level Security so users can access only their own study data
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
- Store per-question answer results for completed tests
- Calculate and display an overall grade near the user profile

## Data model

TestForge now uses a normalized cloud data model:

`User -> Classes -> Lesson Imports -> Tests -> Questions -> Attempts -> Attempt Answers`

The SQL schema lives at `supabase/schema.sql`. Every study-data table includes a user owner and has Row Level Security enabled.

## Import modes

### Smart
TestForge first looks for structured multiple-choice questions in the source file. When it finds a real test, those questions are preserved. When the file looks like lesson material instead, TestForge uses AI to build a new assessment.

### Extract existing test
Only searches the source document for existing numbered multiple-choice questions, answer keys, and explanations. AI generation is skipped.

### AI generate from lesson
Uses the uploaded lesson/study material as the source of truth and creates a new multiple-choice assessment. The generated questions are always sent to the edit/review screen before they can be saved.

## Local setup

Requirements: Node.js 22 or newer, an OpenAI API key for AI generation, and a Supabase project for authentication/database persistence.

```bash
npm install
cp .env.example .env.local
npm run dev
```

### 1. Configure Supabase

Create a Supabase project, open its SQL editor, and run the complete contents of:

```text
supabase/schema.sql
```

Then copy the project URL and anon/public key into `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

The anon key is intended for browser use. TestForge protects private records with Row Level Security policies tied to the authenticated user.

### 2. Configure OpenAI

Add your server-side OpenAI key to `.env.local`:

```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.6
```

The OpenAI API key is used only by the server route and must never be exposed with a `NEXT_PUBLIC_` prefix or committed to GitHub.

If `OPENAI_API_KEY` is not configured, structured test extraction still works. Smart mode will explain that AI generation needs to be configured when a lesson file does not already contain a test.

## Authentication behavior

Users can create an account, sign in, and sign out from the TestForge interface. If email confirmation is enabled in Supabase Auth, a new user is instructed to confirm their email before signing in. A profile row is created automatically by the database trigger in `supabase/schema.sql`.

## Cloud persistence behavior

Creating a class writes directly to the authenticated user's `classes` records. Saving an imported/generated assessment creates an import record, test, and normalized question rows. Grading a test writes the attempt summary plus one `attempt_answers` row for every question, allowing future analytics and detailed review pages without relying on browser storage.

## AI generation behavior

The generator uses the lesson as its source of truth, requests four-option multiple-choice questions, and returns a correct-answer index plus an explanation for every question. The current server route limits generated assessments to 30 questions per upload and shortens very large extracted documents before sending them for generation.

## Current persistence limitation

TestForge stores import metadata and generated/extracted assessment content in Postgres, but it does not yet upload the original source file itself into Supabase Storage. Adding source-file storage and a lesson library is a logical future enhancement.

## Development

Development is managed through feature branches and pull requests. GitHub Actions runs the Next.js production build on pushes to `feat/testforge-mvp` and on pull requests targeting `main`.
