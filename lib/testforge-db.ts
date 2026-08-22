import type { SupabaseClient } from '@supabase/supabase-js';
import { assertCompleteAttempt, assertPublishableQuestions } from './testforge-validation';

const LESSON_BUCKET = 'lesson-files';

export type Question = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  topic: string;
};
export type Test = { id: string; classId: string; importId: string | null; title: string; questions: Question[]; createdAt: string };
export type Attempt = { id: string; testId: string; classId: string; title: string; score: number; total: number; completedAt: string; answers: number[] };
export type ClassSection = { id: string; name: string };
export type LessonSource = {
  id: string;
  classId: string;
  fileName: string;
  title: string;
  sourceMode: string;
  storagePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
};
export type Workspace = { profileName: string; classes: ClassSection[]; lessons: LessonSource[]; tests: Test[]; attempts: Attempt[] };

type QuestionRow = { id: string; prompt: string; options: unknown; correct_index: number; explanation: string; topic: string | null; position: number };
type TestRow = { id: string; class_id: string; import_id: string | null; title: string; created_at: string; questions?: QuestionRow[] | null };
type LessonRow = {
  id: string;
  class_id: string;
  file_name: string;
  title: string | null;
  source_mode: string;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

function defaultMimeType(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (name.endsWith('.md')) return 'text/markdown';
  if (name.endsWith('.txt')) return 'text/plain';
  return file.type || 'application/octet-stream';
}

function safeFileName(name: string) {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'lesson-file';
}

function lessonFromRow(row: LessonRow): LessonSource {
  return {
    id: row.id,
    classId: row.class_id,
    fileName: row.file_name,
    title: row.title || row.file_name.replace(/\.[^.]+$/, ''),
    sourceMode: row.source_mode,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    createdAt: row.created_at
  };
}

function questionFromRow(question: QuestionRow): Question {
  return {
    id: question.id,
    prompt: question.prompt,
    options: Array.isArray(question.options) ? question.options.map(String) : [],
    correctIndex: question.correct_index,
    explanation: question.explanation,
    topic: question.topic?.trim() || 'General'
  };
}

async function removeLessonSource(client: SupabaseClient, lesson: LessonSource) {
  const failures: string[] = [];
  const { error: rowError } = await client.from('lesson_imports').delete().eq('id', lesson.id);
  if (rowError) return [rowError.message];

  if (lesson.storagePath) {
    const { error: storageError } = await client.storage.from(LESSON_BUCKET).remove([lesson.storagePath]);
    if (storageError) failures.push(storageError.message);
  }
  return failures;
}

export async function loadWorkspace(client: SupabaseClient, userId: string): Promise<Workspace> {
  const [profileResult, classesResult, lessonsResult, testsResult, attemptsResult] = await Promise.all([
    client.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
    client.from('classes').select('id,name,created_at').order('created_at', { ascending: true }),
    client.from('lesson_imports').select('id,class_id,file_name,title,source_mode,storage_path,mime_type,size_bytes,created_at').order('created_at', { ascending: false }),
    client.from('tests').select('id,class_id,import_id,title,created_at,questions(id,prompt,options,correct_index,explanation,topic,position)').order('created_at', { ascending: false }),
    client.from('attempts').select('id,test_id,class_id,title,score,total,answers,completed_at').order('completed_at', { ascending: false })
  ]);
  const error = profileResult.error || classesResult.error || lessonsResult.error || testsResult.error || attemptsResult.error;
  if (error) throw error;

  const classes: ClassSection[] = (classesResult.data || []).map((row) => ({ id: row.id, name: row.name }));
  const lessons: LessonSource[] = ((lessonsResult.data || []) as LessonRow[]).map(lessonFromRow);
  const tests: Test[] = ((testsResult.data || []) as TestRow[]).map((row) => ({
    id: row.id,
    classId: row.class_id,
    importId: row.import_id,
    title: row.title,
    createdAt: row.created_at,
    questions: (row.questions || []).slice().sort((a, b) => a.position - b.position).map(questionFromRow)
  }));
  const attempts: Attempt[] = (attemptsResult.data || []).map((row) => ({
    id: row.id,
    testId: row.test_id,
    classId: row.class_id,
    title: row.title,
    score: row.score,
    total: row.total,
    completedAt: row.completed_at,
    answers: Array.isArray(row.answers) ? row.answers.map(Number) : []
  }));
  return { profileName: profileResult.data?.full_name || 'Student', classes, lessons, tests, attempts };
}

export async function createClass(client: SupabaseClient, userId: string, name: string): Promise<ClassSection> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Class name cannot be empty.');
  const { data, error } = await client.from('classes').insert({ user_id: userId, name: trimmed }).select('id,name').single();
  if (error) throw error;
  return { id: data.id, name: data.name };
}

