'use client';

import { ArrowLeft, Check, RotateCcw, Target, X } from 'lucide-react';
import type { Attempt, Test } from '../lib/testforge-db';

type AttemptReviewProps = {
  attempt: Attempt;
  test: Test | null;
  className: string;
  onClose: () => void;
  onRetake?: (test: Test) => void;
};

export default function AttemptReview({ attempt, test, className, onClose, onRetake }: AttemptReviewProps) {
  const percent = Math.round((attempt.score / attempt.total) * 100);

  if (!test) {
    return (
      <main className="exam-shell">
        <header className="exam-header">
          <div><div className="eyebrow">Completed test review</div><h1>{attempt.title}</h1></div>
          <button className="ghost-button" onClick={onClose}><ArrowLeft size={17} /> Back to history</button>
        </header>
        <div className="empty-state">This attempt is saved, but its original test questions are no longer available to display.</div>
      </main>
    );
  }

  const missedTopics = Array.from(
    test.questions.reduce((map, question, index) => {
      const selectedIndex = attempt.answers[index] ?? -1;
      if (selectedIndex === question.correctIndex) return map;
      const topic = question.topic?.trim() || 'General';
      map.set(topic, (map.get(topic) || 0) + 1);
      return map;
    }, new Map<string, number>()).entries()
  )
    .map(([topic, missed]) => ({ topic, missed }))
    .sort((a, b) => b.missed - a.missed || a.topic.localeCompare(b.topic));

  return (
    <main className="exam-shell">
      <header className="exam-header">
        <div>
          <div className="eyebrow">{className} · Completed {new Date(attempt.completedAt).toLocaleDateString()}</div>
          <h1>{attempt.title}</h1>
        </div>
        <button className="ghost-button" onClick={onClose}><ArrowLeft size={17} /> Back to history</button>
      </header>

      <section className="score-banner review-score-banner">
        <div><span>Final score</span><strong>{percent}%</strong></div>
        <p>{attempt.score} of {attempt.total} correct</p>
      </section>

      <section className="review-summary-grid">
        <div><span>Questions</span><strong>{attempt.total}</strong></div>
        <div><span>Correct</span><strong>{attempt.score}</strong></div>
        <div><span>Incorrect</span><strong>{Math.max(0, attempt.total - attempt.score)}</strong></div>
        <div><span>Completed</span><strong>{new Date(attempt.completedAt).toLocaleDateString()}</strong></div>
      </section>

      <section className={missedTopics.length ? 'attempt-study-targets' : 'attempt-study-targets perfect'}>
        <div className="attempt-study-heading">
          <Target size={18} />
          <div>
            <span>{missedTopics.length ? 'Study next' : 'Perfect attempt'}</span>
            <strong>{missedTopics.length ? 'Review the concepts you missed' : 'No weak topics on this attempt'}</strong>
          </div>
        </div>
        {missedTopics.length ? (
          <div className="attempt-topic-list">
            {missedTopics.slice(0, 5).map((item) => (
              <span className="attempt-topic-chip" key={item.topic}>{item.topic}<strong>{item.missed} missed</strong></span>
            ))}
          </div>
        ) : (
          <p>You answered every question correctly. A retake later can help confirm retention.</p>
        )}
      </section>

      <section className="question-stack review-question-stack">
        {test.questions.map((question, questionIndex) => {
          const selectedIndex = attempt.answers[questionIndex] ?? -1;
          const selectedCorrectly = selectedIndex === question.correctIndex;
          return (
            <article className="question-card" key={question.id}>
              <div className="review-question-meta">
                <div className="question-number">Question {questionIndex + 1}</div>
                <span className="topic-pill">{question.topic || 'General'}</span>
              </div>
              <h2>{question.prompt}</h2>
              <div className="answer-list">
                {question.options.map((option, optionIndex) => {
                  const selected = selectedIndex === optionIndex;
                  const isCorrect = optionIndex === question.correctIndex;
                  const classNames = selected && isCorrect
                    ? 'answer correct selected'
                    : selected && !isCorrect
                      ? 'answer incorrect selected'
                      : isCorrect
                        ? 'answer correct'
                        : 'answer';
                  return (
                    <div className={classNames} key={optionIndex}>
                      <span className="answer-letter">{String.fromCharCode(65 + optionIndex)}</span>
                      <span className={selected && !isCorrect ? 'wrong-text' : ''}>{option}</span>
                      {isCorrect && <Check size={20} className="answer-icon" />}
                      {selected && !isCorrect && <X size={20} className="answer-icon" />}
                    </div>
                  );
                })}
              </div>
              <div className={selectedCorrectly ? 'explanation good' : 'explanation bad'}>
                <strong>{selectedCorrectly ? 'Correct.' : 'Incorrect.'}</strong>{' '}
                {selectedIndex < 0 ? 'No answer was recorded for this question. ' : ''}{question.explanation}
              </div>
            </article>
          );
        })}
      </section>

      <div className="exam-actions review-actions">
        <button className="ghost-button" onClick={onClose}><ArrowLeft size={17} /> Completed tests</button>
        {onRetake && <button className="primary-button" onClick={() => onRetake(test)}><RotateCcw size={17} /> Retake test</button>}
      </div>
    </main>
  );
}
