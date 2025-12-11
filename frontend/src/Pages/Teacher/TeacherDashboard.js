import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FaPlus, FaUserPlus, FaChartLine, FaBookOpen, FaUsers } from 'react-icons/fa';
import PageLayout from '../../Components/PageLayout';
import './TeacherDashboard.css';

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

const QuickLinkCard = ({ to, title, subtitle }) => (
  <Link to={to} className="quick-link-card">
    <div className="quick-link-title">{title}</div>
    {subtitle && <div className="quick-link-subtitle">{subtitle}</div>}
  </Link>
);

function TeacherDashboard({ role }) {
  const teacherName = useMemo(() => {
    const stored = localStorage.getItem('user');
    const parsed = stored ? JSON.parse(stored) : {};
    const profile = parsed.profile || {};
    return profile.fullName || profile.FullName || 'Teacher';
  }, []);

  const stats = [
    {
      label: 'Active students',
      value: '32',
      description: 'Logged in this week',
      icon: <FaUsers />,
    },
    {
      label: 'Average score',
      value: '86%',
      description: 'Across recent assessments',
      icon: <FaChartLine />,
    },
    {
      label: 'Lessons in progress',
      value: '12',
      description: 'Currently assigned',
      icon: <FaBookOpen />,
    },
  ];

  return (
    <PageLayout title={null} role={role}>
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Welcome back</p>
          <h1 className="page-title">Welcome back, {teacherName}</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="dash-button primary">
            <FaPlus /> Create new lesson
          </button>
          <button type="button" className="dash-button ghost">
            <FaUserPlus /> Add new student
          </button>
        </div>
      </div>

      <div className="section-header">
        <h2>Classroom at a glance</h2>
        <p className="section-subtitle">Key metrics to keep you on track</p>
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

      <div className="quick-links-grid">
        <QuickLinkCard to="/lessons" title="Quick access to lessons" subtitle="View and manage lessons" />
        <QuickLinkCard to="/students" title="Quick access to students" subtitle="Manage your class roster" />
      </div>

      <div className="dashboard-placeholder" />
    </PageLayout>
  );
}

export default TeacherDashboard;
