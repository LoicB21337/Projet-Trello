import { useState } from "react";
import "./TaskChecklistEditor.css";

const MAX_ITEMS = 100;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
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
  const [isAdding, setIsAdding] = useState(false);
  const [newItemText, setNewItemText] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const checklistItems = Array.isArray(items) ? items : [];
  const canAdd = !disabled && checklistItems.length < MAX_ITEMS;

  function resetAdd() {
    setIsAdding(false);
    setNewItemText("");
    setNewItemDescription("");
  }

  function addItem() {
    const text = newItemText.trim();

    if (!text || !canAdd) return;

    const existingIds = new Set(checklistItems.map((item) => item.id));
    onChange?.([
      ...checklistItems,
      {
        id: createItemId(existingIds),
        text,
        description: newItemDescription.trim(),
        completed: false,
      },
    ]);
    resetAdd();
  }

  function toggleItem(itemId) {
    if (disabled) return;
    onChange?.(
      checklistItems.map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item,
      ),
    );
  }

  function saveEdit() {
    const text = editingText.trim();
    if (!text || disabled) return;

    onChange?.(
      checklistItems.map((item) =>
        item.id === editingId
          ? { ...item, text, description: editingDescription.trim() }
          : item,
      ),
    );
    setEditingId(null);
    setEditingText("");
    setEditingDescription("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText("");
    setEditingDescription("");
  }

  function removeItem(itemId) {
    if (disabled) return;
    onChange?.(checklistItems.filter((item) => item.id !== itemId));
    if (editingId === itemId) cancelEdit();
  }

  function handleEditorKeyDown(event, action) {
    if (event.key === "Enter") {
      event.preventDefault();
      action();
    }
  }

  const checklistRows = checklistItems.map((item, index) => {
    const isEditing = editingId === item.id;
    const titleId = `task-checklist-edit-title-${index}`;
    const descriptionId = `task-checklist-edit-description-${index}`;

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
          <div className="task-checklist-editor-edit">
            <label className="task-checklist-editor-label" htmlFor={titleId}>
              Titre
            </label>
            <input
              id={titleId}
              className="task-checklist-editor-input"
              type="text"
              value={editingText}
              maxLength={MAX_TITLE_LENGTH}
              required
              disabled={disabled}
              autoFocus
              onChange={(event) => setEditingText(event.target.value)}
              onKeyDown={(event) => handleEditorKeyDown(event, saveEdit)}
            />
            <label
              className="task-checklist-editor-label"
              htmlFor={descriptionId}
            >
              Description (facultative)
            </label>
            <textarea
              id={descriptionId}
              className="task-checklist-editor-input task-checklist-editor-textarea"
              value={editingDescription}
              maxLength={MAX_DESCRIPTION_LENGTH}
              disabled={disabled}
              onChange={(event) => setEditingDescription(event.target.value)}
            />
            <div className="task-checklist-editor-actions">
              <button
                className="task-checklist-editor-button is-primary"
                type="button"
                disabled={disabled || !editingText.trim()}
                onClick={saveEdit}
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
            </div>
          </div>
        ) : (
          <div className="task-checklist-editor-content">
            <span
              className={`task-checklist-editor-text${
                item.completed ? " is-completed" : ""
              }`}
            >
              {item.text}
            </span>
            {item.description && (
              <p className="task-checklist-editor-description">
                {item.description}
              </p>
            )}
            <div className="task-checklist-editor-actions">
              <button
                className="task-checklist-editor-button is-secondary"
                type="button"
                disabled={disabled}
                aria-label={`Modifier ${item.text}`}
                onClick={() => {
                  setEditingId(item.id);
                  setEditingText(item.text);
                  setEditingDescription(item.description ?? "");
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
          </div>
        )}
      </li>
    );
  });

  return (
    <section
      className="task-checklist-editor"
      aria-label="Sous-tâches"
    >
      {isAdding ? (
        <div className="task-checklist-editor-add">
          <label className="task-checklist-editor-label" htmlFor="task-checklist-new-title">
            Titre
          </label>
          <input
            id="task-checklist-new-title"
            className="task-checklist-editor-input"
            type="text"
            value={newItemText}
            maxLength={MAX_TITLE_LENGTH}
            required
            autoFocus
            disabled={!canAdd}
            onChange={(event) => setNewItemText(event.target.value)}
            onKeyDown={(event) => handleEditorKeyDown(event, addItem)}
          />
          <label
            className="task-checklist-editor-label"
            htmlFor="task-checklist-new-description"
          >
            Description (facultative)
          </label>
          <textarea
            id="task-checklist-new-description"
            className="task-checklist-editor-input task-checklist-editor-textarea"
            value={newItemDescription}
            maxLength={MAX_DESCRIPTION_LENGTH}
            disabled={!canAdd}
            onChange={(event) => setNewItemDescription(event.target.value)}
          />
          <div className="task-checklist-editor-actions">
            <button
              className="task-checklist-editor-button is-primary"
              type="button"
              disabled={!canAdd || !newItemText.trim()}
              onClick={addItem}
            >
              Ajouter
            </button>
            <button
              className="task-checklist-editor-button is-secondary"
              type="button"
              disabled={disabled}
              onClick={resetAdd}
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="task-checklist-editor-add-control">
          <span>Ajouter une sous tâche</span>
          <button
            className="task-checklist-editor-button is-add"
            type="button"
            aria-label="Ajouter une sous tâche"
            disabled={!canAdd}
            onClick={() => setIsAdding(true)}
          >
            +
          </button>
        </div>
      )}
      {checklistRows.length > 0 && (
        <ul className="task-checklist-editor-list">{checklistRows}</ul>
      )}
    </section>
  );
}

export default TaskChecklistEditor;
