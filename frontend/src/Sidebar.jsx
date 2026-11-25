import { useEffect, useRef, useState } from "react";

function Sidebar({
  session,
  projects,
  projectsLoading,
  selectedProject,
  activeView,
  connected,
  userInitials,
  companyInitials,
  onNavigateHome,
  onSelectProject,
  onOpenCalendar,
  onCopyInviteCode,
  onManageWorkspace,
  onLogout,
}) {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(
    () =>
      window.localStorage.getItem(
        `tandem-projects-expanded:${session.user.id}`,
      ) === "true",
  );
  const workspaceRef = useRef(null);

  useEffect(() => {
    window.localStorage.setItem(
      `tandem-projects-expanded:${session.user.id}`,
      String(projectsExpanded),
    );
  }, [projectsExpanded, session.user.id]);

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
            {session.user.role === "owner" && (
              <button
                className="workspace-manage-button"
                type="button"
                onClick={() => {
                  setWorkspaceOpen(false);
                  onManageWorkspace();
                }}
              >
                Gérer l’entreprise
              </button>
            )}
          </section>
        )}
      </div>
      <p className="sidebar-label">ESPACE DE TRAVAIL</p>
      <nav className="sidebar-nav" aria-label="Navigation principale">
        <button
          className="nav-link projects-toggle"
          type="button"
          aria-expanded={projectsExpanded}
          aria-controls="sidebar-project-list"
          onClick={() => setProjectsExpanded((expanded) => !expanded)}
        >
          <span className="nav-symbol board-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Mes tableaux</span>
          <span className="nav-count">{projects.length}</span>
          <span className="projects-chevron" aria-hidden="true">
            ⌄
          </span>
        </button>
        {projectsExpanded && (
          <div className="sidebar-projects" id="sidebar-project-list">
            {projectsLoading ? (
              <p className="sidebar-projects-empty">Chargement…</p>
            ) : projects.length > 0 ? (
              projects.map((project) => (
                <button
                  className={`nav-link sidebar-project-link${selectedProject?.id === project.id ? " active" : ""}`}
                  key={project.id}
                  type="button"
                  title={project.name}
                  aria-label={`Ouvrir le tableau ${project.name}`}
                  aria-current={
                    selectedProject?.id === project.id ? "page" : undefined
                  }
                  onClick={() => onSelectProject(project)}
                >
                  <span className="nav-symbol board-symbol" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>{project.name}</span>
                </button>
              ))
            ) : (
              <p className="sidebar-projects-empty">Aucun tableau</p>
            )}
          </div>
        )}
        <button
          className={`nav-link sidebar-calendar-link${activeView === "calendar" ? " active" : ""}`}
          type="button"
          aria-label="Ouvrir le calendrier"
          aria-current={activeView === "calendar" ? "page" : undefined}
          onClick={onOpenCalendar}
        >
          <span className="nav-symbol calendar-symbol" aria-hidden="true">
            <i />
            <i />
          </span>
          <span>Calendrier</span>
        </button>
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
