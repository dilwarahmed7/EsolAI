import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChartLine, FaLayerGroup, FaListOl } from 'react-icons/fa';
import PageLayout from '../../Components/PageLayout';
import './StudentDashboard.css';

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
  const { studentName, averageScore, proficiencyLevel, lessonsToComplete } = useMemo(() => {
    const stored = localStorage.getItem('user');
    const parsed = stored ? JSON.parse(stored) : {};
    const profile = parsed.profile || {};

    return {
      studentName: profile.fullName || profile.FullName || 'Student',
      averageScore: profile.averageScore ?? profile.AverageScore ?? '--',
      proficiencyLevel: profile.level || profile.Level || 'N/A',
      lessonsToComplete: profile.lessonsToComplete ?? profile.LessonsToComplete ?? '--',
    };
  }, []);

  const stats = [
    {
      label: 'Average score',
      value: typeof averageScore === 'number' ? `${averageScore}%` : averageScore,
      description: 'Recent assignments',
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
      value: lessonsToComplete,
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
            title="Quick access to lessons"
            subtitle="Pick up where you left off"
            onClick={() => navigate('/my-lessons')}
          >
            <div className="lesson-placeholders">
              {[1, 2, 3].map((idx) => (
                <div key={idx} className="lesson-row">
                  <div className="lesson-dot" />
                  <div className="lesson-text">
                  <div className="lesson-title-placeholder" />
                  <div className="lesson-meta-placeholder" />
                </div>
              </div>
            ))}
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
