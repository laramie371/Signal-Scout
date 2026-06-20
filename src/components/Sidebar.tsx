import type { AppPage } from "../types/project";

type SidebarProps = {
  page: AppPage;
  onChange: (page: AppPage) => void;
};

const navItems: { id: AppPage; label: string; description: string }[] = [
  { id: "dashboard", label: "Dashboard", description: "Review matches" },
  { id: "projects", label: "Projects", description: "Keywords and filters" },
  { id: "settings", label: "Settings", description: "RSS and AI options" },
];

export function Sidebar({ page, onChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-icon">SS</div>
        <div>
          <p className="eyebrow">Signal Scout</p>
          <h1>Opportunity Radar</h1>
        </div>
      </div>

      <nav className="nav-list">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${page === item.id ? "active" : ""}`}
            onClick={() => onChange(item.id)}
            type="button"
          >
            <span>{item.label}</span>
            <small>{item.description}</small>
          </button>
        ))}
      </nav>

      <div className="sidebar-note">
        <strong>Human-in-the-loop.</strong>
        <span>Find relevant conversations, draft carefully, then reply manually.</span>
      </div>
    </aside>
  );
}
