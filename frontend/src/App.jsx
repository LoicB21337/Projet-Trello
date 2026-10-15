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
import "./App.css";

const columns = [
  { id: "todo", label: "À faire", color: "mint" },
  { id: "in_progress", label: "En cours", color: "amber" },
  { id: "done", label: "Terminé", color: "coral" },
];

async function request(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "La requête a échoué.");
  }
  return response.status === 204 ? null : response.json();
}

function TaskCard({ task, onDelete }) {
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
          <span className="task-avatar" aria-label="Espace de démonstration">
            T
          </span>
        </div>
      </article>
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

function BoardColumn({ column, tasks, onDelete, onAdd }) {
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
          <TaskCard key={task.id} task={task} onDelete={onDelete} />
        ))}
        {tasks.length === 0 && (
          <p className="empty-column">Déposez une tâche ici</p>
        )}
      </div>
    </section>
  );
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dialogStatus, setDialogStatus] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    let active = true;
    request("/api/tasks")
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
  }, []);

  async function addTask(event) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    setError("");
    try {
      const task = await request("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ title, status: dialogStatus }),
      });
      setTasks((current) => [...current, task]);
      setNewTitle("");
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
      const updated = await request(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
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
      await request(`/api/tasks/${taskId}`, { method: "DELETE" });
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Tandem, accueil">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>tandem</span>
        </a>
        <div className="workspace-switcher">
          <span className="workspace-monogram">T</span>
          <span className="workspace-name">Votre espace</span>
          <span className="switcher-chevron" aria-hidden="true">
            ⌄
          </span>
        </div>
        <p className="sidebar-label">ESPACE DE TRAVAIL</p>
        <nav className="sidebar-nav" aria-label="Navigation principale">
          <a href="#board" className="nav-link active" aria-current="page">
            <span className="nav-symbol board-symbol" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>Tableau</span>
            <span className="nav-count">{tasks.length}</span>
          </a>
        </nav>
        <div className="sidebar-bottom">
          <span className="sidebar-bottom-mark">T</span>
          <span>Prototype de projet</span>
          <span
            className={`online-dot${connected ? " connected" : ""}`}
            aria-label={connected ? "API connectée" : "API en attente"}
          />
        </div>
      </aside>

      <main className="main-area" id="board">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Projets</span>
            <span className="breadcrumb-slash">/</span>
            <strong>Lancement produit</strong>
          </div>
          <div className="topbar-right">
            <span className="connection-indicator">
              <i className={connected ? "connected" : ""} />
              {loading
                ? "Connexion…"
                : connected
                  ? "Synchronisé"
                  : "API indisponible"}
            </span>
            <span className="user-avatar">T</span>
          </div>
        </header>

        <div className="page-content">
          <section className="project-heading">
            <div className="project-heading-copy">
              <div className="eyebrow">
                <span className="eyebrow-line" /> PROJET · 2026
              </div>
              <h1>
                Lancement produit<span className="title-period">.</span>
              </h1>
              <p>Les prochaines étapes, au même endroit.</p>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => setDialogStatus("todo")}
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
                  tasks={filteredTasks.filter(
                    (task) => task.status === column.id,
                  )}
                  onDelete={deleteTask}
                  onAdd={setDialogStatus}
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
      </main>

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
                <span className="dialog-eyebrow">NOUVELLE TÂCHE</span>
                <h2 id="dialog-title">Ajouter au tableau</h2>
              </div>
              <button
                type="button"
                className="icon-button dialog-close"
                aria-label="Fermer"
                onClick={() => setDialogStatus(null)}
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
            <div className="dialog-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setDialogStatus(null)}
              >
                Annuler
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={saving}
              >
                {saving ? "Ajout…" : "Créer la tâche"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
