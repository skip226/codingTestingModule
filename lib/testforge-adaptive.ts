import type { Attempt, ClassSection, Question, Test } from './testforge-db';

export type StudyPlanItem = {
  topic: string;
  correct: number;
  total: number;
  accuracy: number | null;
  availableQuestions: number;
  priorityScore: number;
  status: 'Focus now' | 'Reinforce' | 'Build baseline' | 'Maintain';
  recommendation: string;
  suggestedQuestions: number;
};

export type AdaptivePlan = {
  scopeLabel: string;
  classId: string | null;
  items: StudyPlanItem[];
  availableQuestions: number;
  recommendedQuestionCount: number;
  readiness: 'needs-data' | 'ready';
  sessionFocus: string;
};

type TopicStat = {
  correct: number;
  total: number;
  availableQuestions: number;
};

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : null;
}

function normalizeTopic(value: string) {
  return value.trim() || 'General';
}

function uniqueQuestions(tests: Test[]) {
  const seen = new Set<string>();
  const questions: Question[] = [];
  for (const test of tests) {
    for (const question of test.questions) {
      const key = question.prompt.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      questions.push(question);
    }
  }
  return questions;
}

export function buildAdaptivePlan(
  classes: ClassSection[],
  tests: Test[],
  attempts: Attempt[],
  classId: string | null
): AdaptivePlan {
  const scopedTests = classId ? tests.filter((test) => test.classId === classId) : tests;
  const scopedAttempts = classId ? attempts.filter((attempt) => attempt.classId === classId) : attempts;
  const testById = new Map(scopedTests.map((test) => [test.id, test]));
  const bank = uniqueQuestions(scopedTests);
  const topicStats = new Map<string, TopicStat>();

  for (const question of bank) {
    const topic = normalizeTopic(question.topic || 'General');
    const current = topicStats.get(topic) || { correct: 0, total: 0, availableQuestions: 0 };
    current.availableQuestions += 1;
    topicStats.set(topic, current);
  }

  for (const attempt of scopedAttempts) {
    const test = testById.get(attempt.testId);
    if (!test) continue;
    test.questions.forEach((question, index) => {
      const selected = attempt.answers[index];
      if (!Number.isInteger(selected) || selected < 0) return;
      const topic = normalizeTopic(question.topic || 'General');
      const current = topicStats.get(topic) || { correct: 0, total: 0, availableQuestions: 0 };
      current.total += 1;
      if (selected === question.correctIndex) current.correct += 1;
      topicStats.set(topic, current);
    });
  }

  const items: StudyPlanItem[] = Array.from(topicStats.entries()).map(([topic, stats]) => {
    const accuracy = percent(stats.correct, stats.total);
    const weakness = accuracy === null ? 42 : 100 - accuracy;
    const evidenceBoost = Math.min(stats.total, 8) * 2;
    const availabilityBoost = Math.min(stats.availableQuestions, 5);
    const priorityScore = weakness + evidenceBoost + availabilityBoost;
    const status: StudyPlanItem['status'] = accuracy === null
      ? 'Build baseline'
      : accuracy < 70
        ? 'Focus now'
        : accuracy < 85
          ? 'Reinforce'
          : 'Maintain';
    const recommendation = accuracy === null
      ? 'Take a few questions here to establish a baseline before TestForge adjusts the priority.'
      : accuracy < 70
        ? 'Review this concept first, then practice it again while the explanation is fresh.'
        : accuracy < 85
          ? 'Use mixed practice to turn partial understanding into consistent recall.'
          : 'Keep this topic in rotation so the skill stays durable while weaker areas get more attention.';
    const suggestedQuestions = Math.max(1, Math.min(stats.availableQuestions, status === 'Focus now' ? 4 : status === 'Reinforce' ? 3 : 2));
    return { topic, correct: stats.correct, total: stats.total, accuracy, availableQuestions: stats.availableQuestions, priorityScore, status, recommendation, suggestedQuestions };
  }).sort((a, b) => b.priorityScore - a.priorityScore || b.availableQuestions - a.availableQuestions || a.topic.localeCompare(b.topic));

  const className = classId ? classes.find((item) => item.id === classId)?.name : null;
  const recommendedQuestionCount = Math.min(15, Math.max(5, bank.length >= 10 ? 10 : bank.length));
  const top = items[0];
  return {
    scopeLabel: className || 'All classes',
    classId,
    items,
    availableQuestions: bank.length,
    recommendedQuestionCount,
    readiness: bank.length >= 5 ? 'ready' : 'needs-data',
    sessionFocus: top
      ? top.accuracy === null
        ? `Build a baseline in ${top.topic}`
        : `Prioritize ${top.topic} (${top.accuracy}% accuracy)`
      : 'Add more tests to build an adaptive question bank'
  };
}

export function selectAdaptiveQuestions(
  tests: Test[],
  attempts: Attempt[],
  classId: string | null,
  count: number
): Question[] {
  const scopedTests = classId ? tests.filter((test) => test.classId === classId) : tests;
  const scopedAttempts = classId ? attempts.filter((attempt) => attempt.classId === classId) : attempts;
  const bank = uniqueQuestions(scopedTests);
  if (bank.length === 0) return [];

  const accuracyByTopic = new Map<string, { correct: number; total: number }>();
  const testById = new Map(scopedTests.map((test) => [test.id, test]));
  for (const attempt of scopedAttempts) {
    const test = testById.get(attempt.testId);
    if (!test) continue;
    test.questions.forEach((question, index) => {
      const selected = attempt.answers[index];
      if (!Number.isInteger(selected) || selected < 0) return;
      const topic = normalizeTopic(question.topic || 'General');
      const stat = accuracyByTopic.get(topic) || { correct: 0, total: 0 };
      stat.total += 1;
      if (selected === question.correctIndex) stat.correct += 1;
      accuracyByTopic.set(topic, stat);
    });
  }

  const recentlyMissed = new Set<string>();
  for (const attempt of scopedAttempts.slice(0, 5)) {
    const test = testById.get(attempt.testId);
    if (!test) continue;
    test.questions.forEach((question, index) => {
      if (attempt.answers[index] !== question.correctIndex) recentlyMissed.add(question.prompt.trim().toLowerCase());
    });
  }

  const scored = bank.map((question, index) => {
    const topic = normalizeTopic(question.topic || 'General');
    const stat = accuracyByTopic.get(topic);
    const accuracy = stat && stat.total ? (stat.correct / stat.total) * 100 : null;
    const weakness = accuracy === null ? 45 : 100 - accuracy;
    const missBoost = recentlyMissed.has(question.prompt.trim().toLowerCase()) ? 24 : 0;
    const unseenBoost = stat ? 0 : 10;
    return { question, score: weakness + missBoost + unseenBoost - index * 0.001 };
  }).sort((a, b) => b.score - a.score);

  const limit = Math.min(Math.max(1, count), scored.length);
  const focusCount = Math.min(limit, Math.ceil(limit * 0.7));
  const focus = scored.slice(0, focusCount);
  const remaining = scored.slice(focusCount);
  const retention = remaining.slice().sort((a, b) => a.score - b.score).slice(0, limit - focusCount);
  const selected = [...focus, ...retention];

  return selected.map(({ question }) => ({
    ...question,
    id: crypto.randomUUID(),
    options: [...question.options]
  }));
}
