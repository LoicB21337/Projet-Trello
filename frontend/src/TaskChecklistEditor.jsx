import { useState } from "react";
import "./TaskChecklistEditor.css";

const MAX_ITEMS = 100;
const MAX_TEXT_LENGTH = 200;
let fallbackIdCounter = 0;

function createItemId(existingIds) {
  let id;

  try {
    id = globalThis.crypto?.randomUUID?.();
  } catch {
    id = undefined;
  }

  while (!id || existingIds.has(id)) {
    fallbackIdCounter += 1;
    id = `checklist-${Date.now()}-${fallbackIdCounter}-${Math.random()
      .toString(36)
      .slice(2)}`;
  }

  return id;
}

function TaskChecklistEditor({ items = [], onChange, disabled = false }) {
  const [newItemText, setNewItemText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const checklistItems = Array.isArray(items) ? items : [];

  function addItem(event) {
    event.preventDefault();
    const text = newItemText.trim();

    if (!text || checklistItems.length >= MAX_ITEMS) return;

    const existingIds = new Set(checklistItems.map((item) => item.id));
    onChange?.([
      ...checklistItems,
      { id: createItemId(existingIds), text, completed: false },
    ]);
    setNewItemText("");
  }

  function toggleItem(itemId) {
    onChange?.(
      checklistItems.map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item,
      ),
    );
  }

  function saveEdit(event) {
    event.preventDefault();
    const text = editingText.trim();
    if (!text) return;

    onChange?.(
      checklistItems.map((item) =>
        item.id === editingId ? { ...item, text } : item,
      ),
    );
    setEditingId(null);
    setEditingText("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText("");
  }

  function removeItem(itemId) {
    onChange?.(checklistItems.filter((item) => item.id !== itemId));
    if (editingId === itemId) cancelEdit();
  }

  return (
    <section
      className="task-checklist-editor"
      aria-label="Liste de vérification"
    >
      <header className="task-checklist-editor-header">
        <h3 className="task-checklist-editor-title">Liste de vérification</h3>
        <span className="task-checklist-editor-count">
          {checklistItems.length} / {MAX_ITEMS}
        </span>
      </header>

      {checklistItems.length > 0 ? (
        <ul className="task-checklist-editor-list">
          {checklistItems.map((item, index) => {
            const isEditing = editingId === item.id;
            const itemLabel = `Élément ${index + 1}`;

            return (
              <li className="task-checklist-editor-item" key={item.id}>
                <input
                  className="task-checklist-editor-checkbox"
                  type="checkbox"
                  checked={Boolean(item.completed)}
                  disabled={disabled}
                  aria-label={`Marquer « ${item.text} » comme ${
                    item.completed ? "à faire" : "terminé"
                  }`}
                  onChange={() => toggleItem(item.id)}
                />

                {isEditing ? (
                  <form
                    className="task-checklist-editor-edit-form"
                    onSubmit={saveEdit}
                  >
                    <label className="task-checklist-editor-visually-hidden" htmlFor={`task-checklist-edit-${index}`}>
                      Modifier {itemLabel.toLowerCase()}
                    </label>
                    <input
                      id={`task-checklist-edit-${index}`}
                      className="task-checklist-editor-input task-checklist-editor-edit-input"
                      type="text"
                      value={editingText}
                      maxLength={MAX_TEXT_LENGTH}
                      disabled={disabled}
                      autoFocus
                      onChange={(event) => setEditingText(event.target.value)}
                    />
                    <button
                      className="task-checklist-editor-button"
                      type="submit"
                      disabled={disabled || !editingText.trim()}
                    >
                      Enregistrer
                    </button>
                    <button
                      className="task-checklist-editor-button is-secondary"
                      type="button"
                      disabled={disabled}
                      onClick={cancelEdit}
                    >
                      Annuler
                    </button>
                  </form>
                ) : (
                  <>
                    <span
                      className={`task-checklist-editor-text${
                        item.completed ? " is-completed" : ""
                      }`}
                    >
                      {item.text}
                    </span>
                    <div className="task-checklist-editor-actions">
                      <button
                        className="task-checklist-editor-button is-secondary"
                        type="button"
                        disabled={disabled}
                        aria-label={`Modifier ${item.text}`}
                        onClick={() => {
                          setEditingId(item.id);
                          setEditingText(item.text);
                        }}
                      >
                        Modifier
                      </button>
                      <button
                        className="task-checklist-editor-button is-danger"
                        type="button"
                        disabled={disabled}
                        aria-label={`Supprimer ${item.text}`}
                        onClick={() => removeItem(item.id)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="task-checklist-editor-empty">
          Aucun élément pour le moment.
        </p>
      )}

      <form className="task-checklist-editor-add-form" onSubmit={addItem}>
        <label
          className="task-checklist-editor-visually-hidden"
          htmlFor="task-checklist-new-item"
        >
          Nouvel élément de la liste
        </label>
        <input
          id="task-checklist-new-item"
          className="task-checklist-editor-input"
          type="text"
          value={newItemText}
          maxLength={MAX_TEXT_LENGTH}
          placeholder="Ajouter un élément…"
          disabled={disabled || checklistItems.length >= MAX_ITEMS}
          onChange={(event) => setNewItemText(event.target.value)}
        />
        <button
          className="task-checklist-editor-button is-primary"
          type="submit"
          disabled={
            disabled ||
            checklistItems.length >= MAX_ITEMS ||
            !newItemText.trim()
          }
        >
          Ajouter
        </button>
      </form>
      <p className="task-checklist-editor-hint">
        200 caractères maximum par élément.
      </p>
    </section>
  );
}

export default TaskChecklistEditor;
