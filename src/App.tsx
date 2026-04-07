import { NavLink, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { ServiceWorkspacePage } from './pages/ServiceWorkspacePage';
import { ArchitecturePage } from './pages/ArchitecturePage';
import { SERVICES } from './data/services';

const navItems = [
  { label: 'Dashboard', to: '/' },
  { label: 'Architecture', to: '/architecture' },
];

export default function App() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-card">
          <img src="/logo-mark.svg" alt="S&S Design Build" className="brand-logo" />
          <div>
            <p className="eyebrow">Take-Off Studio</p>
            <h1>S&S Design Build</h1>
            <p className="muted">Fast estimating, layout visualization, and order prep.</p>
          </div>
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

        <div className="sidebar-footer">
          <p className="eyebrow">Built for Netlify</p>
          <p className="muted">React + TypeScript front end with rule-driven estimating and room to grow into Supabase.</p>
        </div>
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
