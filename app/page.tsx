'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  FileSearch,
  GraduationCap,
  History,
  LogOut,
  Pencil,
  Plus,
  Sparkles,
  X
} from 'lucide-react';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '../lib/supabase-browser';
import {
  createClass,
  createTestFromImport,
  loadWorkspace,
  recordAttempt,
  type Attempt,
  type ClassSection,
  type Question,
  type Test
} from '../lib/testforge-db';

type ScanMode = 'smart' | 'extract' | 'generate';
type Difficulty = 'beginner' | 'intermediate' | 'advanced';
type AuthMode = 'signin' | 'signup';

export default function HomePage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  const [profileName, setProfileName] = useState('Student');
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [appMessage, setAppMessage] = useState('');

  const [activeClassId, setActiveClassId] = useState('');
  const [activeView, setActiveView] = useState<'dashboard' | 'history' | 'scan'>('dashboard');
  const [runningTest, setRunningTest] = useState<Test | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [graded, setGraded] = useState(false);
  const [savingAttempt, setSavingAttempt] = useState(false);

  const [scanQuestions, setScanQuestions] = useState<Question[]>([]);
  const [scanTitle, setScanTitle] = useState('Imported Test');
  const [scanFileName, setScanFileName] = useState('');
  const [scanning, setScanning] = useState(false);
  const [savingImport, setSavingImport] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [scanSource, setScanSource] = useState('');
  const [scanMode, setScanMode] = useState<ScanMode>('smart');
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate');

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!user || !supabase) {
      setClasses([]);
      setTests([]);
      setAttempts([]);
      setActiveClassId('');
      return;
    }

    let mounted = true;
    setWorkspaceLoading(true);
    setAppMessage('');

    loadWorkspace(supabase, user.id)
      .then((workspace) => {
        if (!mounted) return;
        const fallbackName = String(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Student');
        setProfileName(workspace.profileName === 'Student' ? fallbackName : workspace.profileName);
        setClasses(workspace.classes);
        setTests(workspace.tests);
        setAttempts(workspace.attempts);
        setActiveClassId((current) => {
          if (current && workspace.classes.some((item) => item.id === current)) return current;
          return workspace.classes[0]?.id || '';
        });
      })
      .catch((error) => {
        if (!mounted) return;
        setAppMessage(error instanceof Error ? error.message : 'Your workspace could not be loaded.');
      })
      .finally(() => {
        if (mounted) setWorkspaceLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [user, supabase]);

  useEffect(() => {
    if (!classes.some((item) => item.id === activeClassId) && classes[0]) {
      setActiveClassId(classes[0].id);
    }
  }, [classes, activeClassId]);

  const overallGrade = useMemo(() => {
    const earned = attempts.reduce((sum, attempt) => sum + attempt.score, 0);
    const total = attempts.reduce((sum, attempt) => sum + attempt.total, 0);
    return total ? Math.round((earned / total) * 100) : 100;
  }, [attempts]);

  const currentClass = classes.find((item) => item.id === activeClassId);
  const classTests = tests.filter((test) => test.classId === activeClassId);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage('');

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: { data: { full_name: authName.trim() || 'Student' } }
        });
        if (error) throw error;
        if (!data.session) {
          setAuthMessage('Account created. Check your email to confirm the account, then sign in.');
          setAuthMode('signin');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword
        });
        if (error) throw error;
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setRunningTest(null);
    setActiveView('dashboard');
  }

  async function addClass() {
    if (!user || !supabase) return;
    const name = window.prompt('Class name');
    if (!name?.trim()) return;
    setAppMessage('');

    try {
      const next = await createClass(supabase, user.id, name);
      setClasses((current) => [...current, next]);
      setActiveClassId(next.id);
      setActiveView('dashboard');
    } catch (error) {
      setAppMessage(error instanceof Error ? error.message : 'The class could not be created.');
    }
  }

  function startTest(test: Test) {
    setRunningTest(test);
    setAnswers(Array(test.questions.length).fill(-1));
    setGraded(false);
  }

  async function gradeTest() {
    if (!runningTest || !user || !supabase) return;
    setSavingAttempt(true);
    setAppMessage('');

    try {
      const attempt = await recordAttempt(supabase, user.id, runningTest, answers);
      setAttempts((current) => [attempt, ...current]);
      setGraded(true);
    } catch (error) {
      setAppMessage(error instanceof Error ? error.message : 'The test could not be graded and saved.');
    } finally {
      setSavingAttempt(false);
    }
  }

  async function scanFile(file: File) {
    setScanning(true);
    setScanQuestions([]);
    setScanSource('');
    setScanFileName(file.name);
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

  async function saveImportedTest() {
    if (!activeClassId || scanQuestions.length === 0 || !user || !supabase) return;
    setSavingImport(true);
    setScanMessage('Saving this assessment to your cloud workspace…');

    try {
      const next = await createTestFromImport(
        supabase,
        user.id,
        activeClassId,
        scanTitle.trim() || 'Imported Test',
        scanQuestions,
        {
          fileName: scanFileName || 'Imported file',
          sourceMode: scanSource || 'extracted'
        }
      );
      setTests((current) => [next, ...current]);
      setScanQuestions([]);
      setScanSource('');
      setScanFileName('');
      setScanMessage('Test saved to this class.');
      setActiveView('dashboard');
    } catch (error) {
      setScanMessage(error instanceof Error ? error.message : 'The test could not be saved.');
    } finally {
      setSavingImport(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <main className="auth-shell">
        <section className="auth-card setup-card">
          <div className="brand auth-brand"><div className="brand-mark"><GraduationCap size={22} /></div><span>TestForge</span></div>
          <div className="auth-icon"><Cloud size={28} /></div>
          <span className="eyebrow">Cloud setup required</span>
          <h1>Connect the database</h1>
          <p>Add <strong>NEXT_PUBLIC_SUPABASE_URL</strong> and <strong>NEXT_PUBLIC_SUPABASE_ANON_KEY</strong> to the deployment environment, then run <strong>supabase/schema.sql</strong> in the Supabase SQL editor.</p>
          <p className="muted">The app intentionally stays locked until persistent user storage is configured.</p>
        </section>
      </main>
    );
  }

  if (!authReady) {
    return <main className="auth-shell"><div className="loading-card">Restoring your TestForge session…</div></main>;
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand auth-brand"><div className="brand-mark"><GraduationCap size={22} /></div><span>TestForge</span></div>
          <span className="eyebrow">Your study workspace</span>
          <h1>{authMode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
          <p>{authMode === 'signup' ? 'Create a private workspace that keeps your classes, tests, and grades synced across devices.' : 'Sign in to access your classes, generated assessments, and graded test history.'}</p>

          <form className="auth-form" onSubmit={submitAuth}>
            {authMode === 'signup' && (
              <label><span>Name</span><input value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Your name" required /></label>
            )}
            <label><span>Email</span><input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" required /></label>
            <label><span>Password</span><input type="password" minLength={6} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="At least 6 characters" required /></label>
            <button className="primary-button auth-submit" type="submit" disabled={authBusy}>{authBusy ? 'Working…' : authMode === 'signup' ? 'Create account' : 'Sign in'}</button>
          </form>

          {authMessage && <p className="auth-message">{authMessage}</p>}
          <button className="auth-switch" onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthMessage(''); }}>
            {authMode === 'signin' ? 'New to TestForge? Create an account' : 'Already have an account? Sign in'}
          </button>
        </section>
      </main>
    );
  }

  if (workspaceLoading) {
    return <main className="auth-shell"><div className="loading-card">Loading your cloud workspace…</div></main>;
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

        {appMessage && <div className="app-message">{appMessage}</div>}

        {graded && (
          <section className="score-banner">
            <div><span>Score</span><strong>{Math.round((currentScore / runningTest.questions.length) * 100)}%</strong></div>
            <p>{currentScore} of {runningTest.questions.length} correct · saved to your history</p>
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
                      disabled={graded || savingAttempt}
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
            <button className="primary-button" disabled={answers.includes(-1) || savingAttempt} onClick={gradeTest}>{savingAttempt ? 'Grading & saving…' : 'Grade test'}</button>
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
        <div className="cloud-status"><Cloud size={14} /><span>Cloud workspace</span></div>
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
          {classes.length === 0 && <button className="class-link" onClick={addClass}><Plus size={15} /> Create first class</button>}
        </div>

        <button className="signout-button" onClick={signOut}><LogOut size={16} /> Sign out</button>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div><div className="eyebrow">Student workspace</div><h1>Welcome back</h1></div>
          <div className="profile-grade"><div className="profile-copy"><strong>{profileName}</strong><span>Overall grade</span></div><div className="grade-badge">{overallGrade}</div></div>
        </header>

        {appMessage && <div className="app-message">{appMessage}</div>}

        {activeView === 'dashboard' && (
          <>
            <section className="hero-card">
              <div>
                <span className="eyebrow">Current class</span>
                <h2>{currentClass?.name || 'Create your first class'}</h2>
                <p>{currentClass ? 'Your tests and graded attempts are now stored securely in your cloud workspace.' : 'Create a class section first, then import lessons or generate tests inside it.'}</p>
              </div>
              {currentClass ? (
                <button className="primary-button" onClick={() => setActiveView('scan')}><Sparkles size={18} /> Build a test from file</button>
              ) : (
                <button className="primary-button" onClick={addClass}><Plus size={18} /> Create class</button>
              )}
            </section>

            {currentClass && (
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
            )}
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
                    <span>{classes.find((item) => item.id === attempt.classId)?.name || 'Class'} · {new Date(attempt.completedAt).toLocaleDateString()}</span>
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
            {!currentClass ? (
              <div className="empty-state">Create a class before importing lesson material or building a test.</div>
            ) : (
              <>
                <div className="section-header"><div><span className="eyebrow">Smart assessment builder</span><h2>Turn a lesson or test into an assessment</h2></div></div>

                <div className="generation-controls">
                  <div className="generation-intro">
                    <div className="generation-icon"><Sparkles size={20} /></div>
                    <div><strong>Choose how TestForge should read the file</strong><span>Smart mode preserves existing tests and uses AI only when the upload is lesson material.</span></div>
                  </div>

                  <div className="control-grid">
                    <label className="control-field"><span>Import method</span><select value={scanMode} onChange={(event) => setScanMode(event.target.value as ScanMode)} disabled={scanning}><option value="smart">Smart — extract or generate</option><option value="extract">Extract existing test only</option><option value="generate">AI generate from lesson</option></select></label>
                    <label className="control-field"><span>Questions</span><select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} disabled={scanning || scanMode === 'extract'}><option value={5}>5 questions</option><option value={10}>10 questions</option><option value={15}>15 questions</option><option value={20}>20 questions</option><option value={30}>30 questions</option></select></label>
                    <label className="control-field"><span>Difficulty</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)} disabled={scanning || scanMode === 'extract'}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
                  </div>
                </div>

                <label className={scanning ? 'dropzone busy' : 'dropzone'}>
                  {scanMode === 'generate' ? <Sparkles size={30} /> : <FileSearch size={30} />}
                  <strong>{scanning ? 'Building your assessment…' : 'Choose a PDF, DOCX, TXT, or Markdown file'}</strong>
                  <span>{scanMode === 'extract' ? 'TestForge will look for numbered multiple-choice questions, answer keys, and explanations already present in the file.' : scanMode === 'generate' ? `TestForge will use the lesson material to create a ${questionCount}-question ${difficulty} assessment.` : 'TestForge will first look for an existing test. If none is found, it will create a new assessment from the lesson material.'}</span>
                  <input type="file" accept=".pdf,.docx,.txt,.md" disabled={scanning} onChange={(event) => event.target.files?.[0] && scanFile(event.target.files[0])} />
                </label>

                {scanMessage && <p className="scan-message">{scanMessage}</p>}

                {scanQuestions.length > 0 && (
                  <div className="review-panel">
                    <div className="review-toolbar">
                      <div>
                        <div className="review-meta"><span className="eyebrow">Review before saving</span>{scanSource && <span className={scanSource === 'generated' ? 'source-pill generated' : 'source-pill'}>{scanSource === 'generated' ? 'AI generated' : 'Extracted from file'}</span>}</div>
                        <input className="title-input" value={scanTitle} onChange={(event) => setScanTitle(event.target.value)} />
                      </div>
                      <button className="primary-button" disabled={savingImport} onClick={saveImportedTest}>{savingImport ? 'Saving…' : 'Save test'}</button>
                    </div>

                    {scanQuestions.map((question, questionIndex) => (
                      <article className="edit-question" key={question.id}>
                        <div className="edit-heading"><strong>Question {questionIndex + 1}</strong><Pencil size={16} /></div>
                        <textarea value={question.prompt} onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })} />
                        {question.options.map((option, optionIndex) => (
                          <div className="edit-option" key={optionIndex}>
                            <input type="radio" name={`correct-${question.id}`} checked={question.correctIndex === optionIndex} onChange={() => updateQuestion(questionIndex, { correctIndex: optionIndex })} />
                            <input value={option} onChange={(event) => updateQuestion(questionIndex, { options: question.options.map((value, index) => index === optionIndex ? event.target.value : value) })} />
                          </div>
                        ))}
                        <label className="explanation-editor">Explanation<textarea value={question.explanation} onChange={(event) => updateQuestion(questionIndex, { explanation: event.target.value })} /></label>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
