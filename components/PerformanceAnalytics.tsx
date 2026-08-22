'use client';

import { Activity, BarChart3, Target, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import type { PerformanceAnalytics as AnalyticsData } from '../lib/testforge-analytics';

type PerformanceAnalyticsProps = {
  analytics: AnalyticsData;
};

function metricTone(value: number) {
  if (value >= 85) return 'strong';
  if (value >= 70) return 'steady';
  return 'needs-work';
}

export function AnalyticsKpis({ analytics }: PerformanceAnalyticsProps) {
  const trendUp = analytics.recentTrend >= 0;
  return (
    <div className="analytics-kpi-grid">
      <article className="analytics-kpi-card">
        <div className="analytics-kpi-icon"><Target size={19} /></div>
        <span>Overall grade</span><strong>{analytics.overallGrade}%</strong><small>Weighted by questions answered</small>
      </article>
      <article className="analytics-kpi-card">
        <div className="analytics-kpi-icon"><BarChart3 size={19} /></div>
        <span>Average test score</span><strong>{analytics.averageTestScore}%</strong><small>Across {analytics.testsTaken} completed test{analytics.testsTaken === 1 ? '' : 's'}</small>
      </article>
      <article className="analytics-kpi-card">
        <div className="analytics-kpi-icon"><Activity size={19} /></div>
        <span>Questions answered</span><strong>{analytics.questionsAnswered}</strong><small>Recorded in graded attempts</small>
      </article>
      <article className="analytics-kpi-card">
        <div className="analytics-kpi-icon">{trendUp ? <TrendingUp size={19} /> : <TrendingDown size={19} />}</div>
        <span>Recent trend</span><strong>{analytics.recentTrend > 0 ? '+' : ''}{analytics.recentTrend}%</strong><small>Last 3 tests vs previous 3</small>
      </article>
    </div>
  );
}

export default function PerformanceAnalytics({ analytics }: PerformanceAnalyticsProps) {
  if (analytics.testsTaken === 0) {
    return (
      <section className="content-section analytics-section">
        <div className="section-header"><div><span className="eyebrow">Performance analytics</span><h2>Your study dashboard</h2></div></div>
        <div className="empty-state">Complete your first test to unlock grade trends, class comparisons, and topic strengths and weaknesses.</div>
      </section>
    );
  }

  const weakest = analytics.weakestTopic;
  const strongest = analytics.strongestTopic;
  const sortedTopics = analytics.topicPerformance.slice().sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);

  return (
    <section className="content-section analytics-section">
      <div className="section-header">
        <div><span className="eyebrow">Performance analytics</span><h2>Your study dashboard</h2></div>
        <span>{analytics.testsTaken} graded test{analytics.testsTaken === 1 ? '' : 's'}</span>
      </div>

      <AnalyticsKpis analytics={analytics} />

      <div className="analytics-insight-grid">
        <article className="analytics-insight-card strong-insight">
          <div className="analytics-insight-heading"><Trophy size={20} /><span>Strongest topic</span></div>
          <strong>{strongest?.topic || 'Not enough data'}</strong>
          <p>{strongest ? `${strongest.accuracy}% accuracy across ${strongest.total} question${strongest.total === 1 ? '' : 's'}.` : 'Complete more questions to identify a strength.'}</p>
        </article>
        <article className="analytics-insight-card weak-insight">
          <div className="analytics-insight-heading"><Target size={20} /><span>Best next study target</span></div>
          <strong>{weakest?.topic || 'Not enough data'}</strong>
          <p>{weakest ? `${weakest.accuracy}% accuracy. Review this concept before your next attempt.` : 'Complete more questions to identify a weak area.'}</p>
        </article>
      </div>

      <section className="analytics-panel trend-panel">
        <div className="analytics-panel-heading trend-heading">
          <div><span className="eyebrow">Recent progress</span><h3>Score trend</h3></div>
          <span>Oldest → newest · last {analytics.recentScores.length}</span>
        </div>
        <div className="score-trend-chart" aria-label="Recent test score trend">
          {analytics.recentScores.map((point) => (
            <article className="score-trend-point" key={point.attemptId} title={`${point.title}: ${point.score}%`}>
              <div className="score-trend-value">{point.score}%</div>
              <div className="score-trend-track">
                <span className={metricTone(point.score)} style={{ height: `${Math.max(4, point.score)}%` }} />
              </div>
              <div className="score-trend-label">
                <strong>{new Date(point.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong>
                <span>{point.className}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="analytics-detail-grid">
        <section className="analytics-panel">
          <div className="analytics-panel-heading"><div><span className="eyebrow">By class</span><h3>Class performance</h3></div></div>
          <div className="class-performance-list">
            {analytics.classPerformance.map((item) => (
              <article className="class-performance-row" key={item.classId}>
                <div className="class-performance-copy">
                  <strong>{item.name}</strong>
                  <span>{item.attempts} test{item.attempts === 1 ? '' : 's'} · {item.questionsAnswered} questions</span>
                </div>
                <div className="performance-bar-wrap">
                  <div className="performance-bar"><span className={metricTone(item.grade)} style={{ width: `${Math.max(2, item.grade)}%` }} /></div>
                  <strong>{item.attempts ? `${item.grade}%` : '—'}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="analytics-panel">
          <div className="analytics-panel-heading"><div><span className="eyebrow">By concept</span><h3>Topic accuracy</h3></div></div>
          <div className="topic-performance-list">
            {sortedTopics.map((topic) => (
              <article className="topic-performance-row" key={topic.topic}>
                <div className="topic-performance-copy"><strong>{topic.topic}</strong><span>{topic.correct}/{topic.total} correct</span></div>
                <div className="performance-bar-wrap">
                  <div className="performance-bar"><span className={metricTone(topic.accuracy)} style={{ width: `${Math.max(2, topic.accuracy)}%` }} /></div>
                  <strong>{topic.accuracy}%</strong>
                </div>
              </article>
            ))}
            {sortedTopics.length === 0 && <div className="empty-state compact-empty">New AI-generated questions will include topics. Existing questions are grouped under General.</div>}
          </div>
        </section>
      </div>
    </section>
  );
}
