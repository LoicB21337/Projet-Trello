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
import DeadlineCalendar from "./DeadlineCalendar.jsx";
import Sidebar from "./Sidebar.jsx";
import TaskChecklistEditor from "./TaskChecklistEditor.jsx";
import Topbar from "./Topbar.jsx";
import { request } from "./api.js";
import "./App.css";

const columns = [
  { id: "todo", label: "À faire", color: "mint" },
  { id: "in_progress", label: "En cours", color: "amber" },
  { id: "done", label: "Terminé", color: "coral" },
];

async function loadWorkspace() {
  const [projects, members, company] = await Promise.all([
    request("/api/projects"),
    request("/api/users"),
    request("/api/company"),
  ]);
  return { projects, members, company };
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

function taskAssigneeIds(task) {
  if (Array.isArray(task.assignee_ids)) return task.assignee_ids;
  return task.assignee_id ? [task.assignee_id] : [];
}

function TaskCard({ task, assignees, blockedBy, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      disabled: task.status === "todo" && blockedBy.length > 0,
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
        {task.description && (
          <p className="task-description">{task.description}</p>
        )}
        {task.checklist?.length > 0 && (
          <p className="task-checklist-progress">
            ✓ {task.checklist.filter((item) => item.completed).length}/
            {task.checklist.length} étapes
          </p>
        )}
        {blockedBy.length > 0 && (
          <p
            className="task-blocked"
            title={blockedBy.map((blocker) => blocker.title).join(", ")}
            aria-label={`Bloquée par ${blockedBy.map((blocker) => blocker.title).join(", ")}`}
          >
            En attente de {blockedBy.length} tâche
            {blockedBy.length > 1 ? "s" : ""}
          </p>
        )}
        <div className="task-card-footer">
          <span className="task-date">
            {task.due_at ? (
              <>
                <strong>Échéance</strong>{" "}
                {new Date(task.due_at).toLocaleString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </>
            ) : (
              "Sans échéance"
            )}
          </span>
          <span
            className="task-assignees"
            role="group"
            aria-label={
              assignees.length
                ? `Assignée à ${assignees.map((member) => member.display_name).join(", ")}`
                : "Aucune personne assignée"
            }
          >
            {assignees.length ? (
              <>
                {assignees.slice(0, 3).map((member) => (
                  <span
                    className="task-avatar"
                    key={member.id}
                    title={member.display_name}
                    aria-hidden="true"
                  >
                    {initials(member.display_name)}
                  </span>
                ))}
                {assignees.length > 3 && (
                  <span
                    className="task-avatar task-avatar-overflow"
                    aria-hidden="true"
                  >
                    +{assignees.length - 3}
                  </span>
                )}
              </>
            ) : (
              <span className="task-avatar" aria-hidden="true">
                ?
              </span>
            )}
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

function BoardColumn({
  column,
  tasks,
  allTasks,
  members,
  onEdit,
  onDelete,
  onAdd,
}) {
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
            blockedBy={(task.blocked_by_ids || [])
              .map((taskId) => allTasks.find((item) => item.id === taskId))
              .filter((blocker) => blocker && blocker.status !== "done")}
            assignees={taskAssigneeIds(task)
              .map((assigneeId) =>
                members.find((member) => member.id === assigneeId),
              )
              .filter(Boolean)}
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
  const [activeView, setActiveView] = useState("home");
  const [tasks, setTasks] = useState([]);
  const [calendarTasks, setCalendarTasks] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [projectDialog, setProjectDialog] = useState(null);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectMemberIds, setProjectMemberIds] = useState([]);
  const [projectSaving, setProjectSaving] = useState(false);
  const [workspaceDialog, setWorkspaceDialog] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [memberEdits, setMemberEdits] = useState({});
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [dialogStatus, setDialogStatus] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDueAt, setNewDueAt] = useState("");
  const [newAssigneeIds, setNewAssigneeIds] = useState([]);
  const [newChecklistItems, setNewChecklistItems] = useState([]);
  const [newBlockedByIds, setNewBlockedByIds] = useState([]);
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
          setProjects(workspace.projects);
          setMembers(workspace.members);
          setSession({ ...account, company: workspace.company });
          setCompanyName(workspace.company.name);
          setSelectedProject(null);
          setActiveView("home");
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
    setSession({ ...account, company: workspace.company });
    setProjects(workspace.projects);
    setMembers(workspace.members);
    setCompanyName(workspace.company.name);
    setSelectedProject(null);
    setActiveView("home");
    setTasks([]);
    setConnected(true);
    setError("");
  }

  function clearLocalSession() {
    setSession(null);
    setProjects([]);
    setMembers([]);
    setSelectedProject(null);
    setActiveView("home");
    setTasks([]);
    setCalendarTasks([]);
    setCalendarLoading(false);
    setConnected(false);
    setWorkspaceDialog(false);
  }

  async function logout() {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } catch (cause) {
      setError(cause.message);
    } finally {
      clearLocalSession();
    }
  }

  const selectedProjectId = selectedProject?.id;

  useEffect(() => {
    if (!selectedProjectId || activeView !== "board") return undefined;
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
  }, [activeView, selectedProjectId]);

  useEffect(() => {
    if (activeView !== "calendar" || !session?.user.id) return undefined;
    let active = true;
    Promise.all(
      projects.map((project) =>
        request(`/api/projects/${project.id}/tasks`),
      ),
    )
      .then((taskLists) => {
        if (active) {
          setCalendarTasks(
            taskLists
              .flat()
              .filter((task) =>
                taskAssigneeIds(task).includes(session.user.id),
              ),
          );
          setConnected(true);
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setCalendarLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeView, projects, session?.user.id]);

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
        body: JSON.stringify({
          name,
          description: projectDescription.trim(),
          member_ids: projectMemberIds,
        }),
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
      setProjectDescription("");
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
      if (selectedProject?.id === project.id) {
        setSelectedProject(null);
        setActiveView("home");
      }
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
          description: newDescription.trim(),
          due_at: newDueAt ? new Date(newDueAt).toISOString() : null,
          status: dialogStatus,
          assignee_ids: newAssigneeIds,
          checklist: newChecklistItems,
          blocked_by_ids: newBlockedByIds,
        }),
      });
      setTasks((current) =>
        editing
          ? current.map((item) => (item.id === task.id ? task : item))
          : [...current, task],
      );
      setNewTitle("");
      setNewDescription("");
      setNewDueAt("");
      setNewAssigneeIds([]);
      setNewChecklistItems([]);
      setNewBlockedByIds([]);
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
      setTasks((current) =>
        current
          .filter((item) => item.id !== taskId)
          .map((item) => ({
            ...item,
            blocked_by_ids: (item.blocked_by_ids || []).filter(
              (dependencyId) => dependencyId !== taskId,
            ),
          })),
      );
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
  const selectedAssigneeNames = assignableMembers
    .filter((member) => newAssigneeIds.includes(member.id))
    .map((member) => member.display_name)
    .join(", ");
  const selectedDependencyNames = newBlockedByIds
    .map((taskId) => tasks.find((task) => task.id === taskId)?.title)
    .filter(Boolean)
    .join(", ");
  const hasUnfinishedPrerequisites = newBlockedByIds.some(
    (taskId) => tasks.find((task) => task.id === taskId)?.status !== "done",
  );
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
    setNewDescription(task.description || "");
    setNewDueAt(
      task.due_at
        ? new Date(
            new Date(task.due_at).getTime() -
              new Date(task.due_at).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : "",
    );
    setNewAssigneeIds(taskAssigneeIds(task));
    setNewChecklistItems(task.checklist || []);
    setNewBlockedByIds(task.blocked_by_ids || []);
    setDialogStatus(task.status);
  }

  function openTaskDialog(status) {
    setEditingTask(null);
    setNewTitle("");
    setNewDescription("");
    setNewDueAt("");
    setNewAssigneeIds([]);
    setNewChecklistItems([]);
    setNewBlockedByIds([]);
    setDialogStatus(status);
  }

  function navigateHome() {
    setActiveView("home");
    setSelectedProject(null);
    setTasks([]);
  }

  function openCalendar() {
    if (activeView === "calendar") return;
    setError("");
    setCalendarLoading(true);
    setActiveView("calendar");
  }

  function openProject(project) {
    setError("");
    setActiveView("board");
    setLoading(true);
    setTasks([]);
    setSelectedProject(project);
  }

  function openCalendarProject(projectId) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) {
      setError("Le tableau de cette tâche est introuvable.");
      return;
    }
    openProject(project);
  }

  function editProject(project) {
    setProjectName(project.name);
    setProjectDescription(project.description || "");
    setProjectMemberIds(project.member_ids);
    setProjectDialog({ mode: "edit", project });
  }

  function openWorkspaceDialog() {
    setError("");
    setCompanyName(session.company.name);
    setMemberEdits(
      Object.fromEntries(
        members.map((member) => [
          member.id,
          { display_name: member.display_name, email: member.email },
        ]),
      ),
    );
    setWorkspaceDialog(true);
  }

  async function saveCompany(event) {
    event.preventDefault();
    const name = companyName.trim();
    if (!name || workspaceSaving) return;
    setWorkspaceSaving(true);
    setError("");
    try {
      const savedCompany = await request("/api/company", {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setSession((current) => ({
        ...current,
        company: { ...current.company, ...savedCompany, name },
      }));
      setCompanyName(name);
      setWorkspaceDialog(false);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setWorkspaceSaving(false);
    }
  }

  async function saveMember(member) {
    const edited = memberEdits[member.id];
    if (!edited || workspaceSaving) return;
    const changes = {};
    if (edited.display_name.trim() !== member.display_name) {
      changes.display_name = edited.display_name.trim();
    }
    if (edited.email.trim() !== member.email) {
      changes.email = edited.email.trim();
    }
    if (!Object.keys(changes).length) return;
    setWorkspaceSaving(true);
    setError("");
    try {
      const savedMember = await request(`/api/users/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      const updated = { ...member, ...changes, ...savedMember };
      setMembers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMemberEdits((current) => ({
        ...current,
        [member.id]: {
          display_name: updated.display_name,
          email: updated.email,
        },
      }));
      if (updated.id === session.user.id) {
        setSession((current) => ({
          ...current,
          user: { ...current.user, ...updated },
        }));
      }
    } catch (cause) {
      setError(cause.message);
    } finally {
      setWorkspaceSaving(false);
    }
  }

  async function deleteMember(member) {
    if (
      member.role === "owner" ||
      !window.confirm(
        `Supprimer le membre « ${member.display_name} » ? Ses affectations et ses accès aux tableaux seront retirés.`,
      )
    ) {
      return;
    }
    setError("");
    try {
      await request(`/api/users/${member.id}`, { method: "DELETE" });
      setMembers((current) => current.filter((item) => item.id !== member.id));
      const withOwnerAccess = (projectList) =>
        projectList.map((project) => ({
          ...project,
          member_ids: [
            ...new Set([
              ...project.member_ids.filter((id) => id !== member.id),
              session.user.id,
            ]),
          ],
        }));
      setProjects((current) => withOwnerAccess(current));
      setSelectedProject((current) =>
        current
          ? {
              ...current,
              member_ids: [
                ...new Set([
                  ...current.member_ids.filter((id) => id !== member.id),
                  session.user.id,
                ]),
              ],
            }
          : current,
      );
      setTasks((current) =>
        current.map((task) => {
          const currentAssigneeIds = taskAssigneeIds(task);
          const assigneeIds = currentAssigneeIds.filter(
            (assigneeId) => assigneeId !== member.id,
          );
          return assigneeIds.length === currentAssigneeIds.length
            ? task
            : {
                ...task,
                assignee_ids: assigneeIds,
                assignee_id: assigneeIds[0] || null,
              };
        }),
      );
      const refreshedProjects = await request("/api/projects");
      setProjects(refreshedProjects);
      const refreshedSelection = selectedProject
        ? refreshedProjects.find(
            (project) => project.id === selectedProject.id,
          )
        : null;
      if (refreshedSelection) {
        setSelectedProject(refreshedSelection);
      } else if (selectedProject) {
        setSelectedProject(null);
        setTasks([]);
      }
    } catch (cause) {
      setError(cause.message);
    }
  }

  async function deleteCompany() {
    if (
      !window.confirm(
        `Supprimer définitivement l’entreprise « ${session.company.name} » et toutes ses données (membres, tableaux et tâches) ? Cette action est irréversible. Vous serez déconnecté.`,
      )
    ) {
      return;
    }
    setError("");
    try {
      await request("/api/company", { method: "DELETE" });
      clearLocalSession();
    } catch (cause) {
      setError(cause.message);
    }
  }

  if (!authChecked) {
    return <main className="auth-loading">Connexion à votre espace…</main>;
  }
  if (!session) {
    return (
      <AuthScreen
        onAuthenticated={handleAuthenticated}
        errorMessage={error}
        onClearError={() => setError("")}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        session={session}
        projects={projects}
        projectsLoading={projectsLoading}
        selectedProject={selectedProject}
        activeView={activeView}
        connected={connected}
        userInitials={userInitials}
        companyInitials={initials(session.company.name)}
        onNavigateHome={navigateHome}
        onSelectProject={openProject}
        onOpenCalendar={openCalendar}
        onCopyInviteCode={copyInviteCode}
        onManageWorkspace={openWorkspaceDialog}
        onLogout={logout}
      />

      <main
        className="main-area"
        id={activeView === "calendar" ? "calendar" : selectedProject ? "board" : "home"}
      >
        <Topbar
          selectedProject={activeView === "board" ? selectedProject : null}
          loading={loading}
          calendarLoading={calendarLoading}
          calendarActive={activeView === "calendar"}
          projectsLoading={projectsLoading}
          connected={connected}
          onNavigateHome={navigateHome}
        />

        {activeView === "calendar" ? (
          <div className="page-content calendar-page">
            <section className="project-heading">
              <div className="project-heading-copy">
                <div className="eyebrow">
                  <span className="eyebrow-line" /> VOTRE PLANNING
                </div>
                <h1>
                  Calendrier<span className="title-period">.</span>
                </h1>
                <p>Les échéances des tâches qui vous sont assignées.</p>
              </div>
            </section>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            {calendarLoading ? (
              <div className="home-state">Chargement du calendrier…</div>
            ) : (
              <DeadlineCalendar
                tasks={calendarTasks}
                projects={projects}
                onOpenProject={openCalendarProject}
              />
            )}
          </div>
        ) : selectedProject ? (
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
                {selectedProject.description && (
                  <p className="project-description">
                    {selectedProject.description}
                  </p>
                )}
              </div>
              <div className="project-heading-actions">
                {canManageProject(selectedProject) && (
                  <button
                    className="secondary-button project-edit-button"
                    type="button"
                    onClick={() => editProject(selectedProject)}
                  >
                    <span aria-hidden="true">✎</span> Modifier le tableau
                  </button>
                )}
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => openTaskDialog("todo")}
                >
                  <span aria-hidden="true">+</span> Nouvelle tâche
                </button>
              </div>
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
                    allTasks={tasks}
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
                  setProjectDescription("");
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
                        onClick={() => openProject(project)}
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
                        {project.description && (
                          <span className="project-card-description">
                            {project.description}
                          </span>
                        )}
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
                              onClick={() => editProject(project)}
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
                      setProjectDescription("");
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
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
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
            <label className="field-label" htmlFor="project-description">
              Description
            </label>
            <textarea
              id="project-description"
              rows={3}
              value={projectDescription}
              onChange={(event) => setProjectDescription(event.target.value)}
              placeholder="Contexte et objectifs du tableau"
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
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
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
            <label className="field-label" htmlFor="task-description">
              Description
            </label>
            <textarea
              id="task-description"
              rows={3}
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              placeholder="Détails utiles pour réaliser la tâche"
            />
            <label className="field-label" htmlFor="task-due-at">
              Échéance (facultative)
            </label>
            <input
              id="task-due-at"
              type="datetime-local"
              value={newDueAt}
              onChange={(event) => setNewDueAt(event.target.value)}
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
                <option
                  key={column.id}
                  value={column.id}
                  disabled={
                    column.id !== "todo" && hasUnfinishedPrerequisites
                  }
                >
                  {column.label}
                </option>
              ))}
            </select>
            {hasUnfinishedPrerequisites && (
              <p className="task-prerequisite-hint" role="status">
                Terminez les tâches prérequises avant de démarrer celle-ci.
              </p>
            )}
            <span className="field-label" id="task-assignee-label">
              Personnes assignées
            </span>
            <details className="assignee-picker">
              <summary
                aria-label={`Personnes assignées : ${selectedAssigneeNames || "aucune"}`}
                title={selectedAssigneeNames || "Aucune personne assignée"}
              >
                {selectedAssigneeNames || "Aucune personne assignée"}
              </summary>
              <div
                className="assignee-picker-options"
                role="group"
                aria-labelledby="task-assignee-label"
              >
                {assignableMembers.map((member) => (
                  <label className="assignee-picker-option" key={member.id}>
                    <input
                      type="checkbox"
                      checked={newAssigneeIds.includes(member.id)}
                      onChange={(event) => {
                        setNewAssigneeIds((current) =>
                          event.target.checked
                            ? [...current, member.id]
                            : current.filter((id) => id !== member.id),
                        );
                      }}
                    />
                    <span>{member.display_name}</span>
                  </label>
                ))}
              </div>
            </details>
            <TaskChecklistEditor
              items={newChecklistItems}
              onChange={setNewChecklistItems}
              disabled={saving}
            />
            <span className="field-label" id="task-dependency-label">
              Tâches à terminer avant celle-ci
            </span>
            <details className="assignee-picker">
              <summary
                aria-label={`Tâches prérequises : ${selectedDependencyNames || "aucune"}`}
                title={selectedDependencyNames || "Aucune tâche prérequise"}
              >
                {selectedDependencyNames || "Aucune tâche prérequise"}
              </summary>
              <div
                className="assignee-picker-options"
                role="group"
                aria-labelledby="task-dependency-label"
              >
                {tasks.filter((task) => task.id !== editingTask?.id).length ? (
                  tasks
                    .filter((task) => task.id !== editingTask?.id)
                    .map((task) => (
                      <label
                        className="assignee-picker-option"
                        key={task.id}
                      >
                        <input
                          type="checkbox"
                          checked={newBlockedByIds.includes(task.id)}
                          disabled={saving}
                          onChange={(event) =>
                            setNewBlockedByIds((current) =>
                              event.target.checked
                                ? [...current, task.id]
                                : current.filter((id) => id !== task.id),
                            )
                          }
                        />
                        <span>
                          {task.title} ({columns.find((column) => column.id === task.status)?.label || task.status})
                        </span>
                      </label>
                    ))
                ) : (
                  <p className="member-empty">
                    Ajoutez une autre tâche pour définir un prérequis.
                  </p>
                )}
              </div>
            </details>
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

      {workspaceDialog && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setWorkspaceDialog(false)
          }
        >
          <section
            className="task-dialog workspace-dialog"
            aria-labelledby="workspace-dialog-title"
          >
            <div className="dialog-heading">
              <div>
                <span className="dialog-eyebrow">ADMINISTRATION</span>
                <h2 id="workspace-dialog-title">Gérer l’entreprise</h2>
              </div>
              <button
                type="button"
                className="icon-button dialog-close"
                aria-label="Fermer"
                onClick={() => setWorkspaceDialog(false)}
              >
                ×
              </button>
            </div>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            <form className="company-edit-form" onSubmit={saveCompany}>
              <label className="field-label" htmlFor="company-name-edit">
                Nom de l’entreprise
              </label>
              <div className="company-edit-row">
                <input
                  id="company-name-edit"
                  maxLength={100}
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  required
                />
                <button
                  className="primary-button"
                  type="submit"
                  disabled={workspaceSaving}
                >
                  Enregistrer
                </button>
              </div>
            </form>

            <section className="workspace-members" aria-labelledby="members-title">
              <h3 id="members-title">Membres</h3>
              <div className="workspace-member-list">
                {members.map((member) => (
                  <div className="workspace-member" key={member.id}>
                    <div className="workspace-member-fields">
                      <label>
                        <span>Nom</span>
                        <input
                          value={memberEdits[member.id]?.display_name || ""}
                          maxLength={80}
                          onChange={(event) =>
                            setMemberEdits((current) => ({
                              ...current,
                              [member.id]: {
                                ...current[member.id],
                                display_name: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>Adresse email</span>
                        <input
                          type="email"
                          value={memberEdits[member.id]?.email || ""}
                          onChange={(event) =>
                            setMemberEdits((current) => ({
                              ...current,
                              [member.id]: {
                                ...current[member.id],
                                email: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className="workspace-member-actions">
                      <span className="workspace-member-role">
                        {member.role === "owner" ? "Propriétaire" : "Membre"}
                      </span>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={workspaceSaving}
                        onClick={() => saveMember(member)}
                      >
                        Enregistrer
                      </button>
                      {member.role !== "owner" && (
                        <button
                          className="secondary-button member-delete-button"
                          type="button"
                          disabled={workspaceSaving}
                          onClick={() => deleteMember(member)}
                        >
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="member-management-note">
                Le propriétaire ne peut pas être supprimé. La suppression d’un
                membre retire ses affectations et ses accès aux tableaux.
              </p>
            </section>

            <div className="company-delete">
              <div>
                <strong>Supprimer l’entreprise</strong>
                <p>
                  Suppression permanente de l’entreprise, de ses membres, de
                  ses tableaux et de ses tâches.
                </p>
              </div>
              <button
                className="secondary-button company-delete-button"
                type="button"
                onClick={deleteCompany}
              >
                Supprimer définitivement
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
