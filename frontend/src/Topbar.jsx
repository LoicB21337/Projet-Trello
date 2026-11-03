function Topbar({
  selectedProject,
  loading,
  projectsLoading,
  connected,
  onNavigateHome,
}) {
  const isLoading = selectedProject ? loading : projectsLoading;

  return (
    <header className="topbar">
      <nav className="breadcrumb" aria-label="Fil d’Ariane">
        {selectedProject ? (
          <a className="breadcrumb-home" href="#home" onClick={onNavigateHome}>
            Accueil
          </a>
        ) : (
          <span aria-current="page">Accueil</span>
        )}
        {selectedProject && (
          <>
            <span className="breadcrumb-slash">/</span>
            <strong aria-current="page">{selectedProject.name}</strong>
          </>
        )}
      </nav>
      <div className="topbar-right">
        <span className="connection-indicator">
          <i className={connected ? "connected" : ""} />
          {isLoading
            ? "Connexion…"
            : connected
              ? "Synchronisé"
              : "API indisponible"}
        </span>
      </div>
    </header>
  );
}

export default Topbar;
