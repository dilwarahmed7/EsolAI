import React, { useEffect, useRef, useState } from 'react';
import './Profile.css';

function Profile({
  name = '',
  initials = '?',
  onEditProfile,
  onSignOut,
}) {
  const [open, setOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('theme') === 'dark';
  });
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickAway = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, []);

  useEffect(() => {
    const root = document.body;
    if (isDarkMode) {
      root.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const handleAction = (callback) => {
    if (callback) {
      callback();
    }
    setOpen(false);
  };

  const handleToggleTheme = () => {
    setIsDarkMode((prev) => !prev);
  };

  return (
    <div className="profile-wrapper" ref={menuRef}>
      <button
        type="button"
        className="profile-toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Profile menu"
        title={name || 'Profile menu'}
      >
        <div className="avatar">{initials}</div>
      </button>

      {open && (
        <div className="profile-menu" role="menu">
          <div className="menu-name">{name || 'Unknown User'}</div>
          <div className="divider" />
          <button
            type="button"
            className="menu-item"
            onClick={() => handleAction(onEditProfile)}
          >
            Edit Profile
          </button>
          <button
            type="button"
            className="menu-item theme-toggle"
            onClick={handleToggleTheme}
            aria-pressed={isDarkMode}
          >
            <span className="toggle-text">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
            <span className={`toggle-switch ${isDarkMode ? 'on' : ''}`} aria-hidden="true">
              <span className="toggle-thumb" />
            </span>
          </button>
          <div className="divider" />
          <button
            type="button"
            className="menu-item danger"
            onClick={() => handleAction(onSignOut)}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

export default Profile;
