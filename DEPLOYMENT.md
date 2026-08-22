# TestForge deployment checklist

This checklist is the production contract for the current TestForge MVP.

## 1. Required services

- Node.js 22 or newer on the application host.
- A Supabase project for Auth, Postgres, Row Level Security, and private lesson-file Storage.
- An OpenAI API key if AI lesson-to-test generation will be enabled.

## 2. Required environment variables

Configure these in the deployment platform. Do not commit real values to GitHub.

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.6
```

`OPENAI_API_KEY` is server-only. Never give it a `NEXT_PUBLIC_` prefix.

## 3. Apply the Supabase schema

Run the complete `supabase/schema.sql` file in the Supabase SQL editor before the first production login. Re-running the file is intended to be safe for an existing TestForge project.

Verify afterward that:

- Row Level Security is enabled on all TestForge study-data tables.
- The private `lesson-files` bucket exists.
- Storage policies restrict object paths to the authenticated user's UUID prefix.
- `questions.topic` exists.
- The new-user profile trigger exists.

Do not expose a Supabase service-role key to the browser or add one to TestForge client configuration.

## 4. Configure Supabase Auth URLs

In Supabase Auth settings, set the production Site URL to the deployed TestForge origin and add any required production/preview redirect URLs used for email confirmation. A wrong Site URL can make sign-up confirmation links return users to the wrong environment.

## 5. Application build settings

Recommended platform settings:

```text
Install command: npm install
Build command: npm run build
Start command: npm start
Node runtime: 22+
```

CI runs `npm test` before `npm run build`. A release should not be deployed from a commit that fails either step.

## 6. Health check

Use:

```text
GET /api/health
```

A healthy application returns JSON with `status: "ok"` and `service: "testforge"`. The endpoint does not expose secrets or database contents.

## 7. Protected scan behavior

`POST /api/scan` is an authenticated endpoint. The browser attaches the signed-in Supabase access token and the server validates that token with Supabase Auth before reading the upload or calling OpenAI.

The endpoint also:

- disables response caching;
- accepts only PDF, DOCX, TXT, and Markdown sources;
- rejects source files larger than 25 MB;
- refuses to invent a correct answer when an imported answer key cannot be determined;
- limits generated assessments to 30 questions per request.

If `/api/scan` returns HTTP 401 in production, confirm that the user is signed in and that the production Supabase URL/anon key match the project used by the browser.

## 8. Pre-release smoke test

Run this flow in the production or production-like environment before announcing a release:

1. Create a new account and complete email confirmation if enabled.
2. Sign in and create a class.
3. Upload a small lesson file to the lesson library.
4. Reopen the private source.
5. Generate or extract a test from a source file.
6. Confirm that a question with no detectable answer key cannot be saved until a correct option is selected.
7. Complete and grade the test.
8. Reopen the completed attempt and verify correct/wrong answer styling and explanations.
9. Open Analytics and verify the grade, topic metrics, and recent score history.
10. Open Study Plan and create an adaptive practice test after enough reusable questions exist.
11. Grade the adaptive test and confirm the study plan recalculates.
12. Sign out, sign back in, and confirm all classes, lessons, tests, attempts, grades, and adaptive data remain available.

## 9. Production security checks

Before release:

- Confirm no `.env` file or real secret appears in Git history.
- Confirm only the public Supabase anon key is exposed to the browser.
- Confirm lesson files are private and opened through short-lived signed URLs.
- Confirm cross-user reads fail under RLS.
- Confirm `/api/scan` rejects requests without a valid bearer token.
- Confirm the app sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a restrictive Permissions Policy, and a strict-origin referrer policy.

## 10. Rollback

Keep the previously known-good deployment available until the smoke test passes. If a release fails:

1. Roll the application host back to the previous passing commit/deployment.
2. Avoid destructive database rollback unless a migration requires it. The current hardening phase adds no database migration.
3. Reproduce the failure on the feature branch, add a regression test, and require CI to pass before redeploying.

## Current release gate

A production candidate is considered ready for deployment preparation only when the latest GitHub Actions run completes both the automated unit-test step and the full Next.js production build successfully.
