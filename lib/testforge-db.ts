import type { SupabaseClient } from '@supabase/supabase-js';

export type Question = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type Test = {
  id: string;
  classId: string;
  title: string;
  questions: Question[];
  createdAt: string;
};

export type Attempt = {
  id: string;
  testId: string;
  classId: string;
  title: string;
  score: number;
  total: number;
  completedAt: string;
  answers: number[];
};

export type ClassSection = {
  id: string;
  name: string;
};

export type Workspace = {
  profileName: string;
  classes: ClassSection[];
  tests: Test[];
  attempts: Attempt[];
};

type QuestionRow = {
  id: string;
  prompt: string;
  options: unknown;
  correct_index: number;
  explanation: string;
  position: number;
};

type TestRow = {
  id: string;
  class_id: string;
  title: string;
  created_at: string;
  questions?: QuestionRow[] | null;
};

export async function loadWorkspace(client: SupabaseClient, userId: string): Promise<Workspace> {
  const [profileResult, classesResult, testsResult, attemptsResult] = await Promise.all([
    client.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
    client.from('classes').select('id,name,created_at').order('created_at', { ascending: true }),
    client
      .from('tests')
      .select('id,class_id,title,created_at,questions(id,prompt,options,correct_index,explanation,position)')
      .order('created_at', { ascending: false }),
    client
      .from('attempts')
      .select('id,test_id,class_id,title,score,total,answers,completed_at')
      .order('completed_at', { ascending: false })
  ]);

  const error = profileResult.error || classesResult.error || testsResult.error || attemptsResult.error;
  if (error) throw error;

  const classes: ClassSection[] = (classesResult.data || []).map((row) => ({ id: row.id, name: row.name }));
  const tests: Test[] = ((testsResult.data || []) as TestRow[]).map((row) => ({
    id: row.id,
    classId: row.class_id,
    title: row.title,
    createdAt: row.created_at,
    questions: (row.questions || [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((question) => ({
        id: question.id,
        prompt: question.prompt,
        options: Array.isArray(question.options) ? question.options.map(String) : [],
        correctIndex: question.correct_index,
        explanation: question.explanation
      }))
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

  return {
    profileName: profileResult.data?.full_name || 'Student',
    classes,
    tests,
    attempts
  };
}

export async function createClass(client: SupabaseClient, userId: string, name: string): Promise<ClassSection> {
  const { data, error } = await client
    .from('classes')
    .insert({ user_id: userId, name: name.trim() })
    .select('id,name')
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name };
}

export async function createTestFromImport(
  client: SupabaseClient,
  userId: string,
  classId: string,
  title: string,
  questions: Question[],
  source: { fileName: string; sourceMode: string }
): Promise<Test> {
  const { data: importRow, error: importError } = await client
    .from('lesson_imports')
    .insert({
      user_id: userId,
      class_id: classId,
      file_name: source.fileName || 'Imported file',
      source_mode: source.sourceMode || 'extracted',
      title
    })
    .select('id')
    .single();
  if (importError) throw importError;

  const { data: testRow, error: testError } = await client
    .from('tests')
    .insert({ user_id: userId, class_id: classId, import_id: importRow.id, title })
    .select('id,class_id,title,created_at')
    .single();

  if (testError) {
    await client.from('lesson_imports').delete().eq('id', importRow.id);
    throw testError;
  }

  const questionRows = questions.map((question, position) => ({
    user_id: userId,
    test_id: testRow.id,
    prompt: question.prompt,
    options: question.options,
    correct_index: question.correctIndex,
    explanation: question.explanation,
    position
  }));

  const { data: savedQuestions, error: questionError } = await client
    .from('questions')
    .insert(questionRows)
    .select('id,prompt,options,correct_index,explanation,position');

  if (questionError) {
    await client.from('tests').delete().eq('id', testRow.id);
    throw questionError;
  }

  return {
    id: testRow.id,
    classId: testRow.class_id,
    title: testRow.title,
    createdAt: testRow.created_at,
    questions: ((savedQuestions || []) as QuestionRow[])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((question) => ({
        id: question.id,
        prompt: question.prompt,
        options: Array.isArray(question.options) ? question.options.map(String) : [],
        correctIndex: question.correct_index,
        explanation: question.explanation
      }))
  };
}

export async function recordAttempt(
  client: SupabaseClient,
  userId: string,
  test: Test,
  answers: number[]
): Promise<Attempt> {
  const score = test.questions.reduce(
    (total, question, index) => total + (answers[index] === question.correctIndex ? 1 : 0),
    0
  );

  const { data: attemptRow, error: attemptError } = await client
    .from('attempts')
    .insert({
      user_id: userId,
      test_id: test.id,
      class_id: test.classId,
      title: test.title,
      score,
      total: test.questions.length,
      answers
    })
    .select('id,test_id,class_id,title,score,total,answers,completed_at')
    .single();
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
