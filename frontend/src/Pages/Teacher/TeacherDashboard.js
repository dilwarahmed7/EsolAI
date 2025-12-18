import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaPlus, FaChartLine, FaBookOpen, FaUsers } from 'react-icons/fa';
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
  const navigate = useNavigate();
  const teacherName = useMemo(() => {
    const stored = localStorage.getItem('user');
    const parsed = stored ? JSON.parse(stored) : {};
    const profile = parsed.profile || {};
    return profile.fullName || profile.FullName || 'Teacher';
  }, []);
  const [classes, setClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);

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

  useEffect(() => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) {
      setLoadingClasses(false);
      return;
    }

    const loadClasses = async () => {
      try {
        const res = await fetch('http://localhost:5144/api/teacher/classes', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Unable to load classes.');
        const data = await res.json();
        const list = Array.isArray(data) ? data.slice(0, 5) : [];
        setClasses(list);
      } catch (err) {
        console.error(err);
        setClasses([]);
      } finally {
        setLoadingClasses(false);
      }
    };

    loadClasses();
  }, []);

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
        <QuickLinkCard
          to="/lessons"
          title="Quick access to lessons"
          subtitle="View and manage lessons"
        />
        <div className="quick-link-card class-card">
          <div className="quick-link-title">Quick view of classes</div>
          <div className="quick-link-subtitle">See classes and manage students</div>
          <div className="class-list">
            {loadingClasses ? (
              <div className="class-skeleton" />
            ) : classes.length === 0 ? (
              <div className="empty-class">No classes yet</div>
            ) : (
              classes.map((cls) => {
                const id = cls.id || cls.Id;
                return (
                  <button
                    key={id}
                    type="button"
                    className="class-item"
                    onClick={() => navigate(`/students?classId=${id}`)}
                  >
                    {cls.name || cls.Name}
                  </button>
                );
              })
            )}
          </div>
          <Link to="/students" className="class-link">
            Manage all classes
          </Link>
        </div>
      </div>

      <div className="dashboard-placeholder" />
    </PageLayout>
  );
}

export default TeacherDashboard;
