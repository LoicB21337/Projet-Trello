import { useEffect, useRef, useState } from "react";

function Sidebar({
  session,
  projects,
  selectedProject,
  connected,
  userInitials,
  companyInitials,
  onNavigateHome,
  onCopyInviteCode,
  onLogout,
}) {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const workspaceRef = useRef(null);

  useEffect(() => {
    if (!workspaceOpen) return undefined;

    function closeOnOutsideClick(event) {
      if (!workspaceRef.current?.contains(event.target)) {
        setWorkspaceOpen(false);
      }
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") setWorkspaceOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [workspaceOpen]);

  return (
    <aside className="sidebar">
      <a
        className="brand"
        href="#home"
        aria-label="Tandem, accueil"
        onClick={onNavigateHome}
      >
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>tandem</span>
      </a>
      <div className="workspace-dropdown" ref={workspaceRef}>
        <button
          className="workspace-switcher"
          type="button"
          aria-expanded={workspaceOpen}
          aria-controls="workspace-menu"
          onClick={() => setWorkspaceOpen((open) => !open)}
        >
          <span className="workspace-monogram">{companyInitials}</span>
          <span className="workspace-name">{session.company.name}</span>
          <span className="switcher-chevron" aria-hidden="true">
            ⌄
          </span>
        </button>
        {workspaceOpen && (
          <section
            className="workspace-menu"
            id="workspace-menu"
            aria-label="Entreprise active"
          >
            <span className="workspace-menu-label">ENTREPRISE ACTUELLE</span>
            <div className="workspace-menu-company">
              <span className="workspace-menu-monogram">{companyInitials}</span>
              <span className="workspace-menu-name">
                <strong>{session.company.name}</strong>
                <small>
                  {session.user.role === "owner" ? "Administrateur" : "Membre"}
                </small>
              </span>
              <span className="workspace-selected" aria-label="Sélectionnée">
                ✓
              </span>
            </div>
            <div className="workspace-menu-invite">
              <span className="workspace-menu-label">CODE D'INVITATION</span>
              <div className="workspace-invite-row">
                <code>{session.company.invite_code}</code>
                <button type="button" onClick={onCopyInviteCode}>
                  Copier
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
      <p className="sidebar-label">ESPACE DE TRAVAIL</p>
      <nav className="sidebar-nav" aria-label="Navigation principale">
        <a
          href="#home"
          className={`nav-link${selectedProject ? "" : " active"}`}
          aria-current={selectedProject ? undefined : "page"}
          onClick={onNavigateHome}
        >
          <span className="nav-symbol board-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Mes tableaux</span>
          <span className="nav-count">{projects.length}</span>
        </a>
        {selectedProject && (
          <a href="#board" className="nav-link active" aria-current="page">
            <span className="nav-symbol board-symbol" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>{selectedProject.name}</span>
          </a>
        )}
      </nav>
      <div className="sidebar-bottom">
        <span className="sidebar-bottom-mark">{userInitials}</span>
        <span className="account-summary">
          <strong>{session.user.display_name}</strong>
          <small>
            {session.user.role === "owner" ? "Administrateur" : "Membre"}
          </small>
        </span>
        <span
          className={`online-dot${connected ? " connected" : ""}`}
          aria-label={connected ? "API connectée" : "API en attente"}
        />
        <button
          className="logout-button"
          type="button"
          onClick={onLogout}
          aria-label="Se déconnecter"
          title="Se déconnecter"
        >
          ↗
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
