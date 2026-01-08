import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaPlus, FaChartLine, FaBookOpen, FaUsers, FaCheckCircle } from 'react-icons/fa';
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

function TeacherDashboard({ role }) {
  const navigate = useNavigate();
  const teacherName = useMemo(() => {
    const stored = localStorage.getItem('user');
    const parsed = stored ? JSON.parse(stored) : {};
    const profile = parsed.profile || {};
    return profile.fullName || profile.FullName || 'Teacher';
  }, []);
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
    []
  );
  const [classes, setClasses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingLessons, setLoadingLessons] = useState(true);
  const [summary, setSummary] = useState({ activeStudents: '--', lessonsInProgress: '--', averageScorePercent: '--' });
  const [loadingSummary, setLoadingSummary] = useState(false);

  const stats = [
    {
      label: 'Active students',
      value: loadingSummary ? '…' : summary.activeStudents,
      description: 'Across your classes',
      icon: <FaUsers />,
    },
    {
      label: 'Average score',
      value: loadingSummary
        ? '…'
        : typeof summary.averageScorePercent === 'number'
        ? `${summary.averageScorePercent}%`
        : summary.averageScorePercent,
      description: 'First attempts only',
      icon: <FaChartLine />,
    },
    {
      label: 'Lessons in progress',
      value: loadingSummary ? '…' : summary.lessonsInProgress,
      description: 'Published lessons',
      icon: <FaBookOpen />,
    },
  ];

  const formatDate = (raw) => {
    if (!raw) return 'No due date';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return 'No due date';
    return d.toLocaleDateString();
  };

  useEffect(() => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) {
      setLoadingClasses(false);
      setLoadingLessons(false);
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

    const loadLessons = async () => {
      try {
        const res = await fetch('http://localhost:5144/api/teacher/lessons', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Unable to load lessons.');
        const data = await res.json();
        const list = Array.isArray(data) ? data.slice(0, 5) : [];
        setLessons(list);
      } catch (err) {
        console.error(err);
        setLessons([]);
      } finally {
        setLoadingLessons(false);
      }
    };

    loadClasses();
    loadLessons();
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (!token) {
      setLoadingSummary(false);
      return;
    }
    const loadSummary = async () => {
      setLoadingSummary(true);
      try {
        const res = await fetch('http://localhost:5144/api/teacher/dashboard/summary', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setSummary({
          activeStudents: data.activeStudents ?? data.ActiveStudents ?? '--',
          lessonsInProgress: data.lessonsInProgress ?? data.LessonsInProgress ?? '--',
          averageScorePercent:
            data.averageScorePercent ?? data.AverageScorePercent ?? '--',
        });
      } catch (err) {
        console.error(err);
        setSummary({ activeStudents: '--', lessonsInProgress: '--', averageScorePercent: '--' });
      } finally {
        setLoadingSummary(false);
      }
    };
    loadSummary();
  }, []);

  return (
    <PageLayout title={null} role={role}>
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">{todayLabel}</p>
          <h1 className="page-title">Welcome back, {teacherName}</h1>
          <p className="section-subtitle">Track class progress, publish lessons, and review student work.</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="dash-button primary"
            onClick={() => navigate('/lessons?create=1')}
          >
            <FaPlus /> Create new lesson
          </button>
        </div>
      </div>

      <div className="section-header">
        <h2>Classroom at a glance</h2>
        <div className="header-badge">
          <FaCheckCircle />
          Key metrics to keep you on track
        </div>
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
        <div className="quick-link-card lesson-card">
          <div className="quick-link-title">Quick access to lessons</div>
          <div className="quick-link-subtitle">Recently updated</div>
          <div className="lesson-list">
            {loadingLessons ? (
              <div className="class-skeleton" />
            ) : lessons.length === 0 ? (
              <div className="empty-class">No lessons yet</div>
            ) : (
              lessons.map((lesson) => (
                <button
                  key={lesson.id || lesson.Id}
                  type="button"
                  className="lesson-item"
                  onClick={() => navigate('/lessons')}
                >
                  <div className="lesson-title">{lesson.title || lesson.Title}</div>
                  <div className="lesson-meta">
                    <span className={`status-pill tiny ${String(lesson.status || lesson.Status).toLowerCase()}`}>
                      {lesson.status || lesson.Status}
                    </span>
                    <span className="muted">{formatDate(lesson.dueDate || lesson.DueDate)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
          <Link to="/lessons" className="class-link">
            Manage all lessons
          </Link>
        </div>

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
