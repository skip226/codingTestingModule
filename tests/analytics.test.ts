import { describe, expect, it } from 'vitest';
import { buildPerformanceAnalytics } from '../lib/testforge-analytics';
import type { Attempt, ClassSection, Test } from '../lib/testforge-db';

const classes: ClassSection[] = [
  { id: 'a', name: 'Hardware' },
  { id: 'b', name: 'Networking' }
];

const tests: Test[] = [
  {
    id: 'test-a', classId: 'a', importId: null, title: 'Hardware Quiz', createdAt: '2026-08-01T00:00:00Z',
    questions: [
      { id: 'q1', prompt: 'CPU?', options: ['A', 'B'], correctIndex: 0, explanation: '', topic: 'CPU' },
      { id: 'q2', prompt: 'RAM?', options: ['A', 'B'], correctIndex: 0, explanation: '', topic: 'Memory' }
    ]
  },
  {
    id: 'test-b', classId: 'b', importId: null, title: 'Network Quiz', createdAt: '2026-08-02T00:00:00Z',
    questions: [
      { id: 'q3', prompt: 'DNS?', options: ['A', 'B'], correctIndex: 0, explanation: '', topic: 'DNS' },
      { id: 'q4', prompt: 'Switch?', options: ['A', 'B'], correctIndex: 0, explanation: '', topic: 'Switching' },
      { id: 'q5', prompt: 'Router?', options: ['A', 'B'], correctIndex: 0, explanation: '', topic: 'Routing' },
      { id: 'q6', prompt: 'HTTPS?', options: ['A', 'B'], correctIndex: 0, explanation: '', topic: 'Ports' }
    ]
  }
];

const attempts: Attempt[] = [
  { id: 'new', testId: 'test-b', classId: 'b', title: 'Network Quiz', score: 3, total: 4, completedAt: '2026-08-20T00:00:00Z', answers: [0, 0, 0, 1] },
  { id: 'old', testId: 'test-a', classId: 'a', title: 'Hardware Quiz', score: 1, total: 2, completedAt: '2026-08-10T00:00:00Z', answers: [0, 1] }
];

describe('performance analytics', () => {
  it('calculates weighted overall grade separately from average test score', () => {
    const analytics = buildPerformanceAnalytics(classes, tests, attempts);
    expect(analytics.overallGrade).toBe(67);
    expect(analytics.averageTestScore).toBe(63);
    expect(analytics.questionsAnswered).toBe(6);
  });

  it('keeps recent score chart in chronological order', () => {
    const analytics = buildPerformanceAnalytics(classes, tests, attempts);
    expect(analytics.recentScores.map((item) => item.attemptId)).toEqual(['old', 'new']);
  });

  it('identifies topic-level strengths and weaknesses from saved answers', () => {
    const analytics = buildPerformanceAnalytics(classes, tests, attempts);
    expect(analytics.topicPerformance.find((item) => item.topic === 'Ports')?.accuracy).toBe(0);
    expect(analytics.topicPerformance.find((item) => item.topic === 'DNS')?.accuracy).toBe(100);
  });
});
