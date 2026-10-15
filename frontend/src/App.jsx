import { useEffect, useState } from "react";
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import AuthScreen from "./AuthScreen.jsx";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import { request } from "./api.js";
import "./App.css";

const columns = [
  { id: "todo", label: "À faire", color: "mint" },
  { id: "in_progress", label: "En cours", color: "amber" },
  { id: "done", label: "Terminé", color: "coral" },
];

async function loadWorkspace() {
  const [projects, members] = await Promise.all([
    request("/api/projects"),
    request("/api/users"),
  ]);
  return { projects, members };
}

function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("fr");
}

function TaskCard({ task, assignee, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
    });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-item${isDragging ? " is-dragging" : ""}`}
    >
      <article className="task-card" {...attributes} {...listeners}>
        <div className="task-card-topline">
          <span className="task-kind">
            <span aria-hidden="true" /> Tâche
          </span>
        </div>
        <p className="task-title">{task.title}</p>
        <div className="task-card-footer">
          <span className="task-date">
            {new Date(task.created_at).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "short",
            })}
          </span>
          <span
            className="task-avatar"
            aria-label={
              assignee
                ? `Assigné à ${assignee.display_name}`
                : "Aucun responsable"
            }
          >
            {initials(assignee?.display_name || "?")}
          </span>
        </div>
      </article>
      <button
        className="icon-button edit-task"
        type="button"
        aria-label={`Modifier ${task.title}`}
        title="Modifier la tâche"
        onClick={() => onEdit(task)}
      >
        ✎
      </button>
      <button
        className="icon-button delete-task"
        type="button"
        aria-label={`Supprimer ${task.title}`}
        title="Supprimer la tâche"
        onClick={() => onDelete(task.id)}
      >
        ×
      </button>
    </div>
  );
}

function BoardColumn({ column, tasks, members, onDelete, onAdd }) {
  const { isOver, setNodeRef } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      className={`board-column column-${column.color}${isOver ? " is-over" : ""}`}
      aria-label={`${column.label}, ${tasks.length} tâches`}
    >
      <header className="column-heading">
        <div className="column-title-wrap">
          <span className="column-dot" />
          <h2>{column.label}</h2>
          <span className="column-count">{tasks.length}</span>
        </div>
        <button
          className="icon-button column-add"
          type="button"
          aria-label={`Ajouter une tâche ${column.label.toLowerCase()}`}
          title="Ajouter une tâche"
          onClick={() => onAdd(column.id)}
        >
          +
        </button>
      </header>
      <div className="column-tasks">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            assignee={members.find((member) => member.id === task.assignee_id)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
        {tasks.length === 0 && (
          <p className="empty-column">Déposez une tâche ici</p>
        )}
      </div>
    </section>
  );
}

function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [session, setSession] = useState(null);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [projectDialog, setProjectDialog] = useState(null);
  const [projectName, setProjectName] = useState("");
  const [projectMemberIds, setProjectMemberIds] = useState([]);
  const [projectSaving, setProjectSaving] = useState(false);
  const [dialogStatus, setDialogStatus] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const [editingTask, setEditingTask] = useState(null);
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    let active = true;
    async function restoreWorkspace() {
      try {
        const account = await request("/api/auth/me");
        const workspace = await loadWorkspace();
        if (active) {
          setSession(account);
          setProjects(workspace.projects);
          setMembers(workspace.members);
          setSelectedProject(null);
          setConnected(true);
        }
      } catch (cause) {
        if (active && cause.status !== 401) setError(cause.message);
      } finally {
        if (active) {
          setProjectsLoading(false);
          setAuthChecked(true);
        }
      }
    }
    restoreWorkspace();
    return () => {
      active = false;
    };
  }, []);

  async function handleAuthenticated(account) {
    const workspace = await loadWorkspace();
    setSession(account);
    setProjects(workspace.projects);
    setMembers(workspace.members);
    setSelectedProject(null);
    setTasks([]);
    setConnected(true);
    setError("");
  }

  async function logout() {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } finally {
      setSession(null);
      setProjects([]);
      setMembers([]);
      setSelectedProject(null);
      setTasks([]);
      setConnected(false);
    }
  }

  const selectedProjectId = selectedProject?.id;

  useEffect(() => {
    if (!selectedProjectId) return undefined;
    let active = true;
    request(`/api/projects/${selectedProjectId}/tasks`)
      .then((items) => {
        if (active) {
          setTasks(items);
          setConnected(true);
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedProjectId]);

  async function saveProject(event) {
    event.preventDefault();
    const name = projectName.trim();
    if (!name || projectSaving) return;
    setProjectSaving(true);
    setError("");
    const editing = projectDialog?.mode === "edit";
    const path = editing
      ? `/api/projects/${projectDialog.project.id}`
      : "/api/projects";
    try {
      const project = await request(path, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ name, member_ids: projectMemberIds }),
      });
      setProjects((current) =>
        editing
          ? current.map((item) => (item.id === project.id ? project : item))
          : [...current, project],
      );
      if (editing && selectedProject?.id === project.id) {
        setSelectedProject(project);
      }
      setProjectDialog(null);
      setProjectName("");
      setProjectMemberIds([]);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setProjectSaving(false);
    }
  }

  async function deleteProject(project) {
    if (
      !window.confirm(
        `Supprimer le tableau « ${project.name} » et toutes ses tâches ?`,
      )
    ) {
      return;
    }
    setError("");
    try {
      await request(`/api/projects/${project.id}`, { method: "DELETE" });
      setProjects((current) =>
        current.filter((item) => item.id !== project.id),
      );
      if (selectedProject?.id === project.id) setSelectedProject(null);
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function addTask(event) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || saving || !selectedProject) return;
    setSaving(true);
    setError("");
    const editing = editingTask !== null;
    try {
      const path = editing
        ? `/api/projects/${selectedProject.id}/tasks/${editingTask.id}`
        : `/api/projects/${selectedProject.id}/tasks`;
      const task = await request(path, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          title,
          status: dialogStatus,
          assignee_id: newAssigneeId || null,
        }),
      });
      setTasks((current) =>
        editing
          ? current.map((item) => (item.id === task.id ? task : item))
          : [...current, task],
      );
      setNewTitle("");
      setNewAssigneeId("");
      setEditingTask(null);
      setDialogStatus(null);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(taskId, nextStatus) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === nextStatus) return;
    setError("");
    try {
      const updated = await request(
        `/api/projects/${selectedProject.id}/tasks/${taskId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      setTasks((current) =>
        current.map((item) => (item.id === taskId ? updated : item)),
      );
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function deleteTask(taskId) {
    setError("");
    try {
      await request(`/api/projects/${selectedProject.id}/tasks/${taskId}`, {
        method: "DELETE",
      });
      setTasks((current) => current.filter((item) => item.id !== taskId));
    } catch (cause) {
      setError(cause.message);
    }
  }

  function handleDragEnd({ active, over }) {
    if (!over) return;
    const targetColumn = columns.some((column) => column.id === over.id)
      ? over.id
      : tasks.find((task) => task.id === over.id)?.status;
    if (targetColumn) changeStatus(active.id, targetColumn);
  }

  const filteredTasks = tasks.filter((task) =>
    task.title.toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr")),
  );
  const completedCount = tasks.filter((task) => task.status === "done").length;
  const canManageProject = (project) =>
    session.user.role === "owner" || project.created_by === session.user.id;
  const projectMembers = members.filter((member) =>
    selectedProject?.member_ids.includes(member.id),
  );
  const assignableMembers = projectMembers.length
    ? projectMembers
    : members.filter((member) => member.id === session?.user.id);
  const userInitials = initials(
    session?.user.display_name || session?.user.email,
  );

  async function copyInviteCode() {
    try {
      await navigator.clipboard.writeText(session.company.invite_code);
    } catch {
      setError("Impossible de copier le code d'invitation.");
    }
  }

  function editTask(task) {
    setEditingTask(task);
    setNewTitle(task.title);
    setNewAssigneeId(task.assignee_id || "");
    setDialogStatus(task.status);
  }

  function openTaskDialog(status) {
    setEditingTask(null);
    setNewTitle("");
    setNewAssigneeId("");
    setDialogStatus(status);
  }

  function navigateHome() {
    setSelectedProject(null);
    setTasks([]);
  }

  if (!authChecked) {
    return <main className="auth-loading">Connexion à votre espace…</main>;
  }
  if (!session) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        session={session}
        projects={projects}
        selectedProject={selectedProject}
        connected={connected}
        userInitials={userInitials}
        companyInitials={initials(session.company.name)}
        onNavigateHome={navigateHome}
        onCopyInviteCode={copyInviteCode}
        onLogout={logout}
      />

      <main className="main-area" id={selectedProject ? "board" : "home"}>
        <Topbar
          companyName={session.company.name}
          selectedProject={selectedProject}
          loading={loading}
          projectsLoading={projectsLoading}
          connected={connected}
          onNavigateHome={navigateHome}
        />

        {selectedProject ? (
          <div className="page-content">
            <section className="project-heading">
              <div className="project-heading-copy">
                <div className="eyebrow">
                  <span className="eyebrow-line" /> TABLEAU DE PROJET
                </div>
                <h1>
                  {selectedProject.name}
                  <span className="title-period">.</span>
                </h1>
                <p>Les prochaines étapes, au même endroit.</p>
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={() => openTaskDialog("todo")}
              >
                <span aria-hidden="true">+</span> Nouvelle tâche
              </button>
            </section>

            <section className="board-toolbar" aria-label="Outils du tableau">
              <div className="board-tabs">
                <span className="tab-active">
                  <span className="tab-grid" aria-hidden="true">
                    ▦
                  </span>{" "}
                  Tableau
                </span>
                <span className="board-separator" />
              </div>
              <div className="toolbar-actions">
                <label className="search-box">
                  <span className="search-icon" aria-hidden="true" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Rechercher une tâche"
                    aria-label="Rechercher une tâche"
                  />
                  <kbd>/</kbd>
                </label>
                <span className="board-total">
                  {tasks.length} tâche{tasks.length > 1 ? "s" : ""}
                </span>
              </div>
            </section>

            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}

            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragEnd={handleDragEnd}
            >
              <div className="board-grid">
                {columns.map((column) => (
                  <BoardColumn
                    key={column.id}
                    column={column}
                    members={members}
                    tasks={filteredTasks.filter(
                      (task) => task.status === column.id,
                    )}
                    onEdit={editTask}
                    onDelete={deleteTask}
                    onAdd={openTaskDialog}
                  />
                ))}
                {loading && (
                  <div className="board-loading">Chargement du tableau…</div>
                )}
              </div>
            </DndContext>

            <footer className="board-footer">
              <span>
                <i /> {completedCount} tâche{completedCount > 1 ? "s" : ""}{" "}
                terminée{completedCount > 1 ? "s" : ""}
              </span>
              <span>Données enregistrées</span>
            </footer>
          </div>
        ) : (
          <div className="home-content">
            <section className="home-heading">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-line" /> ESPACE DE TRAVAIL
                </div>
                <h1>
                  Vos tableaux<span className="title-period">.</span>
                </h1>
                <p>Retrouvez et gérez vos projets au même endroit.</p>
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setProjectName("");
                  setProjectMemberIds([]);
                  setProjectDialog({ mode: "create" });
                }}
              >
                <span aria-hidden="true">+</span> Nouveau tableau
              </button>
            </section>

            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}

            <section
              className="projects-section"
              aria-labelledby="projects-title"
            >
              <div className="projects-section-heading">
                <h2 id="projects-title">Tous les tableaux</h2>
                <span>
                  {projects.length} élément{projects.length > 1 ? "s" : ""}
                </span>
              </div>
              {projectsLoading ? (
                <div className="home-state">Chargement des tableaux…</div>
              ) : projects.length > 0 ? (
                <div className="project-grid">
                  {projects.map((project, index) => (
                    <article className="project-card" key={project.id}>
                      <button
                        className={`project-card-open project-accent-${index % 3}`}
                        type="button"
                        onClick={() => {
                          setError("");
                          setLoading(true);
                          setTasks([]);
                          setSelectedProject(project);
                        }}
                        aria-label={`Ouvrir le tableau ${project.name}`}
                      >
                        <span className="project-card-icon" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                        <span className="project-card-name">
                          {project.name}
                        </span>
                        <span className="project-card-arrow" aria-hidden="true">
                          ↗
                        </span>
                      </button>
                      <div className="project-card-footer">
                        <span>
                          Créé le{" "}
                          {new Date(project.created_at).toLocaleDateString(
                            "fr-FR",
                            {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            },
                          )}
                        </span>
                        {canManageProject(project) && (
                          <div className="project-card-actions">
                            <button
                              className="icon-button"
                              type="button"
                              aria-label={`Renommer ${project.name}`}
                              title="Renommer"
                              onClick={() => {
                                setProjectName(project.name);
                                setProjectMemberIds(project.member_ids);
                                setProjectDialog({ mode: "edit", project });
                              }}
                            >
                              <span aria-hidden="true">✎</span>
                            </button>
                            <button
                              className="icon-button project-delete"
                              type="button"
                              aria-label={`Supprimer ${project.name}`}
                              title="Supprimer"
                              onClick={() => deleteProject(project)}
                            >
                              <span aria-hidden="true">×</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="home-state empty-projects">
                  <span className="empty-project-mark" aria-hidden="true">
                    ＋
                  </span>
                  <h3>Aucun tableau pour le moment</h3>
                  <p>
                    Créez votre premier tableau pour commencer à organiser vos
                    tâches.
                  </p>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setProjectName("");
                      setProjectMemberIds([]);
                      setProjectDialog({ mode: "create" });
                    }}
                  >
                    Créer un tableau
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {projectDialog && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setProjectDialog(null)
          }
        >
          <form
            className="task-dialog"
            onSubmit={saveProject}
            aria-labelledby="project-dialog-title"
          >
            <div className="dialog-heading">
              <div>
                <span className="dialog-eyebrow">
                  {projectDialog.mode === "edit"
                    ? "MODIFIER LE TABLEAU"
                    : "NOUVEAU TABLEAU"}
                </span>
                <h2 id="project-dialog-title">
                  {projectDialog.mode === "edit"
                    ? "Renommer le tableau"
                    : "Créer un tableau"}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button dialog-close"
                aria-label="Fermer"
                onClick={() => setProjectDialog(null)}
              >
                ×
              </button>
            </div>
            <label className="field-label" htmlFor="project-name">
              Nom du tableau
            </label>
            <input
              id="project-name"
              autoFocus
              maxLength={120}
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Ex. Lancement produit"
              required
            />
            <fieldset className="member-fieldset">
              <legend className="field-label">Membres du projet</legend>
              {members.filter((member) => member.id !== session.user.id)
                .length > 0 ? (
                members
                  .filter((member) => member.id !== session.user.id)
                  .map((member) => (
                    <label key={member.id} className="member-option">
                      <input
                        type="checkbox"
                        checked={projectMemberIds.includes(member.id)}
                        onChange={(event) =>
                          setProjectMemberIds((current) =>
                            event.target.checked
                              ? [...current, member.id]
                              : current.filter((id) => id !== member.id),
                          )
                        }
                      />
                      <span className="member-option-avatar">
                        {initials(member.display_name)}
                      </span>
                      <span className="member-option-copy">
                        <strong>{member.display_name}</strong>
                        <small>{member.email}</small>
                      </span>
                    </label>
                  ))
              ) : (
                <p className="member-empty">
                  Invitez des collègues avec le code affiché dans la barre
                  latérale.
                </p>
              )}
            </fieldset>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setProjectDialog(null)}
              >
                Annuler
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={projectSaving}
              >
                {projectSaving
                  ? "Enregistrement…"
                  : projectDialog.mode === "edit"
                    ? "Enregistrer"
                    : "Créer le tableau"}
              </button>
            </div>
          </form>
        </div>
      )}

      {dialogStatus && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setDialogStatus(null)
          }
        >
          <form
            className="task-dialog"
            onSubmit={addTask}
            aria-labelledby="dialog-title"
          >
            <div className="dialog-heading">
              <div>
                <span className="dialog-eyebrow">
                  {editingTask ? "MODIFIER LA TÂCHE" : "NOUVELLE TÂCHE"}
                </span>
                <h2 id="dialog-title">
                  {editingTask ? "Modifier la tâche" : "Ajouter au tableau"}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button dialog-close"
                aria-label="Fermer"
                onClick={() => {
                  setDialogStatus(null);
                  setEditingTask(null);
                }}
              >
                ×
              </button>
            </div>
            <label className="field-label" htmlFor="task-title">
              Nom de la tâche
            </label>
            <input
              id="task-title"
              autoFocus
              maxLength={160}
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Ex. Préparer les maquettes"
              required
            />
            <label className="field-label" htmlFor="task-status">
              Statut
            </label>
            <select
              id="task-status"
              value={dialogStatus}
              onChange={(event) => setDialogStatus(event.target.value)}
            >
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.label}
                </option>
              ))}
            </select>
            <label className="field-label" htmlFor="task-assignee">
              Responsable
            </label>
            <select
              id="task-assignee"
              value={newAssigneeId}
              onChange={(event) => setNewAssigneeId(event.target.value)}
            >
              <option value="">Non assignée</option>
              {assignableMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.display_name}
                </option>
              ))}
            </select>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setDialogStatus(null);
                  setEditingTask(null);
                }}
              >
                Annuler
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={saving}
              >
                {saving
                  ? "Enregistrement…"
                  : editingTask
                    ? "Enregistrer"
                    : "Créer la tâche"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
