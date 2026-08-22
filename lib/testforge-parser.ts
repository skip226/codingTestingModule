export type ParsedQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  topic: string;
};

function cleanOption(value: string) {
  return value.replace(/^\s*(?:[A-Da-d][\).:-]|\d+[\).:-])\s*/, '').trim();
}

function resolveCorrectIndex(answerLine: string | undefined, options: string[]) {
  if (!answerLine) return -1;

  const raw = answerLine.replace(/^(?:answer|correct answer)\s*[:\-]\s*/i, '').trim();
  const letterMatch = raw.match(/^([A-Da-d])\b/);
  if (letterMatch) {
    const index = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
    return index >= 0 && index < options.length ? index : -1;
  }

  const cleaned = cleanOption(raw).toLowerCase();
  return options.findIndex((option) => option.toLowerCase() === cleaned);
}

export function parseQuestions(text: string): ParsedQuestion[] {
  const normalized = text.replace(/\r/g, '').replace(/\t/g, ' ');
  const blocks = normalized
    .split(/\n(?=(?:Question\s+)?\d+[\).:-]\s*)/i)
    .map((block) => block.trim())
    .filter(Boolean);

  const questions: ParsedQuestion[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length < 3) continue;

    const prompt = lines[0].replace(/^(?:Question\s+)?\d+[\).:-]\s*/i, '').trim();
    const optionLines = lines.filter((line) => /^[A-Da-d][\).:-]\s+/.test(line));
    if (!prompt || optionLines.length < 2) continue;

    const answerLine = lines.find((line) => /^(?:answer|correct answer)\s*[:\-]/i.test(line));
    const explanationLine = lines.find((line) => /^explanation\s*[:\-]/i.test(line));
    const topicLine = lines.find((line) => /^topic\s*[:\-]/i.test(line));
    const options = optionLines.map(cleanOption);
    const correctIndex = resolveCorrectIndex(answerLine, options);

    questions.push({
      id: crypto.randomUUID(),
      prompt,
      options,
      correctIndex,
      explanation: explanationLine
        ? explanationLine.replace(/^explanation\s*[:\-]\s*/i, '').trim()
        : correctIndex >= 0
          ? 'Review this explanation against the source material before publishing the test.'
          : 'No reliable answer key was detected. Choose the correct answer during review before publishing.',
      topic: topicLine ? topicLine.replace(/^topic\s*[:\-]\s*/i, '').trim() || 'General' : 'General'
    });
  }

  if (questions.length) return questions;

  const compact = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < compact.length; index++) {
    const line = compact[index];
    if (!line.endsWith('?')) continue;
    const candidates = compact.slice(index + 1, index + 5).filter((candidate) => /^[A-Da-d][\).:-]\s+/.test(candidate));
    if (candidates.length < 2) continue;

    questions.push({
      id: crypto.randomUUID(),
      prompt: line,
      options: candidates.map(cleanOption),
      correctIndex: -1,
      explanation: 'The scanner found answer choices but no reliable answer key. Choose the correct answer during review before publishing.',
      topic: 'General'
    });
  }

  return questions;
}

export function countUnresolvedAnswers(questions: ParsedQuestion[]) {
  return questions.filter((question) => question.correctIndex < 0 || question.correctIndex >= question.options.length).length;
}
