import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ServiceWorkspacePage } from './pages/ServiceWorkspacePage';
import { SERVICES } from './data/services';
import { ThemeToggle } from './components/ThemeToggle';
import { ConsultationStudio } from './components/ConsultationStudio';

function WorkspaceChooser(){
  return <div className="workspace-chooser">
    <p className="eyebrow">S&S DESIGN BUILD / EZTAKEOFF</p>
    <h2>Choose your workspace</h2>
    <p className="muted">One construction model, two workflows. Use Admin Takeoff for detailed orders or Sales Consultation to design with homeowners.</p>
    <div className="workspace-choice-grid">
      <Link className="workspace-choice" to="/service/decks">
        <span className="workspace-choice-icon">▤</span><span className="workspace-choice-kicker">OFFICE & OPERATIONS</span>
        <strong>Admin Takeoff</strong>
        <span>Full service estimators, structural controls, framing plans, installer cuts and supplier material orders.</span>
        <b>Open takeoff workspace →</b>
      </Link>
      <Link className="workspace-choice sales-choice" to="/consultation">
        <span className="workspace-choice-icon">⌂</span><span className="workspace-choice-kicker">CLIENT PRESENTATIONS</span>
        <strong>Sales Consultation</strong>
        <span>Start with a house photo, draw the project live, select S&S products and show an interactive 3D design.</span>
        <b>Start consultation →</b>
      </Link>
    </div>
    <p className="workspace-choice-note">These are interface modes, not authentication roles. Salesperson permissions and cloud team sharing require a separate access-control rollout.</p>
  </div>;
}

export default function App() {
  const location=useLocation();
  const onSales=location.pathname.startsWith('/consultation');
  const onHome=location.pathname==='/';
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = window.localStorage.getItem('sns-theme');
    return stored === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('sns-theme', theme);
  }, [theme]);

  return (
    <div className={'shell shell-top-tabs'+(onSales?' shell--studio':'')}>
      <header className="topbar">
        <div className="brand-card brand-panel topbar-brand">
          <div className="brand-logo-wrap">
            <img src="/ss-logo.png" alt="S&S Design Build" className="brand-logo" />
          </div>
          <div className="topbar-copy">
            <p className="eyebrow">EZTakeoff · Design & Takeoff</p>
            <h1>S&amp;S Design Build</h1>
          </div>
          <div className="topbar-mode-actions">
            {!onHome&&<Link to="/" className="ghost-btn small-btn">Change workspace</Link>}
            <ThemeToggle theme={theme} onToggle={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} />
          </div>
        </div>
      </header>

      {!onSales&&!onHome&&<div className="tabs-sticky-wrap">
        <nav className="nav-group nav-tabs">
          {SERVICES.map((service) => (
            <NavLink
              key={service.slug}
              to={`/service/${service.slug}`}
              className={({ isActive }) => (isActive ? 'nav-link active nav-tab' : 'nav-link nav-tab')}
            >
              {service.label}
            </NavLink>
          ))}
        </nav>
      </div>}

      <main className="main-panel">
        <Routes>
          <Route path="/" element={<WorkspaceChooser/>} />
          <Route path="/consultation" element={<ConsultationStudio/>} />
          <Route path="/consultation/:projectId" element={<ConsultationStudio/>} />
          <Route path="/service/:serviceSlug" element={<ServiceWorkspacePage />} />
        </Routes>
      </main>
    </div>
  );
}
