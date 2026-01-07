import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChartLine, FaLayerGroup, FaListOl } from 'react-icons/fa';
import PageLayout from '../../Components/PageLayout';
import './StudentDashboard.css';

const API_BASE = 'http://localhost:5144/api/student/lessons';

const formatDate = (raw) => {
  if (!raw) return 'No due date';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 'No due date';
  return d.toLocaleDateString();
};

const computeStatus = (lesson) => {
  if (lesson.latestAttempt) return 'Completed';
  const due = lesson.dueDate;
  const dueTime = due ? new Date(due).getTime() : NaN;
  if (!Number.isNaN(dueTime) && dueTime < Date.now()) return 'Late';
  return 'Active';
};

const normalizeAttempt = (raw) => {
  if (!raw) return null;
  return {
    totalScore: raw.totalScore ?? raw.TotalScore ?? null,
    submittedAt: raw.submittedAt || raw.SubmittedAt,
  };
};

const normalizeLesson = (lesson) => {
  const scoreOutOf = lesson.scoreOutOf || lesson.ScoreOutOf || 22;
  const latest = lesson.latestAttempt || lesson.LatestAttempt;
  const original = lesson.originalAttempt || lesson.OriginalAttempt;
  const retry = lesson.retryAttempt || lesson.RetryAttempt;
  const active = lesson.activeAttempt || lesson.ActiveAttempt;
  return {
    id: lesson.id || lesson.Id,
    title: lesson.title || lesson.Title,
    dueDate: lesson.dueDate || lesson.DueDate,
    scoreOutOf,
    latestAttempt: normalizeAttempt(latest),
    originalAttempt: normalizeAttempt(original),
    retryAttempt: normalizeAttempt(retry),
    activeAttempt: active
      ? {
          attemptId: active.attemptId || active.AttemptId,
          startedAt: active.startedAt || active.StartedAt,
        }
      : null,
  };
};

const StatCard = ({ icon, label, value, description }) => (
  <div className="stat-card">
    <div className="stat-icon">{icon}</div>
    <div className="stat-text">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-description">{description}</div>
    </div>
  </div>
);

const QuickCard = ({ title, subtitle, children, onClick }) => (
  <div
    className="quick-card"
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onClick={onClick}
    onKeyDown={(e) => {
      if (onClick && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onClick();
      }
    }}
  >
    <div className="quick-card-header">
      <div>
        <div className="quick-card-title">{title}</div>
        {subtitle && <div className="quick-card-subtitle">{subtitle}</div>}
      </div>
    </div>
    {children ? <div className="quick-card-body">{children}</div> : null}
  </div>
);

