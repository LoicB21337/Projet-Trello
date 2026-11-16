import { useMemo, useState } from "react";
import "./DeadlineCalendar.css";

const WEEKDAYS = [
  { short: "lun.", full: "lundi" },
  { short: "mar.", full: "mardi" },
  { short: "mer.", full: "mercredi" },
  { short: "jeu.", full: "jeudi" },
  { short: "ven.", full: "vendredi" },
  { short: "sam.", full: "samedi" },
  { short: "dim.", full: "dimanche" },
];

const STATUS_LABELS = {
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminé",
};

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDueDate(value) {
  if (typeof value !== "string") return null;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function monthDates(month) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const numberOfWeeks = Math.ceil((mondayOffset + daysInMonth) / 7);
  const firstVisibleDay = new Date(
    month.getFullYear(),
    month.getMonth(),
    1 - mondayOffset,
  );

  return Array.from({ length: numberOfWeeks * 7 }, (_, index) => {
    const date = new Date(firstVisibleDay);
    date.setDate(firstVisibleDay.getDate() + index);
    return date;
  });
}

function DeadlineCalendar({ tasks = [], projects = [] }) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [showCompleted, setShowCompleted] = useState(false);
  const [todayKey, setTodayKey] = useState(() => dateKey(new Date()));

  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const dates = useMemo(() => monthDates(visibleMonth), [visibleMonth]);
  const monthLabel = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(visibleMonth);

  const tasksByDate = useMemo(() => {
    const grouped = new Map();

    for (const task of tasks) {
      if (!task.due_at || (task.status === "done" && !showCompleted)) continue;
      const dueDate = parseDueDate(task.due_at);
      if (!dueDate) continue;

      const key = dateKey(dueDate);
      const dayTasks = grouped.get(key) || [];
      dayTasks.push({ ...task, dueDate });
      grouped.set(key, dayTasks);
    }

    for (const dayTasks of grouped.values()) {
      dayTasks.sort((first, second) => first.dueDate - second.dueDate);
    }

    return grouped;
  }, [showCompleted, tasks]);

  const monthTaskCount = dates.reduce(
    (count, date) => count + (tasksByDate.get(dateKey(date))?.length || 0),
    0,
  );

  function moveMonth(offset) {
    setVisibleMonth(
      (month) => new Date(month.getFullYear(), month.getMonth() + offset, 1),
    );
  }

  function goToToday() {
    const now = new Date();
    setTodayKey(dateKey(now));
    setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  return (
    <section className="deadline-calendar" aria-label="Calendrier des échéances">
      <header className="deadline-calendar-header">
        <div className="deadline-calendar-heading">
          <h2 className="deadline-calendar-title">Échéances</h2>
          <p>Consultez les tâches prévues par mois.</p>
        </div>
        <div className="deadline-calendar-controls">
          <button
            className="deadline-calendar-today"
            type="button"
            onClick={goToToday}
          >
            Aujourd’hui
          </button>
          <div className="deadline-calendar-month-navigation">
            <button
              type="button"
              aria-label="Mois précédent"
              onClick={() => moveMonth(-1)}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <h2 className="deadline-calendar-month" aria-live="polite">
              {monthLabel}
            </h2>
            <button
              type="button"
              aria-label="Mois suivant"
              onClick={() => moveMonth(1)}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      </header>

      <label className="deadline-calendar-completed-toggle">
        <input
          type="checkbox"
          checked={showCompleted}
          onChange={(event) => setShowCompleted(event.target.checked)}
        />
        <span>Afficher les tâches terminées</span>
      </label>

      <div className="deadline-calendar-table-wrap">
        <table className="deadline-calendar-table">
          <thead>
            <tr>
              {WEEKDAYS.map((day) => (
                <th key={day.full} scope="col" aria-label={day.full}>
                  <span className="deadline-calendar-weekday-short">
                    {day.short}
                  </span>
                  <span className="deadline-calendar-weekday-full">
                    {day.full}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: dates.length / 7 }, (_, weekIndex) => (
              <tr key={dateKey(dates[weekIndex * 7])}>
                {dates
                  .slice(weekIndex * 7, weekIndex * 7 + 7)
                  .map((date) => {
                    const key = dateKey(date);
                    const dayTasks = tasksByDate.get(key) || [];
                    const inCurrentMonth =
                      date.getMonth() === visibleMonth.getMonth();

                    return (
                      <td
                        key={key}
                        className={[
                          "deadline-calendar-day",
                          inCurrentMonth ? "" : "is-outside-month",
                          key === todayKey ? "is-today" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <time
                          className="deadline-calendar-day-number"
                          dateTime={key}
                          aria-label={new Intl.DateTimeFormat("fr-FR", {
                            dateStyle: "full",
                          }).format(date)}
                        >
                          {date.getDate()}
                        </time>
                        {dayTasks.length > 0 && (
                          <ul
                            className="deadline-calendar-task-list"
                            aria-label={`Tâches du ${new Intl.DateTimeFormat(
                              "fr-FR",
                              { dateStyle: "full" },
                            ).format(date)}`}
                          >
                            {dayTasks.map((task) => {
                              const statusLabel =
                                STATUS_LABELS[task.status] || "Statut inconnu";
                              const projectName =
                                projectNames.get(task.project_id) ||
                                "Projet sans nom";
                              const hasTime =
                                task.dueDate.getHours() !== 0 ||
                                task.dueDate.getMinutes() !== 0;

                              return (
                                <li
                                  className={`deadline-calendar-task is-${task.status || "unknown"}${task.status === "done" ? " is-completed" : ""}`}
                                  key={task.id}
                                  title={`${task.title} · ${projectName} · ${statusLabel}`}
                                >
                                  <span className="deadline-calendar-task-status">
                                    {statusLabel}
                                  </span>
                                  <span className="deadline-calendar-task-title">
                                    {task.title}
                                  </span>
                                  <span className="deadline-calendar-task-project">
                                    {projectName}
                                  </span>
                                  {hasTime && (
                                    <time
                                      className="deadline-calendar-task-time"
                                      dateTime={task.due_at}
                                    >
                                      {new Intl.DateTimeFormat("fr-FR", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      }).format(task.dueDate)}
                                    </time>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </td>
                    );
                  })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {monthTaskCount === 0 && (
        <p className="deadline-calendar-empty" role="status">
          {showCompleted
            ? "Aucune tâche avec échéance pour ce mois."
            : "Aucune tâche non terminée avec échéance pour ce mois."}
        </p>
      )}
    </section>
  );
}

export default DeadlineCalendar;
