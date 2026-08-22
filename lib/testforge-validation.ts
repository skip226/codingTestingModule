type PublishableQuestion = {
  prompt: string;
  options: string[];
  correctIndex: number;
};

export function getQuestionValidationError(questions: PublishableQuestion[]) {
  if (questions.length === 0) return 'Add at least one question before saving this test.';

  for (let index = 0; index < questions.length; index++) {
    const question = questions[index];
    const label = `Question ${index + 1}`;
    if (!question.prompt.trim()) return `${label} needs question text before the test can be saved.`;
    if (!Array.isArray(question.options) || question.options.length < 2) return `${label} needs at least two answer choices.`;
    if (question.options.some((option) => !String(option).trim())) return `${label} contains an empty answer choice.`;
    if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= question.options.length) {
      return `${label} does not have a confirmed correct answer. Choose the correct option before saving.`;
    }
  }

  return null;
}

export function assertPublishableQuestions(questions: PublishableQuestion[]) {
  const error = getQuestionValidationError(questions);
  if (error) throw new Error(error);
}

export function assertCompleteAttempt(questions: PublishableQuestion[], answers: number[]) {
  if (answers.length !== questions.length) throw new Error('Every question must have exactly one saved answer.');
  for (let index = 0; index < questions.length; index++) {
    const selected = answers[index];
    if (!Number.isInteger(selected) || selected < 0 || selected >= questions[index].options.length) {
      throw new Error(`Question ${index + 1} needs a valid answer before the test can be graded.`);
    }
  }
}
