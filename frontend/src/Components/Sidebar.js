import React from 'react';
import { Link, useLocation } from 'react-router-dom'; // import useLocation
import './Sidebar.css';
import { FaTachometerAlt, FaBook, FaChartLine, FaUsers } from 'react-icons/fa';

function Sidebar({ role = 'student' }) {
  const location = useLocation(); // call the hook here

  const linksByRole = {
    student: [
      { name: 'Dashboard', icon: <FaTachometerAlt />, path: '/' },
      { name: 'My Lessons', icon: <FaBook />, path: '/my-lessons' },
      { name: 'Progress', icon: <FaChartLine />, path: '/progress' },
    ],
    teacher: [
      { name: 'Dashboard', icon: <FaTachometerAlt />, path: '/' },
      { name: 'Lessons', icon: <FaBook />, path: '/lessons' },
      { name: 'Students', icon: <FaUsers />, path: '/students' },
    ],
  };

  const links = linksByRole[role] || [];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="logo">EsolAI</div>
        <div className="profile">DA</div>
      </div>

      <div className="nav-container">
        <div className="nav">
          {links.map((link, idx) => (
            <Link
              to={link.path}
              key={idx}
              className={`nav-link ${location.pathname === link.path ? 'active' : ''}`}
            >
              <span className="icon">{link.icon}</span>
              <span className="link-text">{link.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
