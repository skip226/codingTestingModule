# TestForge security model

## Data isolation

TestForge uses Supabase Row Level Security for user-owned classes, lesson imports, tests, questions, attempts, and attempt answers. Policies compare the authenticated Supabase user ID with each row owner.

Lesson source files are stored in a private Supabase Storage bucket. Object paths begin with the owning user UUID and Storage policies require that first path segment to match `auth.uid()`.

## Browser-safe credentials

The browser receives only:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The Supabase anon key is expected to be public and is protected by RLS. A service-role key is not required by the application and must never be exposed to the browser.

`OPENAI_API_KEY` is server-only.

## AI scan endpoint

`POST /api/scan` requires a Supabase bearer access token. The server verifies the token against Supabase Auth before parsing a file or making an OpenAI request. This prevents an unauthenticated caller from using the deployed TestForge server as an open AI-generation proxy.

The endpoint rejects unsupported file extensions and files larger than 25 MB and returns responses with `Cache-Control: no-store`.

## Assessment integrity

Imported tests no longer assume option A is correct when an answer key cannot be reliably parsed. Unresolved questions use `correctIndex: -1` in the temporary review state. Persistence validation rejects those questions until the user explicitly selects a valid correct answer.

Persistence also validates that:

- every question has non-empty text;
- every question has at least two non-empty choices;
- every saved correct-answer index points to an existing choice;
- every graded attempt contains one valid answer per question.

If source-file persistence succeeds but linked test creation fails, TestForge attempts to remove the newly created import row and private Storage object so failed operations do not leave unnecessary source records behind.

## Response hardening

The Next.js application sends these baseline headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

A stricter Content Security Policy can be added after the production domains for the app, Supabase project, and any telemetry provider are finalized.

## Dependency and CI policy

The release workflow runs automated behavioral tests before the production build. The protected areas currently covered include parser answer-key behavior, publishing/attempt validation, performance calculations, and adaptive question prioritization.

A known regression should receive a test before a fix is considered release-ready.

## Reporting a vulnerability

Do not post API keys, user data, private lesson files, access tokens, or exploit details in a public issue. Use a private repository security advisory or another private channel controlled by the repository owner for sensitive reports.
