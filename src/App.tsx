import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { ServiceWorkspacePage } from './pages/ServiceWorkspacePage';
import { ArchitecturePage } from './pages/ArchitecturePage';
import { SERVICES } from './data/services';
import { ThemeToggle } from './components/ThemeToggle';

const navItems = [
  { label: 'Dashboard', to: '/' },
  { label: 'Architecture', to: '/architecture' },
];

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = window.localStorage.getItem('sns-theme');
    return stored === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('sns-theme', theme);
  }, [theme]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-card brand-panel">
          <div className="brand-logo-wrap">
            <img src="/ss-logo.png" alt="S&S Design Build" className="brand-logo" />
          </div>
          <div>
            <p className="eyebrow">Estimator Studio</p>
            <h1>S&amp;S Design Build</h1>
            <p className="muted">Fast take-offs, material grouping, and layout visualization for decks, patio covers, and screen systems.</p>
          </div>
          <ThemeToggle theme={theme} onToggle={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} />
        </div>

        <nav className="nav-group">
          <p className="nav-title">Workspace</p>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} end>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <nav className="nav-group">
          <p className="nav-title">Services</p>
          {SERVICES.map((service) => (
            <NavLink
              key={service.slug}
              to={`/service/${service.slug}`}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {service.label}
            </NavLink>
          ))}
        </nav>

      </aside>

      <main className="main-panel">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/architecture" element={<ArchitecturePage />} />
          <Route path="/service/:serviceSlug" element={<ServiceWorkspacePage />} />
        </Routes>
      </main>
    </div>
  );
}
