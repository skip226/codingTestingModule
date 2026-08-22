'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronRight,
  FileSearch,
  FileUp,
  GraduationCap,
  History,
  Pencil,
  Plus,
  Sparkles,
  X
} from 'lucide-react';

type Question = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

type Test = {
  id: string;
  classId: string;
  title: string;
  questions: Question[];
  createdAt: string;
};

type Attempt = {
  id: string;
  testId: string;
  classId: string;
  title: string;
  score: number;
  total: number;
  completedAt: string;
  answers: number[];
};

type ClassSection = {
  id: string;
  name: string;
};

type ScanMode = 'smart' | 'extract' | 'generate';
type Difficulty = 'beginner' | 'intermediate' | 'advanced';

const starterClasses: ClassSection[] = [
  { id: 'class-1', name: 'CompTIA A+' },
  { id: 'class-2', name: 'Effective Communication' }
];

const starterTests: Test[] = [
  {
    id: 'demo-test',
    classId: 'class-1',
    title: 'Hardware Fundamentals Check',
    createdAt: new Date().toISOString(),
    questions: [
      {
        id: 'q1',
        prompt: 'Which component temporarily stores data the CPU is actively using?',
        options: ['RAM', 'SSD', 'Power supply', 'NIC'],
        correctIndex: 0,
        explanation: 'RAM is volatile working memory that provides fast temporary access to active programs and data.'
      },
      {
        id: 'q2',
        prompt: 'Which device connects a local network to other networks?',
        options: ['Switch', 'Router', 'Keyboard', 'Heat sink'],
        correctIndex: 1,
        explanation: 'A router forwards packets between different networks, including a local network and the internet.'
      }
    ]
  }
];

function useStoredState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(key);
    if (saved) setValue(JSON.parse(saved));
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (ready) localStorage.setItem(key, JSON.stringify(value));
  }, [key, ready, value]);

  return [value, setValue] as const;
}

