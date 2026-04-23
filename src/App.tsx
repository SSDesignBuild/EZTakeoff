import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ServiceWorkspacePage } from './pages/ServiceWorkspacePage';
import { SERVICES } from './data/services';
import { ThemeToggle } from './components/ThemeToggle';

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
    <div className="shell shell-top-tabs">
      <header className="topbar">
        <div className="brand-card brand-panel topbar-brand">
          <div className="brand-logo-wrap">
            <img src="/ss-logo.png" alt="S&S Design Build" className="brand-logo" />
          </div>
          <div className="topbar-copy">
            <p className="eyebrow">Estimator Studio</p>
            <h1>S&amp;S Design Build</h1>
          </div>
          <ThemeToggle theme={theme} onToggle={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} />
        </div>

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
      </header>

      <main className="main-panel">
        <Routes>
          <Route path="/" element={<Navigate to="/service/decks" replace />} />
          <Route path="/service/:serviceSlug" element={<ServiceWorkspacePage />} />
        </Routes>
      </main>
    </div>
  );
}
