import { describe, expect, it } from 'vitest';
import { buildAdaptivePlan, selectAdaptiveQuestions } from '../lib/testforge-adaptive';
import type { Attempt, ClassSection, Question, Test } from '../lib/testforge-db';

const classes: ClassSection[] = [{ id: 'class-1', name: 'IT Fundamentals' }];

function question(id: string, topic: string, correctIndex = 0): Question {
  return {
    id,
    prompt: `Prompt ${id}`,
    options: ['Correct', 'Wrong 1', 'Wrong 2', 'Wrong 3'],
    correctIndex,
    explanation: 'Because the first choice is correct.',
    topic
  };
}

const tests: Test[] = [{
  id: 'test-1',
  classId: 'class-1',
  importId: null,
  title: 'Baseline',
  createdAt: '2026-08-01T00:00:00Z',
  questions: [
    question('n1', 'Networking'),
    question('n2', 'Networking'),
    question('s1', 'Security'),
    question('s2', 'Security'),
    question('h1', 'Hardware'),
    question('h2', 'Hardware')
  ]
}];

const attempts: Attempt[] = [{
  id: 'attempt-1',
  testId: 'test-1',
  classId: 'class-1',
  title: 'Baseline',
  score: 4,
  total: 6,
  completedAt: '2026-08-20T00:00:00Z',
  answers: [1, 1, 0, 0, 0, 0]
}];

describe('adaptive study planning', () => {
  it('ranks the weakest measured topic first', () => {
    const plan = buildAdaptivePlan(classes, tests, attempts, 'class-1');
    expect(plan.readiness).toBe('ready');
    expect(plan.items[0].topic).toBe('Networking');
    expect(plan.items[0].status).toBe('Focus now');
    expect(plan.items.find((item) => item.topic === 'Security')?.status).toBe('Maintain');
  });

  it('weights adaptive selection toward weak and recently missed questions', () => {
    const selected = selectAdaptiveQuestions(tests, attempts, 'class-1', 5);
    expect(selected).toHaveLength(5);
    expect(selected.slice(0, 2).map((item) => item.topic)).toEqual(['Networking', 'Networking']);
    expect(new Set(selected.map((item) => item.prompt)).size).toBe(5);
  });
});
