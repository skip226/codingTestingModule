import { describe, expect, it } from 'vitest';
import { assertCompleteAttempt, getQuestionValidationError } from '../lib/testforge-validation';

const validQuestion = {
  prompt: 'What does DNS resolve?',
  options: ['Names to IP addresses', 'Files to folders', 'Ports to cables', 'Users to passwords'],
  correctIndex: 0
};

describe('question validation', () => {
  it('accepts a fully publishable question', () => {
    expect(getQuestionValidationError([validQuestion])).toBeNull();
  });

  it('blocks an unresolved correct answer', () => {
    expect(getQuestionValidationError([{ ...validQuestion, correctIndex: -1 }])).toContain('confirmed correct answer');
  });

  it('blocks empty answer choices', () => {
    expect(getQuestionValidationError([{ ...validQuestion, options: ['Yes', ''] }])).toContain('empty answer choice');
  });

  it('requires a complete valid attempt', () => {
    expect(() => assertCompleteAttempt([validQuestion], [0])).not.toThrow();
    expect(() => assertCompleteAttempt([validQuestion], [-1])).toThrow('needs a valid answer');
    expect(() => assertCompleteAttempt([validQuestion], [])).toThrow('exactly one saved answer');
  });
});
