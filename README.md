# TestForge

TestForge is a modern virtual testing environment that converts uploaded lesson plans and tests into interactive, graded practice exams.

## MVP features

- Private user accounts with email/password authentication
- Cloud-synced classes, saved lessons, tests, attempts, grades, and analytics
- PostgreSQL persistence through Supabase
- Private original-file storage through Supabase Storage
- Row Level Security so users can access only their own study data and source files
- Organize content by class
- Upload PDF, DOCX, TXT, and Markdown lesson/test files
- Save a lesson without generating a test yet
- Reopen stored lesson files using short-lived signed URLs
- Generate multiple assessments from the same stored lesson without uploading it again
- Smart import mode that preserves existing tests when structured questions are detected
- AI lesson-to-test generation when an upload contains study material instead of a ready-made assessment
- Choose 5, 10, 15, 20, or 30 generated questions
- Choose beginner, intermediate, or advanced generated difficulty
- AI-generated topic labels for performance analysis
- Review and edit every extracted or generated question, answer, explanation, and topic before publishing
- Run tests in a polished virtual testing interface
- Score completed tests automatically
- Visually mark correct answers and cross out incorrect selected answers
- Show a brief explanation under each graded answer
- Reopen any completed test for a read-only question-by-question review
- Show attempt-specific missed-topic study targets during completed-test review
- Retake a test directly from its completed review
- Track weighted overall grade, average test score, questions answered, and recent score trend
- Visualize the last eight completed scores chronologically
- Compare grades across classes
- Surface strongest topics and weakest study targets
- Build a ranked **Study Next** queue for the selected class
- Assemble persistent adaptive practice tests from the user's question bank
- Weight adaptive sessions toward weak and recently missed topics while retaining stronger material
- Recalculate the personalized study plan after every graded attempt
- Store per-question answer results for completed tests

## Data model

TestForge uses a normalized cloud data model:

`User -> Classes -> Lesson Sources -> Tests -> Questions -> Attempts -> Attempt Answers`

The SQL schema lives at `supabase/schema.sql`. Every study-data table includes a user owner and has Row Level Security enabled. Test rows can point back to their originating lesson source, which allows one source file to support many different generated assessments.

Questions also include a `topic` field. Newly AI-generated questions receive concise concept labels automatically; extracted or older questions default to **General** unless the user edits the topic before saving.

Adaptive practice tests use the same `tests`, `questions`, `attempts`, and `attempt_answers` records as regular assessments. They are therefore persistent, reviewable, and automatically become new evidence for future personalization.

## Performance analytics

The Analytics view calculates performance directly from saved tests and attempts:

- **Overall grade** is weighted by the number of questions answered.
- **Average test score** treats each completed attempt as one score.
- **Recent trend** compares the latest three completed tests with the previous three.
- **Recent score chart** visualizes up to the last eight completed tests from oldest to newest.
- **Class performance** shows weighted accuracy and test volume by class.
- **Topic accuracy** groups answered questions by their saved topic label.
- **Strongest topic** highlights the highest-accuracy concept.
- **Best next study target** highlights the lowest-accuracy concept.

Completed-test history rows are interactive. Opening one shows the original question, the student's selected answer, the correct answer, the saved explanation, and the question topic. The review also summarizes which topics were missed on that specific attempt so the user has an immediate study target. Reviews are read-only and do not create another attempt unless the user explicitly chooses **Retake test**.

## Adaptive testing and Study Next

The **Study Plan** view turns the saved analytics into a class-specific practice queue. Each topic is ranked using its current accuracy, how much evidence exists for the topic, and how many reusable questions are available in the question bank.

Topic states are presented as:

- **Focus now** for concepts below 70% accuracy.
- **Reinforce** for concepts from 70% through 84%.
- **Maintain** for concepts at 85% or better.
- **Build baseline** when the student has questions available but has not answered enough material in that topic yet.

When **Start adaptive practice** is selected, TestForge assembles a new persistent test from the selected class. The first adaptive version uses the existing question bank rather than making another AI request. Roughly 70% of the session emphasizes weak, unseen, or recently missed questions and roughly 30% keeps stronger material in rotation for retention. Duplicate prompts are removed from the candidate bank.

Adaptive tests are saved to Supabase before they begin, then run through the normal TestForge grading environment. Once graded, the new attempt immediately changes topic accuracy and the next Study Next ranking. This creates a closed feedback loop without requiring a separate adaptive-session database.

The current adaptive engine reuses existing questions. A later enhancement can ask AI to create fresh weak-topic variants from saved lesson sources when the student needs novel practice rather than repetition.

## Lesson library

Each class has a reusable lesson library. A user can either:

1. Store a lesson file now and generate tests from it later, or
2. Use Import / Generate normally and preserve the original source automatically when the resulting test is saved.

Original files are placed in the private `lesson-files` Supabase Storage bucket under a user-specific path. The bucket is not public. Storage policies allow access only when the first path segment matches the authenticated user's ID.

The app uses a short-lived signed URL when a user chooses **Open source**. When **Generate new test** is selected, the private file is downloaded through the authenticated Supabase client and sent back through TestForge's assessment-generation flow. The existing lesson row is reused instead of creating a duplicate source record.

Older import records created before source-file storage was added remain visible as **Metadata only** records, but they cannot be reopened or regenerated unless the source is uploaded again.

## Import modes

### Smart
TestForge first looks for structured multiple-choice questions in the source file. When it finds a real test, those questions are preserved. When the file looks like lesson material instead, TestForge uses AI to build a new assessment.

### Extract existing test
Only searches the source document for existing numbered multiple-choice questions, answer keys, explanations, and optional `Topic:` lines. AI generation is skipped.

### AI generate from lesson
Uses the uploaded lesson/study material as the source of truth and creates a new multiple-choice assessment. The generated questions are always sent to the edit/review screen before they can be saved.

## Local setup

Requirements: Node.js 22 or newer, an OpenAI API key for AI generation, and a Supabase project for authentication, database persistence, and private file storage.

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

Re-run the schema if the project was created during an earlier TestForge phase. The schema is designed to safely add newer fields such as lesson-storage metadata and `questions.topic`, create/update the private `lesson-files` bucket, and install its storage policies.

Then copy the project URL and anon/public key into `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

The anon key is intended for browser use. TestForge protects private records and Storage objects with Row Level Security policies tied to the authenticated user.

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

Creating a class writes directly to the authenticated user's `classes` records. Saving an imported/generated assessment preserves the source file, creates a lesson-source record, creates the linked test, and stores normalized question rows including topic labels. Grading a test writes the attempt summary plus one `attempt_answers` row for every question. Adaptive practice uses those same tables and requires no additional database migration beyond the current schema.

## AI generation behavior

The generator uses the lesson as its source of truth, requests four-option multiple-choice questions, and returns a correct-answer index, explanation, and concise topic label for every question. The current server route limits generated assessments to 30 questions per generation and shortens very large extracted documents before sending them for generation.

## Storage limits

The supplied Supabase schema configures the lesson bucket with a 25 MB per-file limit and allows PDF, DOCX, TXT, and Markdown MIME types. Those values can be adjusted in Supabase later if the product needs larger textbooks or additional source formats.

## Development

Development is managed through feature branches and pull requests. GitHub Actions runs the Next.js production build on pushes to `feat/testforge-mvp` and on pull requests targeting `main`.
