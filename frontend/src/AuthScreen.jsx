import { useState } from "react";
import { request } from "./api.js";
import "./AuthScreen.css";

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [joinCompany, setJoinCompany] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const payload =
        mode === "login"
          ? { email, password }
          : {
              display_name: displayName,
              email,
              password,
              ...(joinCompany
                ? { invite_code: inviteCode }
                : { company_name: companyName }),
            };
      const account = await request(
        mode === "login" ? "/api/auth/login" : "/api/auth/register",
        { method: "POST", body: JSON.stringify(payload) },
      );
      await onAuthenticated(account);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <aside className="auth-rail">
        <a className="brand auth-brand" href="/" aria-label="Tandem">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>tandem</span>
        </a>
        <div className="auth-rail-copy">
          <span className="auth-kicker">VOTRE ESPACE DE TRAVAIL</span>
          <h1>Les projets avancent mieux ensemble.</h1>
          <span className="auth-rule" />
        </div>
        <p className="auth-rail-foot">ORGANISATION CLAIRE · TRAVAIL SEREIN</p>
      </aside>

      <section className="auth-main" aria-labelledby="auth-title">
        <div className="auth-card">
          <div className="auth-heading">
            <span className="auth-kicker">BIENVENUE</span>
            <h2 id="auth-title">
              {mode === "login" ? "Connexion" : "Créer un compte"}
            </h2>
            <p>
              {mode === "login"
                ? "Retrouvez votre espace de travail."
                : "Quelques informations pour commencer."}
            </p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Type d'accès">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "selected" : ""}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Se connecter
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "selected" : ""}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              Créer un compte
            </button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === "register" && (
              <>
                <label className="auth-label" htmlFor="display-name">
                  Nom
                </label>
                <input
                  id="display-name"
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  minLength={2}
                  maxLength={80}
                  required
                />
                <div
                  className="auth-choice"
                  role="group"
                  aria-label="Entreprise"
                >
                  <button
                    type="button"
                    aria-pressed={!joinCompany}
                    className={!joinCompany ? "active" : ""}
                    onClick={() => setJoinCompany(false)}
                  >
                    Créer une entreprise
                  </button>
                  <button
                    type="button"
                    aria-pressed={joinCompany}
                    className={joinCompany ? "active" : ""}
                    onClick={() => setJoinCompany(true)}
                  >
                    Rejoindre une entreprise
                  </button>
                </div>
                <label
                  className="auth-label"
                  htmlFor={joinCompany ? "invite-code" : "company-name"}
                >
                  {joinCompany ? "Code d'invitation" : "Nom de l'entreprise"}
                </label>
                <input
                  id={joinCompany ? "invite-code" : "company-name"}
                  value={joinCompany ? inviteCode : companyName}
                  onChange={(event) =>
                    joinCompany
                      ? setInviteCode(event.target.value)
                      : setCompanyName(event.target.value)
                  }
                  autoComplete="organization"
                  maxLength={joinCompany ? 32 : 100}
                  required
                />
              </>
            )}
            <label className="auth-label" htmlFor="auth-email">
              Adresse email
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <label className="auth-label" htmlFor="auth-password">
              Mot de passe
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={mode === "login" ? 1 : 8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting
                ? "Patientez…"
                : mode === "login"
                  ? "Se connecter"
                  : "Continuer"}
              <span aria-hidden="true">→</span>
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

export default AuthScreen;
