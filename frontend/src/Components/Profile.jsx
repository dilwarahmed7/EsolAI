import React, { useEffect, useRef, useState } from 'react';
import './Profile.css';

function Profile({
  name = '',
  initials = '?',
  onEditProfile,
  onSettings,
  onSignOut,
}) {
  const [open, setOpen] = useState(false);
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

  const handleAction = (callback) => {
    if (callback) {
      callback();
    }
    setOpen(false);
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
            className="menu-item"
            onClick={() => handleAction(onSettings)}
          >
            Settings
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
