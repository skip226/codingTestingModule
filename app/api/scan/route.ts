import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import mammoth from 'mammoth';
import OpenAI from 'openai';
import pdf from 'pdf-parse';
import { countUnresolvedAnswers, parseQuestions, type ParsedQuestion } from '../../../lib/testforge-parser';

export const runtime = 'nodejs';

const MAX_SCAN_BYTES = 25 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

type GenerationDifficulty = 'beginner' | 'intermediate' | 'advanced';
type ImportMode = 'smart' | 'extract' | 'generate';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function authenticateRequest(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { error: json({ error: 'Authentication is not configured on the server.' }, 503) };

  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { error: json({ error: 'Sign in before scanning lesson material.' }, 401) };

  const client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
  const { data, error } = await client.auth.getUser(match[1]);
  if (error || !data.user) return { error: json({ error: 'Your session is invalid or expired. Sign in again.' }, 401) };
  return { userId: data.user.id };
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
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY_MISSING');

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const source = prepareSource(text);
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5.6',
    instructions: [
      'You create accurate study assessments using only the supplied source material.',
      'Do not invent facts that are not supported by the source.',
      'Create useful multiple-choice questions with exactly four distinct answer choices.',
      'Wrong answers should be plausible but clearly incorrect according to the source.',
      'The explanation must briefly explain why the correct answer is correct and clarify the likely misconception behind a wrong choice.',
      'Give every question a concise topic label of roughly one to four words so student performance can be grouped by concept.',
      'Reuse the same topic label for questions testing the same concept.',
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
                required: ['prompt', 'options', 'correctIndex', 'explanation', 'topic'],
                properties: {
                  prompt: { type: 'string' },
                  options: { type: 'array', items: { type: 'string' } },
                  correctIndex: { type: 'integer' },
                  explanation: { type: 'string' },
                  topic: { type: 'string' }
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
    questions?: Array<{ prompt?: string; options?: string[]; correctIndex?: number; explanation?: string; topic?: string }>;
  };

  const questions = (parsed.questions || [])
    .filter((question) =>
      Boolean(question.prompt) &&
      Array.isArray(question.options) &&
      question.options.length >= 4 &&
      Number.isInteger(question.correctIndex) &&
      Number(question.correctIndex) >= 0 &&
      Number(question.correctIndex) <= 3
    )
    .slice(0, count)
    .map((question) => ({
      id: crypto.randomUUID(),
      prompt: String(question.prompt).trim(),
      options: question.options!.slice(0, 4).map((option) => String(option).trim()),
      correctIndex: Number(question.correctIndex),
      explanation: String(question.explanation || 'Review the source material for the reasoning behind this answer.').trim(),
      topic: String(question.topic || 'General').trim() || 'General'
    } satisfies ParsedQuestion));

  if (questions.length === 0) throw new Error('AI generation did not produce usable questions.');
  return {
    title: String(parsed.title || fileName.replace(/\.[^.]+$/, '') || 'Generated Assessment').trim(),
    questions
  };
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if ('error' in auth) return auth.error;

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_SCAN_BYTES + MAX_MULTIPART_OVERHEAD_BYTES) {
      return json({ error: 'Files larger than 25 MB cannot be scanned.' }, 413);
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return json({ error: 'No file was provided.' }, 400);
    if (file.size > MAX_SCAN_BYTES) return json({ error: 'Files larger than 25 MB cannot be scanned.' }, 413);

    const name = file.name.toLowerCase();
    const supported = name.endsWith('.pdf') || name.endsWith('.docx') || name.endsWith('.txt') || name.endsWith('.md');
    if (!supported) return json({ error: 'Supported file types: PDF, DOCX, TXT, and MD.' }, 415);

    const mode = normalizeMode(formData.get('mode'));
    const questionCount = normalizeQuestionCount(formData.get('questionCount'));
    const difficulty = normalizeDifficulty(formData.get('difficulty'));
    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';

    if (name.endsWith('.pdf')) text = (await pdf(buffer)).text;
    else if (name.endsWith('.docx')) text = (await mammoth.extractRawText({ buffer })).value;
    else text = buffer.toString('utf8');

    if (!text.trim()) return json({ error: 'No readable text could be extracted from this file.' }, 422);

    const extractedQuestions = parseQuestions(text);
    const unresolvedAnswers = countUnresolvedAnswers(extractedQuestions);
    const unresolvedWarning = unresolvedAnswers > 0
      ? `${unresolvedAnswers} question${unresolvedAnswers === 1 ? '' : 's'} do not have a reliable answer key. Choose the correct answer for each before saving.`
      : null;

    if (mode === 'extract' || (mode === 'smart' && extractedQuestions.length >= 2)) {
      return json({
        fileName: file.name,
        title: file.name.replace(/\.[^.]+$/, ''),
        extractedTextLength: text.length,
        sourceMode: 'extracted',
        questions: extractedQuestions,
        unresolvedAnswers,
        warning: extractedQuestions.length === 0 ? 'No structured multiple-choice questions were detected.' : unresolvedWarning
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      if (mode === 'smart') {
        return json({
          fileName: file.name,
          title: file.name.replace(/\.[^.]+$/, ''),
          extractedTextLength: text.length,
          sourceMode: 'unavailable',
          questions: extractedQuestions,
          unresolvedAnswers,
          warning: 'This file looks like lesson material rather than a formatted test. Add OPENAI_API_KEY on the server to enable automatic lesson-to-test generation.'
        });
      }
      return json({ error: 'AI generation is not configured. Add OPENAI_API_KEY to the server environment.' }, 503);
    }

    const generated = await generateAssessment(text, questionCount, difficulty, file.name);
    return json({
      fileName: file.name,
      title: generated.title,
      extractedTextLength: text.length,
      sourceMode: 'generated',
      difficulty,
      requestedQuestionCount: questionCount,
      questions: generated.questions,
      unresolvedAnswers: 0,
      warning: generated.questions.length < questionCount ? `Generated ${generated.questions.length} usable questions. Review them before saving.` : null
    });
  } catch (error) {
    console.error('TestForge scan failed', error);
    const message = error instanceof Error ? error.message : '';
    if (message === 'OPENAI_API_KEY_MISSING') {
      return json({ error: 'AI generation is not configured. Add OPENAI_API_KEY to the server environment.' }, 503);
    }
    return json({ error: message || 'The file could not be scanned.' }, 500);
  }
}
