import React from 'react';
import Sidebar from './Sidebar';
import './PageLayout.css';

function PageLayout({ title, role }) {
  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={role} />
      <div className="main">
        <h1>{title}</h1>
      </div>
    </div>
  );
}

export default PageLayout;
