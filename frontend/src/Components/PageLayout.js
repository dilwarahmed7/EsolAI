import Sidebar from './Sidebar';
import './PageLayout.css';

function PageLayout({ title, role, children }) {
  return (
    <div style={{ display: 'flex' }}>
      <Sidebar role={role} />
      <div className="main">
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

export default PageLayout;
