import type { Attempt, ClassSection, Test } from './testforge-db';

export type ClassPerformance = {
  classId: string;
  name: string;
  attempts: number;
  grade: number;
  averageScore: number;
  questionsAnswered: number;
};

export type TopicPerformance = {
  topic: string;
  correct: number;
  total: number;
  accuracy: number;
};

export type PerformanceAnalytics = {
  overallGrade: number;
  averageTestScore: number;
  testsTaken: number;
  questionsAnswered: number;
  recentTrend: number;
  classPerformance: ClassPerformance[];
  topicPerformance: TopicPerformance[];
  strongestTopic: TopicPerformance | null;
  weakestTopic: TopicPerformance | null;
};

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

export function buildPerformanceAnalytics(
  classes: ClassSection[],
  tests: Test[],
  attempts: Attempt[]
): PerformanceAnalytics {
  const testById = new Map(tests.map((test) => [test.id, test]));
  const earned = attempts.reduce((sum, attempt) => sum + attempt.score, 0);
  const possible = attempts.reduce((sum, attempt) => sum + attempt.total, 0);
  const attemptPercentages = attempts.map((attempt) => percent(attempt.score, attempt.total));

  const classPerformance = classes.map((classSection) => {
    const classAttempts = attempts.filter((attempt) => attempt.classId === classSection.id);
    const classEarned = classAttempts.reduce((sum, attempt) => sum + attempt.score, 0);
    const classPossible = classAttempts.reduce((sum, attempt) => sum + attempt.total, 0);
    const scoreTotal = classAttempts.reduce((sum, attempt) => sum + percent(attempt.score, attempt.total), 0);
    return {
      classId: classSection.id,
      name: classSection.name,
      attempts: classAttempts.length,
      grade: percent(classEarned, classPossible),
      averageScore: classAttempts.length ? Math.round(scoreTotal / classAttempts.length) : 0,
      questionsAnswered: classPossible
    };
  });

  const topicMap = new Map<string, { correct: number; total: number }>();
  for (const attempt of attempts) {
    const test = testById.get(attempt.testId);
    if (!test) continue;
    test.questions.forEach((question, index) => {
      const selected = attempt.answers[index];
      if (!Number.isInteger(selected) || selected < 0) return;
      const topic = question.topic?.trim() || 'General';
      const current = topicMap.get(topic) || { correct: 0, total: 0 };
      current.total += 1;
      if (selected === question.correctIndex) current.correct += 1;
      topicMap.set(topic, current);
    });
  }

  const topicPerformance = Array.from(topicMap.entries())
    .map(([topic, values]) => ({
      topic,
      correct: values.correct,
      total: values.total,
      accuracy: percent(values.correct, values.total)
    }))
    .sort((a, b) => b.total - a.total || b.accuracy - a.accuracy);

  const rankedTopics = topicPerformance.filter((topic) => topic.total > 0);
  const strongestTopic = rankedTopics.length
    ? rankedTopics.slice().sort((a, b) => b.accuracy - a.accuracy || b.total - a.total)[0]
    : null;
  const weakestTopic = rankedTopics.length
    ? rankedTopics.slice().sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)[0]
    : null;

  const recent = attemptPercentages.slice(0, 3);
  const previous = attemptPercentages.slice(3, 6);
  const recentAverage = recent.length ? recent.reduce((sum, value) => sum + value, 0) / recent.length : 0;
  const previousAverage = previous.length ? previous.reduce((sum, value) => sum + value, 0) / previous.length : recentAverage;

  return {
    overallGrade: percent(earned, possible),
    averageTestScore: attempts.length
      ? Math.round(attemptPercentages.reduce((sum, value) => sum + value, 0) / attempts.length)
      : 0,
    testsTaken: attempts.length,
    questionsAnswered: possible,
    recentTrend: Math.round(recentAverage - previousAverage),
    classPerformance,
    topicPerformance,
    strongestTopic,
    weakestTopic
  };
}