export async function saveLessonFile(
  client: SupabaseClient,
  userId: string,
  classId: string,
  file: File,
  options?: { title?: string; sourceMode?: string }
): Promise<LessonSource> {
  if (file.size > 25 * 1024 * 1024) throw new Error('Lesson files must be 25 MB or smaller.');
  const storagePath = `${userId}/${classId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const mimeType = defaultMimeType(file);
  const { error: uploadError } = await client.storage.from(LESSON_BUCKET).upload(storagePath, file, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await client.from('lesson_imports').insert({
    user_id: userId,
    class_id: classId,
    file_name: file.name,
    source_mode: options?.sourceMode || 'stored',
    title: options?.title?.trim() || file.name.replace(/\.[^.]+$/, ''),
    storage_path: storagePath,
    mime_type: mimeType,
    size_bytes: file.size
  }).select('id,class_id,file_name,title,source_mode,storage_path,mime_type,size_bytes,created_at').single();

  if (error) {
    await client.storage.from(LESSON_BUCKET).remove([storagePath]);
    throw error;
  }
  return lessonFromRow(data as LessonRow);
}

export async function downloadLessonFile(client: SupabaseClient, lesson: LessonSource): Promise<File> {
  if (!lesson.storagePath) throw new Error('This older lesson record does not have a stored source file.');
  const { data, error } = await client.storage.from(LESSON_BUCKET).download(lesson.storagePath);
  if (error) throw error;
  return new File([data], lesson.fileName, { type: lesson.mimeType || data.type || 'application/octet-stream' });
}

export async function createLessonSignedUrl(client: SupabaseClient, lesson: LessonSource, download = false) {
  if (!lesson.storagePath) throw new Error('This older lesson record does not have a stored source file.');
  const options = download ? { download: lesson.fileName } : undefined;
  const { data, error } = await client.storage.from(LESSON_BUCKET).createSignedUrl(lesson.storagePath, 300, options);
  if (error) throw error;
  return data.signedUrl;
}

export async function createTestForLesson(client: SupabaseClient, userId: string, lesson: LessonSource, title: string, questions: Question[]): Promise<Test> {
  assertPublishableQuestions(questions);
  const safeTitle = title.trim() || 'Untitled Test';
  const { data: testRow, error: testError } = await client.from('tests')
    .insert({ user_id: userId, class_id: lesson.classId, import_id: lesson.id, title: safeTitle })
    .select('id,class_id,import_id,title,created_at').single();
  if (testError) throw testError;

  const questionRows = questions.map((question, position) => ({
    user_id: userId,
    test_id: testRow.id,
    prompt: question.prompt.trim(),
    options: question.options.map((option) => option.trim()),
    correct_index: question.correctIndex,
    explanation: question.explanation.trim(),
    topic: question.topic?.trim() || 'General',
    position
  }));
  const { data: savedQuestions, error: questionError } = await client.from('questions')
    .insert(questionRows).select('id,prompt,options,correct_index,explanation,topic,position');
  if (questionError) {
    await client.from('tests').delete().eq('id', testRow.id);
    throw questionError;
  }
  return {
    id: testRow.id,
    classId: testRow.class_id,
    importId: testRow.import_id,
    title: testRow.title,
    createdAt: testRow.created_at,
    questions: ((savedQuestions || []) as QuestionRow[]).slice().sort((a, b) => a.position - b.position).map(questionFromRow)
  };
}

export async function createTestFromImport(
  client: SupabaseClient,
  userId: string,
  classId: string,
  title: string,
  questions: Question[],
  source: { file: File; sourceMode: string }
): Promise<{ test: Test; lesson: LessonSource }> {
  assertPublishableQuestions(questions);
  const lesson = await saveLessonFile(client, userId, classId, source.file, { title, sourceMode: source.sourceMode || 'extracted' });
  try {
    const test = await createTestForLesson(client, userId, lesson, title, questions);
    return { test, lesson };
  } catch (error) {
    const cleanupFailures = await removeLessonSource(client, lesson);
    if (cleanupFailures.length) console.error('TestForge cleanup failed after test creation error', cleanupFailures);
    throw error;
  }
}

export async function recordAttempt(client: SupabaseClient, userId: string, test: Test, answers: number[]): Promise<Attempt> {
  assertPublishableQuestions(test.questions);
  assertCompleteAttempt(test.questions, answers);
  const score = test.questions.reduce((total, question, index) => total + (answers[index] === question.correctIndex ? 1 : 0), 0);
  const { data: attemptRow, error: attemptError } = await client.from('attempts').insert({
    user_id: userId,
    test_id: test.id,
    class_id: test.classId,
    title: test.title,
    score,
    total: test.questions.length,
    answers
  }).select('id,test_id,class_id,title,score,total,answers,completed_at').single();
  if (attemptError) throw attemptError;

  const answerRows = test.questions.map((question, index) => ({
    user_id: userId,
    attempt_id: attemptRow.id,
    question_id: question.id,
    selected_index: answers[index],
    is_correct: answers[index] === question.correctIndex
  }));
  const { error: answerError } = await client.from('attempt_answers').insert(answerRows);
  if (answerError) {
    await client.from('attempts').delete().eq('id', attemptRow.id);
    throw answerError;
  }
  return {
    id: attemptRow.id,
    testId: attemptRow.test_id,
    classId: attemptRow.class_id,
    title: attemptRow.title,
    score: attemptRow.score,
    total: attemptRow.total,
    completedAt: attemptRow.completed_at,
    answers: Array.isArray(attemptRow.answers) ? attemptRow.answers.map(Number) : answers
  };
}
