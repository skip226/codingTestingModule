'use client';

import { BrainCircuit, ChevronRight, Gauge, Sparkles, Target } from 'lucide-react';
import type { AdaptivePlan } from '../lib/testforge-adaptive';

type AdaptiveStudyPlanProps = {
  plan: AdaptivePlan;
  busy?: boolean;
  onStartAdaptive: () => void;
};

function statusClass(status: string) {
  if (status === 'Focus now') return 'focus';
  if (status === 'Reinforce') return 'reinforce';
  if (status === 'Maintain') return 'maintain';
  return 'baseline';
}

export default function AdaptiveStudyPlan({ plan, busy = false, onStartAdaptive }: AdaptiveStudyPlanProps) {
  const ready = plan.readiness === 'ready';
  return (
    <section className="content-section adaptive-section">
      <div className="section-header">
        <div>
          <span className="eyebrow">Personalized study plan</span>
          <h2>Study Next</h2>
        </div>
        <span>{plan.scopeLabel}</span>
      </div>

      <article className="adaptive-hero">
        <div className="adaptive-hero-icon"><BrainCircuit size={25} /></div>
        <div className="adaptive-hero-copy">
          <span>Recommended session</span>
          <strong>{plan.sessionFocus}</strong>
          <p>{ready ? `TestForge can assemble a ${plan.recommendedQuestionCount}-question adaptive practice set from ${plan.availableQuestions} available questions. About 70% of the session will emphasize weak or recently missed concepts, with the rest reserved for retention.` : `TestForge found ${plan.availableQuestions} reusable question${plan.availableQuestions === 1 ? '' : 's'}. Build a bank of at least 5 questions before adaptive practice is enabled.`}</p>
        </div>
        <button className="primary-button adaptive-start" disabled={!ready || busy} onClick={onStartAdaptive}>
          <Sparkles size={17} /> {busy ? 'Building practice…' : 'Start adaptive practice'}
        </button>
      </article>

      <div className="adaptive-meta-grid">
        <article><Target size={18} /><div><span>Focus rule</span><strong>Weak topics first</strong></div></article>
        <article><Gauge size={18} /><div><span>Practice mix</span><strong>70% focus · 30% retention</strong></div></article>
        <article><BrainCircuit size={18} /><div><span>Feedback loop</span><strong>Every grade updates the plan</strong></div></article>
      </div>

      <div className="study-plan-list">
        {plan.items.slice(0, 6).map((item, index) => (
          <article className="study-plan-row" key={item.topic}>
            <div className="study-rank">{index + 1}</div>
            <div className="study-plan-copy">
              <div className="study-plan-title">
                <strong>{item.topic}</strong>
                <span className={`study-status ${statusClass(item.status)}`}>{item.status}</span>
              </div>
              <p>{item.recommendation}</p>
              <div className="study-plan-meta">
                <span>{item.accuracy === null ? 'No baseline yet' : `${item.accuracy}% accuracy`}</span>
                <span>{item.total} answered</span>
                <span>{item.availableQuestions} in question bank</span>
                <span>{item.suggestedQuestions} suggested next</span>
              </div>
            </div>
            <ChevronRight size={18} className="study-plan-chevron" />
          </article>
        ))}
        {plan.items.length === 0 && <div className="empty-state">Add or generate tests with topic labels to create your personalized Study Next queue.</div>}
      </div>
    </section>
  );
}