function StudentDashboard({ role }) {
  const navigate = useNavigate();
  const token = useMemo(() => sessionStorage.getItem('token') || localStorage.getItem('token'), []);
  const [lessons, setLessons] = useState([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const { studentName, averageScore, proficiencyLevel, lessonsToComplete, className } = useMemo(() => {
    const stored = localStorage.getItem('user');
    const parsed = stored ? JSON.parse(stored) : {};
    const profile = parsed.profile || {};

    return {
      studentName: profile.fullName || profile.FullName || 'Student',
      averageScore: profile.averageScore ?? profile.AverageScore ?? '--',
      proficiencyLevel: profile.level || profile.Level || 'N/A',
      lessonsToComplete: profile.lessonsToComplete ?? profile.LessonsToComplete ?? '--',
      className: profile.className || profile.ClassName || '',
    };
  }, []);

  useEffect(() => {
    const loadLessons = async () => {
      if (!token) return;
      setLoadingLessons(true);
      try {
        const res = await fetch(API_BASE, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const normalized = Array.isArray(data) ? data.map(normalizeLesson) : [];
        setLessons(normalized);
      } catch (err) {
        console.error(err);
        setLessons([]);
      } finally {
        setLoadingLessons(false);
      }
    };
    loadLessons();
  }, [token]);

  const lessonsWithStatus = lessons.map((l) => ({
    ...l,
    computedStatus: computeStatus(l),
  }));

  const todoLessons = lessonsWithStatus.filter((l) => l.computedStatus !== 'Completed');

  const firstAttemptScores = lessonsWithStatus
    .map((l) => {
      const primary = l.originalAttempt || l.latestAttempt;
      return primary && typeof primary.totalScore === 'number'
        ? { total: primary.totalScore, outOf: l.scoreOutOf || 22 }
        : null;
    })
    .filter(Boolean);

  const derivedAverage =
    firstAttemptScores.length > 0
      ? Math.round(
          (firstAttemptScores.reduce((sum, s) => sum + (s.total / s.outOf) * 100, 0) /
            firstAttemptScores.length) *
            10
        ) / 10
      : null;

  const stats = [
    {
      label: 'Average score',
      value:
        derivedAverage != null
          ? `${derivedAverage}%`
          : typeof averageScore === 'number'
          ? `${averageScore}%`
          : averageScore,
      description: 'Based on first attempts',
      icon: <FaChartLine />,
    },
    {
      label: 'Proficiency level',
      value: proficiencyLevel,
      description: 'Keep up the momentum',
      icon: <FaLayerGroup />,
    },
    {
      label: 'Lessons to complete',
      value: loadingLessons ? '…' : todoLessons.length,
      description: 'Assigned and pending',
      icon: <FaListOl />,
    },
  ];

  return (
    <PageLayout title={null} role={role}>
      <div className="dashboard-header student">
        <div>
          <p className="eyebrow">Welcome back</p>
          <h1 className="page-title">Welcome back, {studentName}</h1>
        </div>
        {className ? <div className="class-chip">{className}</div> : null}
      </div>

      <div className="section-header">
        <h2>Your progress at a glance</h2>
        <p className="section-subtitle">Stay on top of your learning goals</p>
      </div>

      <div className="stats-grid">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
            description={stat.description}
          />
        ))}
        </div>

        <div className="quick-grid">
          <QuickCard
            title="Quick access lessons to do"
            subtitle="Pick up where you left off"
            onClick={() => navigate('/my-lessons')}
          >
            <div className="lesson-placeholders">
              {loadingLessons ? (
                [1, 2, 3].map((idx) => (
                  <div key={idx} className="lesson-row">
                    <div className="lesson-dot" />
                    <div className="lesson-text">
                      <div className="lesson-title-placeholder" />
                      <div className="lesson-meta-placeholder" />
                    </div>
                  </div>
                ))
              ) : todoLessons.length === 0 ? (
                <div className="muted">No lessons to do right now.</div>
              ) : (
                todoLessons.slice(0, 3).map((lesson) => {
                  const hasDraft = !!lesson.activeAttempt;
                  return (
                    <div key={lesson.id} className="lesson-row">
                      <div className="lesson-dot" />
                      <div className="lesson-text">
                        <div className="lesson-title">{lesson.title}</div>
                        <div className="lesson-meta">
                          <span className="muted">Due {formatDate(lesson.dueDate)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="primary-btn small"
                        onClick={() => navigate('/my-lessons')}
                      >
                        {hasDraft ? 'Continue' : 'Start'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </QuickCard>

          <QuickCard
            title="Practice"
            subtitle="Target what matters most"
            onClick={() => navigate('/practice')}
          >
            <div className="practice-actions">
              <p className="practice-copy">
                Jump into the practice workspace to work on your common and personalised errors.
              </p>
              <div className="practice-btn primary">Open practice workspace</div>
            </div>
          </QuickCard>

          <QuickCard
            title="Progress"
            subtitle="Your recent trends"
            onClick={() => navigate('/progress')}
          />
        </div>

      <div className="dashboard-placeholder" />
    </PageLayout>
  );
}

export default StudentDashboard;
