import { NextResponse } from 'next/server';
import mammoth from 'mammoth';
import pdf from 'pdf-parse';

type ParsedQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

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
        : 'Review the lesson material for the reasoning behind this answer.'
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

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file was provided.' }, { status: 400 });
    }

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

    const questions = parseQuestions(text);
    return NextResponse.json({
      fileName: file.name,
      extractedTextLength: text.length,
      questions,
      warning: questions.length === 0 ? 'No structured multiple-choice questions were detected.' : null
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'The file could not be scanned.' }, { status: 500 });
  }
}
