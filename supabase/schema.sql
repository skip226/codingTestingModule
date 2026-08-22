-- TestForge database + private lesson-file storage schema
-- Run this in the Supabase SQL editor for the project connected to TestForge.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.lesson_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  file_name text not null,
  source_mode text not null default 'extracted',
  title text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

-- Make this migration safe for projects that ran an earlier TestForge schema.
alter table public.lesson_imports add column if not exists storage_path text;
alter table public.lesson_imports add column if not exists mime_type text;
alter table public.lesson_imports add column if not exists size_bytes bigint;
alter table public.lesson_imports drop constraint if exists lesson_imports_source_mode_check;
alter table public.lesson_imports
  add constraint lesson_imports_source_mode_check
  check (source_mode in ('extracted', 'generated', 'unavailable', 'stored'));

create table if not exists public.tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  import_id uuid references public.lesson_imports(id) on delete set null,
  title text not null check (char_length(trim(title)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  test_id uuid not null references public.tests(id) on delete cascade,
  prompt text not null,
  options jsonb not null,
  correct_index integer not null check (correct_index >= 0),
  explanation text not null default '',
  topic text not null default 'General',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.questions add column if not exists topic text not null default 'General';
update public.questions set topic = 'General' where topic is null or char_length(trim(topic)) = 0;

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  test_id uuid not null references public.tests(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  score integer not null check (score >= 0),
  total integer not null check (total > 0),
  answers jsonb not null default '[]'::jsonb,
  completed_at timestamptz not null default now()
);

create table if not exists public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_index integer not null check (selected_index >= 0),
  is_correct boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists classes_user_id_idx on public.classes(user_id);
create index if not exists lesson_imports_user_id_idx on public.lesson_imports(user_id);
create index if not exists lesson_imports_class_id_idx on public.lesson_imports(class_id);
create index if not exists lesson_imports_storage_path_idx on public.lesson_imports(storage_path);
create index if not exists tests_user_id_idx on public.tests(user_id);
create index if not exists tests_class_id_idx on public.tests(class_id);
create index if not exists tests_import_id_idx on public.tests(import_id);
create index if not exists questions_test_id_idx on public.questions(test_id);
create index if not exists questions_topic_idx on public.questions(topic);
create index if not exists attempts_user_id_idx on public.attempts(user_id);
create index if not exists attempts_test_id_idx on public.attempts(test_id);
create index if not exists attempt_answers_attempt_id_idx on public.attempt_answers(attempt_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.lesson_imports enable row level security;
alter table public.tests enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;

-- Re-running this file is safe: replace policies by dropping them first.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "classes_own_all" on public.classes;
create policy "classes_own_all" on public.classes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "lesson_imports_own_all" on public.lesson_imports;
create policy "lesson_imports_own_all" on public.lesson_imports for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "tests_own_all" on public.tests;
create policy "tests_own_all" on public.tests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "questions_own_all" on public.questions;
create policy "questions_own_all" on public.questions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "attempts_own_all" on public.attempts;
create policy "attempts_own_all" on public.attempts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "attempt_answers_own_all" on public.attempt_answers;
create policy "attempt_answers_own_all" on public.attempt_answers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private source-file bucket. Files are stored under <user-id>/<class-id>/<unique-name>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-files',
  'lesson-files',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "lesson_files_select_own" on storage.objects;
drop policy if exists "lesson_files_insert_own" on storage.objects;
drop policy if exists "lesson_files_update_own" on storage.objects;
drop policy if exists "lesson_files_delete_own" on storage.objects;

create policy "lesson_files_select_own"
on storage.objects for select
using (
  bucket_id = 'lesson-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "lesson_files_insert_own"
on storage.objects for insert
with check (
  bucket_id = 'lesson-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "lesson_files_update_own"
on storage.objects for update
using (
  bucket_id = 'lesson-files'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'lesson-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "lesson_files_delete_own"
on storage.objects for delete
using (
  bucket_id = 'lesson-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);