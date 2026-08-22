import type { SupabaseClient } from '@supabase/supabase-js';
import type { Question, Test } from './testforge-db';

type QuestionRow = {
  id: string;
  prompt: string;
  options: unknown;
  correct_index: number;
  explanation: string;
  topic: string | null;
  position: number;
};

export async function createAdaptiveTest(
  client: SupabaseClient,
  userId: string,
  classId: string,
  title: string,
  questions: Question[]
): Promise<Test> {
  if (questions.length === 0) throw new Error('No questions are available for adaptive practice.');

  const { data: testRow, error: testError } = await client
    .from('tests')
    .insert({ user_id: userId, class_id: classId, import_id: null, title })
    .select('id,class_id,import_id,title,created_at')
    .single();
  if (testError) throw testError;

  const questionRows = questions.map((question, position) => ({
    user_id: userId,
    test_id: testRow.id,
    prompt: question.prompt,
    options: question.options,
    correct_index: question.correctIndex,
    explanation: question.explanation,
    topic: question.topic?.trim() || 'General',
    position
  }));

  const { data: savedQuestions, error: questionError } = await client
    .from('questions')
    .insert(questionRows)
    .select('id,prompt,options,correct_index,explanation,topic,position');

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
    questions: ((savedQuestions || []) as QuestionRow[])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((question) => ({
        id: question.id,
        prompt: question.prompt,
        options: Array.isArray(question.options) ? question.options.map(String) : [],
        correctIndex: question.correct_index,
        explanation: question.explanation,
        topic: question.topic?.trim() || 'General'
      }))
  };
}
