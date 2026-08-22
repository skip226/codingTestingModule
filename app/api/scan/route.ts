import { NextResponse } from 'next/server';
import mammoth from 'mammoth';
import OpenAI from 'openai';
import pdf from 'pdf-parse';

export const runtime = 'nodejs';

type ParsedQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

type GenerationDifficulty = 'beginner' | 'intermediate' | 'advanced';
type ImportMode = 'smart' | 'extract' | 'generate';

function cleanOption(value: string) {
  return value.replace(/^\s*(?:[A-Da-d][\).:-]|\d+[\).:-])\s*/, '').trim();
}

function parseQuestions(text: string): ParsedQuestion[] {
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
    if (optionLines.length < 2) continue;

    const answerLine = lines.find((line) => /^(?:answer|correct answer)\s*[:\-]/i.test(line));
    const explanationLine = lines.find((line) => /^explanation\s*[:\-]/i.test(line));
    const options = optionLines.map(cleanOption);

    let correctIndex = 0;
    if (answerLine) {
      const raw = answerLine.replace(/^(?:answer|correct answer)\s*[:\-]\s*/i, '').trim();
      const letterMatch = raw.match(/^([A-Da-d])\b/);
      if (letterMatch) correctIndex = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
      else {
        const found = options.findIndex((option) => option.toLowerCase() === cleanOption(raw).toLowerCase());
        if (found >= 0) correctIndex = found;
      }
    }

    questions.push({
      id: crypto.randomUUID(),
      prompt,
      options,
      correctIndex: Math.min(Math.max(correctIndex, 0), options.length - 1),
      explanation: explanationLine
        ? explanationLine.replace(/^explanation\s*[:\-]\s*/i, '').trim()
        : 'Review this answer against the source material before publishing the test.'
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
      correctIndex: 0,
      explanation: 'The scanner could not confidently detect the answer key. Review this question before publishing.'
    });
  }

  return questions;
}

