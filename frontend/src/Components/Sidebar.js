import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './Sidebar.css';
import {
  FaTachometerAlt,
  FaBook,
  FaChartLine,
  FaUsers,
  FaPencilAlt,
  FaMarker,
  FaChevronLeft,
  FaChevronRight,
} from 'react-icons/fa';
import Profile from './Profile';

function Sidebar({ role = 'student' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('sidebarCollapsed');
    return stored === 'true';
  });

  const linksByRole = {
    student: [
      { name: 'Dashboard', icon: <FaTachometerAlt />, path: '/' },
      { name: 'My Lessons', icon: <FaBook />, path: '/my-lessons' },
      { name: 'Practice', icon: <FaPencilAlt />, path: '/practice' },
      { name: 'Progress', icon: <FaChartLine />, path: '/progress' },
    ],
    teacher: [
      { name: 'Dashboard', icon: <FaTachometerAlt />, path: '/' },
      { name: 'Lessons', icon: <FaBook />, path: '/lessons' },
      { name: 'Students', icon: <FaUsers />, path: '/students' },
      { name: 'Review', icon: <FaMarker />, path: '/review' },
    ],
  };

  const links = linksByRole[role] || [];
  const initials = fullName ? fullName.trim().charAt(0).toUpperCase() : '?';

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    if (!token) return;

    const fetchProfile = async () => {
      try {
        const res = await fetch('http://localhost:5144/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText || 'Failed to load profile.');
        }

        const data = await res.json();
        setFullName(data.fullName || data.FullName || '');
      } catch (err) {
        console.error(err);
        setError('Profile unavailable');
      }
    };

    fetchProfile();
  }, []);

  const handleSignOut = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('role');
    navigate('/login');
  };

  const handleEditProfile = () => {
    navigate('/profile');
  };

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebarCollapsed', String(next));
      return next;
    });
  };

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <Link to="/" className="logo-link">
          <img src="/images/EsolAI.png" alt="EsolAI Logo" className="logo" />
        </Link>
        <Profile
          name={fullName || error || 'Unknown User'}
          initials={initials}
          onEditProfile={handleEditProfile}
          onSignOut={handleSignOut}
        />
      </div>

      <div className="nav-container">
        <div className="nav">
          {links.map((link, idx) => (
            <Link
              to={link.path}
              key={idx}
              className={`nav-link ${isActive(link.path) ? 'active' : ''}`}
            >
              <span className="icon">{link.icon}</span>
              <span className="link-text">{link.name}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <button
          type="button"
          className="collapse-btn"
          onClick={toggleCollapsed}
          aria-label="Toggle sidebar"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <FaChevronRight /> : <FaChevronLeft />}
        </button>
      </div>
    </div>
  );
}

export default Sidebar;