export default function HomePage() {
  const [classes, setClasses] = useStoredState<ClassSection[]>('tf-classes', starterClasses);
  const [tests, setTests] = useStoredState<Test[]>('tf-tests', starterTests);
  const [attempts, setAttempts] = useStoredState<Attempt[]>('tf-attempts', []);
  const [activeClassId, setActiveClassId] = useState(starterClasses[0].id);
  const [activeView, setActiveView] = useState<'dashboard' | 'history' | 'scan'>('dashboard');
  const [runningTest, setRunningTest] = useState<Test | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [graded, setGraded] = useState(false);
  const [scanQuestions, setScanQuestions] = useState<Question[]>([]);
  const [scanTitle, setScanTitle] = useState('Imported Test');
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [scanSource, setScanSource] = useState('');
  const [scanMode, setScanMode] = useState<ScanMode>('smart');
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate');

  useEffect(() => {
    if (!classes.some((item) => item.id === activeClassId) && classes[0]) setActiveClassId(classes[0].id);
  }, [classes, activeClassId]);

  const overallGrade = useMemo(() => {
    const earned = attempts.reduce((sum, attempt) => sum + attempt.score, 0);
    const total = attempts.reduce((sum, attempt) => sum + attempt.total, 0);
    return total ? Math.round((earned / total) * 100) : 100;
  }, [attempts]);

  const currentClass = classes.find((item) => item.id === activeClassId);
  const classTests = tests.filter((test) => test.classId === activeClassId);

  function addClass() {
    const name = window.prompt('Class name');
    if (!name?.trim()) return;
    const next = { id: crypto.randomUUID(), name: name.trim() };
    setClasses([...classes, next]);
    setActiveClassId(next.id);
  }

  function startTest(test: Test) {
    setRunningTest(test);
    setAnswers(Array(test.questions.length).fill(-1));
    setGraded(false);
  }

  function gradeTest() {
    if (!runningTest) return;
    const score = runningTest.questions.reduce(
      (total, question, index) => total + (answers[index] === question.correctIndex ? 1 : 0),
      0
    );
    const attempt: Attempt = {
      id: crypto.randomUUID(),
      testId: runningTest.id,
      classId: runningTest.classId,
      title: runningTest.title,
      score,
      total: runningTest.questions.length,
      completedAt: new Date().toISOString(),
      answers
    };
    setAttempts([attempt, ...attempts]);
    setGraded(true);
  }

  async function scanFile(file: File) {
    setScanning(true);
    setScanQuestions([]);
    setScanSource('');
    setScanMessage(
      scanMode === 'generate'
        ? 'Reading the lesson and generating a new assessment…'
        : scanMode === 'extract'
          ? 'Scanning the file for existing questions and answer keys…'
          : 'Scanning the file. TestForge will extract existing questions or generate a new test when needed…'
    );

    const data = new FormData();
    data.append('file', file);
    data.append('mode', scanMode);
    data.append('questionCount', String(questionCount));
    data.append('difficulty', difficulty);

    try {
      const response = await fetch('/api/scan', { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Scan failed');

      const questions = (result.questions || []) as Question[];
      setScanQuestions(questions);
      setScanSource(result.sourceMode || '');
      setScanTitle(result.title || file.name.replace(/\.[^.]+$/, '') || 'Imported Test');

      if (questions.length) {
        const method = result.sourceMode === 'generated' ? 'AI generated' : 'extracted';
        const warning = result.warning ? ` ${result.warning}` : '';
        setScanMessage(`${questions.length} questions ${method}. Review every question before saving.${warning}`);
      } else {
        setScanMessage(result.warning || 'No questions were found. Try Smart or AI Generate mode for lesson material.');
      }
    } catch (error) {
      setScanMessage(error instanceof Error ? error.message : 'The file could not be scanned.');
    } finally {
      setScanning(false);
    }
  }

  function updateQuestion(index: number, patch: Partial<Question>) {
    setScanQuestions(
      scanQuestions.map((question, itemIndex) => itemIndex === index ? { ...question, ...patch } : question)
    );
  }

  function saveImportedTest() {
    if (!activeClassId || scanQuestions.length === 0) return;
    const next: Test = {
      id: crypto.randomUUID(),
      classId: activeClassId,
      title: scanTitle.trim() || 'Imported Test',
      questions: scanQuestions,
      createdAt: new Date().toISOString()
    };
    setTests([next, ...tests]);
    setScanQuestions([]);
    setScanSource('');
    setScanMessage('Test saved to this class.');
    setActiveView('dashboard');
  }

  if (runningTest) {
    const currentScore = runningTest.questions.reduce(
      (total, question, index) => total + (answers[index] === question.correctIndex ? 1 : 0),
      0
    );

    return (
      <main className="exam-shell">
        <header className="exam-header">
          <div>
            <div className="eyebrow">{classes.find((item) => item.id === runningTest.classId)?.name}</div>
            <h1>{runningTest.title}</h1>
          </div>
          <button className="ghost-button" onClick={() => setRunningTest(null)}>Exit test</button>
        </header>

        {graded && (
          <section className="score-banner">
            <div><span>Score</span><strong>{Math.round((currentScore / runningTest.questions.length) * 100)}%</strong></div>
            <p>{currentScore} of {runningTest.questions.length} correct</p>
          </section>
        )}

        <section className="question-stack">
          {runningTest.questions.map((question, questionIndex) => (
            <article className="question-card" key={question.id}>
              <div className="question-number">Question {questionIndex + 1}</div>
              <h2>{question.prompt}</h2>
              <div className="answer-list">
                {question.options.map((option, optionIndex) => {
                  const selected = answers[questionIndex] === optionIndex;
                  const isCorrect = optionIndex === question.correctIndex;
                  const className = graded
                    ? selected && isCorrect ? 'answer correct selected'
                      : selected && !isCorrect ? 'answer incorrect selected'
                        : isCorrect ? 'answer correct'
                          : 'answer'
                    : selected ? 'answer selected' : 'answer';

                  return (
                    <button
                      className={className}
                      key={optionIndex}
                      disabled={graded}
                      onClick={() => setAnswers(answers.map((answer, index) => index === questionIndex ? optionIndex : answer))}
                    >
                      <span className="answer-letter">{String.fromCharCode(65 + optionIndex)}</span>
                      <span className={graded && selected && !isCorrect ? 'wrong-text' : ''}>{option}</span>
                      {graded && isCorrect && <Check size={20} className="answer-icon" />}
                      {graded && selected && !isCorrect && <X size={20} className="answer-icon" />}
                    </button>
                  );
                })}
              </div>
              {graded && answers[questionIndex] >= 0 && (
                <div className={answers[questionIndex] === question.correctIndex ? 'explanation good' : 'explanation bad'}>
                  <strong>{answers[questionIndex] === question.correctIndex ? 'Correct.' : 'Incorrect.'}</strong> {question.explanation}
                </div>
              )}
            </article>
          ))}
        </section>

        <div className="exam-actions">
          {!graded ? (
            <button className="primary-button" disabled={answers.includes(-1)} onClick={gradeTest}>Grade test</button>
          ) : (
            <button className="primary-button" onClick={() => setRunningTest(null)}>Return to dashboard</button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><GraduationCap size={22} /></div><span>TestForge</span></div>
        <nav>
          <button className={activeView === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('dashboard')}><BookOpen size={18} /> Classes</button>
          <button className={activeView === 'history' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('history')}><History size={18} /> Completed tests</button>
          <button className={activeView === 'scan' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('scan')}><Sparkles size={18} /> Import / Generate</button>
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-heading"><span>Your classes</span><button onClick={addClass}><Plus size={16} /></button></div>
          {classes.map((item) => (
            <button
              key={item.id}
              className={item.id === activeClassId ? 'class-link active' : 'class-link'}
              onClick={() => { setActiveClassId(item.id); setActiveView('dashboard'); }}
            >
              <span className="class-dot" />{item.name}
            </button>
          ))}
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div><div className="eyebrow">Student workspace</div><h1>Welcome back</h1></div>
          <div className="profile-grade"><div className="profile-copy"><strong>Student</strong><span>Overall grade</span></div><div className="grade-badge">{overallGrade}</div></div>
        </header>

        {activeView === 'dashboard' && (
          <>
            <section className="hero-card">
              <div>
                <span className="eyebrow">Current class</span>
                <h2>{currentClass?.name || 'Create a class'}</h2>
                <p>Keep lessons, generated tests, and completed attempts organized in one place.</p>
              </div>
              <button className="primary-button" onClick={() => setActiveView('scan')}><Sparkles size={18} /> Build a test from file</button>
            </section>

            <section className="content-section">
              <div className="section-header"><div><span className="eyebrow">Ready to practice</span><h2>Tests</h2></div><span>{classTests.length} available</span></div>
              <div className="test-grid">
                {classTests.map((test) => (
                  <article className="test-card" key={test.id}>
                    <div className="test-icon"><BookOpen size={22} /></div>
                    <div><span className="muted">{test.questions.length} questions</span><h3>{test.title}</h3><p>Take this assessment in the TestForge testing environment.</p></div>
                    <button className="card-action" onClick={() => startTest(test)}>Start test <ChevronRight size={17} /></button>
                  </article>
                ))}
                {classTests.length === 0 && <div className="empty-state">No tests here yet. Import a lesson or assessment to create one.</div>}
              </div>
            </section>
          </>
        )}

        {activeView === 'history' && (
          <section className="content-section history-section">
            <div className="section-header"><div><span className="eyebrow">Review progress</span><h2>Completed & graded tests</h2></div></div>
            <div className="history-list">
              {attempts.map((attempt) => (
                <article className="history-row" key={attempt.id}>
                  <div>
                    <strong>{attempt.title}</strong>
                    <span>{classes.find((item) => item.id === attempt.classId)?.name} · {new Date(attempt.completedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="history-score">{Math.round((attempt.score / attempt.total) * 100)}%</div>
                </article>
              ))}
              {attempts.length === 0 && <div className="empty-state">Completed tests will appear here after they are graded.</div>}
            </div>
          </section>
        )}

        {activeView === 'scan' && (
          <section className="content-section scan-section">
            <div className="section-header">
              <div><span className="eyebrow">Smart assessment builder</span><h2>Turn a lesson or test into an assessment</h2></div>
            </div>

            <div className="generation-controls">
              <div className="generation-intro">
                <div className="generation-icon"><Sparkles size={20} /></div>
                <div>
                  <strong>Choose how TestForge should read the file</strong>
                  <span>Smart mode preserves existing tests and uses AI only when the upload is lesson material.</span>
                </div>
              </div>

              <div className="control-grid">
                <label className="control-field">
                  <span>Import method</span>
                  <select value={scanMode} onChange={(event) => setScanMode(event.target.value as ScanMode)} disabled={scanning}>
                    <option value="smart">Smart — extract or generate</option>
                    <option value="extract">Extract existing test only</option>
                    <option value="generate">AI generate from lesson</option>
                  </select>
                </label>

                <label className="control-field">
                  <span>Questions</span>
                  <select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} disabled={scanning || scanMode === 'extract'}>
                    <option value={5}>5 questions</option>
                    <option value={10}>10 questions</option>
                    <option value={15}>15 questions</option>
                    <option value={20}>20 questions</option>
                    <option value={30}>30 questions</option>
                  </select>
                </label>

                <label className="control-field">
                  <span>Difficulty</span>
                  <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)} disabled={scanning || scanMode === 'extract'}>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </label>
              </div>
            </div>

            <label className={scanning ? 'dropzone busy' : 'dropzone'}>
              {scanMode === 'generate' ? <Sparkles size={30} /> : <FileSearch size={30} />}
              <strong>{scanning ? 'Building your assessment…' : 'Choose a PDF, DOCX, TXT, or Markdown file'}</strong>
              <span>
                {scanMode === 'extract'
                  ? 'TestForge will look for numbered multiple-choice questions, answer keys, and explanations already present in the file.'
                  : scanMode === 'generate'
                    ? `TestForge will use the lesson material to create a ${questionCount}-question ${difficulty} assessment.`
                    : 'TestForge will first look for an existing test. If none is found, it will create a new assessment from the lesson material.'}
              </span>
              <input type="file" accept=".pdf,.docx,.txt,.md" disabled={scanning} onChange={(event) => event.target.files?.[0] && scanFile(event.target.files[0])} />
            </label>

            {scanMessage && <p className="scan-message">{scanMessage}</p>}

            {scanQuestions.length > 0 && (
              <div className="review-panel">
                <div className="review-toolbar">
                  <div>
                    <div className="review-meta">
                      <span className="eyebrow">Review before saving</span>
                      {scanSource && <span className={scanSource === 'generated' ? 'source-pill generated' : 'source-pill'}>{scanSource === 'generated' ? 'AI generated' : 'Extracted from file'}</span>}
                    </div>
                    <input className="title-input" value={scanTitle} onChange={(event) => setScanTitle(event.target.value)} />
                  </div>
                  <button className="primary-button" onClick={saveImportedTest}>Save test</button>
                </div>

                {scanQuestions.map((question, questionIndex) => (
                  <article className="edit-question" key={question.id}>
                    <div className="edit-heading"><strong>Question {questionIndex + 1}</strong><Pencil size={16} /></div>
                    <textarea value={question.prompt} onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })} />
                    {question.options.map((option, optionIndex) => (
                      <div className="edit-option" key={optionIndex}>
                        <input
                          type="radio"
                          name={`correct-${question.id}`}
                          checked={question.correctIndex === optionIndex}
                          onChange={() => updateQuestion(questionIndex, { correctIndex: optionIndex })}
                        />
                        <input
                          value={option}
                          onChange={(event) => updateQuestion(questionIndex, {
                            options: question.options.map((value, index) => index === optionIndex ? event.target.value : value)
                          })}
                        />
                      </div>
                    ))}
                    <label className="explanation-editor">
                      Explanation
                      <textarea value={question.explanation} onChange={(event) => updateQuestion(questionIndex, { explanation: event.target.value })} />
                    </label>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