function normalizeQuestionCount(value: FormDataEntryValue | null) {
  const parsed = Number(value || 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(30, Math.max(5, Math.round(parsed)));
}

function normalizeDifficulty(value: FormDataEntryValue | null): GenerationDifficulty {
  return value === 'beginner' || value === 'advanced' ? value : 'intermediate';
}

function normalizeMode(value: FormDataEntryValue | null): ImportMode {
  return value === 'extract' || value === 'generate' ? value : 'smart';
}

function prepareSource(text: string) {
  const normalized = text.replace(/\u0000/g, '').replace(/\n{4,}/g, '\n\n\n').trim();
  const maxCharacters = 60000;
  if (normalized.length <= maxCharacters) return normalized;
  return `${normalized.slice(0, 42000)}\n\n[Source shortened for generation]\n\n${normalized.slice(-18000)}`;
}

async function generateAssessment(text: string, count: number, difficulty: GenerationDifficulty, fileName: string) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY_MISSING');
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const source = prepareSource(text);
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5.6',
    instructions: [
      'You create accurate study assessments using only the supplied source material.',
      'Do not invent facts that are not supported by the source.',
      'Create useful multiple-choice questions with four distinct answer choices.',
      'Wrong answers should be plausible but clearly incorrect according to the source.',
      'The explanation must briefly explain why the correct answer is correct and clarify the likely misconception behind a wrong choice.',
      'Avoid trivia unless it is central to the lesson. Favor comprehension, application, and important definitions.'
    ].join(' '),
    input: `Source file: ${fileName}\nRequested difficulty: ${difficulty}\nRequested question count: ${count}\n\nSOURCE MATERIAL\n${source}`,
    max_output_tokens: 12000,
    text: {
      format: {
        type: 'json_schema',
        name: 'testforge_assessment',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'questions'],
          properties: {
            title: { type: 'string' },
            questions: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['prompt', 'options', 'correctIndex', 'explanation'],
                properties: {
                  prompt: { type: 'string' },
                  options: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  correctIndex: { type: 'integer' },
                  explanation: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!response.output_text) throw new Error('AI generation returned no content.');
  const parsed = JSON.parse(response.output_text) as {
    title?: string;
    questions?: Array<{ prompt?: string; options?: string[]; correctIndex?: number; explanation?: string }>;
  };

  const questions = (parsed.questions || [])
    .filter((question) => question.prompt && Array.isArray(question.options) && question.options.length >= 2)
    .slice(0, count)
    .map((question) => {
      const options = question.options!.slice(0, 4).map((option) => String(option).trim());
      while (options.length < 4) options.push(`Review option ${options.length + 1}`);
      const requestedIndex = Number.isInteger(question.correctIndex) ? Number(question.correctIndex) : 0;
      return {
        id: crypto.randomUUID(),
        prompt: String(question.prompt).trim(),
        options,
        correctIndex: Math.min(3, Math.max(0, requestedIndex)),
        explanation: String(question.explanation || 'Review the source material for the reasoning behind this answer.').trim()
      } satisfies ParsedQuestion;
    });

  if (questions.length === 0) throw new Error('AI generation did not produce usable questions.');
  return {
    title: String(parsed.title || fileName.replace(/\.[^.]+$/, '') || 'Generated Assessment').trim(),
    questions
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file was provided.' }, { status: 400 });
    }

    const mode = normalizeMode(formData.get('mode'));
    const questionCount = normalizeQuestionCount(formData.get('questionCount'));
    const difficulty = normalizeDifficulty(formData.get('difficulty'));
    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    let text = '';

    if (name.endsWith('.pdf')) {
      text = (await pdf(buffer)).text;
    } else if (name.endsWith('.docx')) {
      text = (await mammoth.extractRawText({ buffer })).value;
    } else if (name.endsWith('.txt') || name.endsWith('.md')) {
      text = buffer.toString('utf8');
    } else {
      return NextResponse.json({ error: 'Supported file types: PDF, DOCX, TXT, and MD.' }, { status: 415 });
    }

    if (!text.trim()) {
      return NextResponse.json({ error: 'No readable text could be extracted from this file.' }, { status: 422 });
    }

    const extractedQuestions = parseQuestions(text);

    if (mode === 'extract' || (mode === 'smart' && extractedQuestions.length >= 2)) {
      return NextResponse.json({
        fileName: file.name,
        title: file.name.replace(/\.[^.]+$/, ''),
        extractedTextLength: text.length,
        sourceMode: 'extracted',
        questions: extractedQuestions,
        warning: extractedQuestions.length === 0 ? 'No structured multiple-choice questions were detected.' : null
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      if (mode === 'smart') {
        return NextResponse.json({
          fileName: file.name,
          title: file.name.replace(/\.[^.]+$/, ''),
          extractedTextLength: text.length,
          sourceMode: 'unavailable',
          questions: extractedQuestions,
          warning: 'This file looks like lesson material rather than a formatted test. Add OPENAI_API_KEY on the server to enable automatic lesson-to-test generation.'
        });
      }
      return NextResponse.json({ error: 'AI generation is not configured. Add OPENAI_API_KEY to the server environment.' }, { status: 503 });
    }

    const generated = await generateAssessment(text, questionCount, difficulty, file.name);
    return NextResponse.json({
      fileName: file.name,
      title: generated.title,
      extractedTextLength: text.length,
      sourceMode: 'generated',
      difficulty,
      requestedQuestionCount: questionCount,
      questions: generated.questions,
      warning: generated.questions.length < questionCount ? `Generated ${generated.questions.length} usable questions. Review them before saving.` : null
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : '';
    if (message === 'OPENAI_API_KEY_MISSING') {
      return NextResponse.json({ error: 'AI generation is not configured. Add OPENAI_API_KEY to the server environment.' }, { status: 503 });
    }
    return NextResponse.json({ error: message || 'The file could not be scanned.' }, { status: 500 });
  }
}
