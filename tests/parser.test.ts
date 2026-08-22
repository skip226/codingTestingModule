import { describe, expect, it } from 'vitest';
import { countUnresolvedAnswers, parseQuestions } from '../lib/testforge-parser';

describe('parseQuestions', () => {
  it('reads a letter answer key and topic', () => {
    const [question] = parseQuestions(`1. Which protocol resolves domain names?\nA. HTTP\nB. DNS\nC. SSH\nD. SMTP\nAnswer: B\nExplanation: DNS maps names to IP addresses.\nTopic: Networking`);
    expect(question.prompt).toBe('Which protocol resolves domain names?');
    expect(question.correctIndex).toBe(1);
    expect(question.topic).toBe('Networking');
    expect(countUnresolvedAnswers([question])).toBe(0);
  });

  it('matches a textual answer key', () => {
    const [question] = parseQuestions(`1) What stores data temporarily for active programs?\nA) RAM\nB) SSD\nC) PSU\nD) NIC\nCorrect answer: RAM`);
    expect(question.correctIndex).toBe(0);
  });

  it('never invents A when a structured answer key is missing', () => {
    const [question] = parseQuestions(`1. Which device forwards frames on a LAN?\nA. Router\nB. Switch\nC. Modem\nD. Printer`);
    expect(question.correctIndex).toBe(-1);
    expect(countUnresolvedAnswers([question])).toBe(1);
  });

  it('marks fallback question detection unresolved', () => {
    const [question] = parseQuestions(`Study notes\nWhich port is normally used by HTTPS?\nA. 21\nB. 22\nC. 80\nD. 443`);
    expect(question.correctIndex).toBe(-1);
    expect(question.options).toEqual(['21', '22', '80', '443']);
  });
});
