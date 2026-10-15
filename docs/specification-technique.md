# Specification technique

## Architecture

- `web` : React/Vite compile en fichiers statiques, servis par Nginx.
- `api` : API REST FastAPI et PyMongo asynchrone ; Nginx transmet `/api/*` au service.
- `mongo` : MongoDB officiel avec volume persistant `mongo_data`.
- Docker Compose coordonne les services et attend que MongoDB puis l'API soient sains avant de demarrer le frontend.

La configuration de connexion est fournie par `MONGODB_URI` et `MONGO_DATABASE`. Le code ne depend pas d'un nom de replica set ou d'un hote particulier ; une URI de replica set ou de cluster peut etre injectee par l'environnement. `docker compose up -d --build` utilise les valeurs par defaut pour un lancement local.

## Documents MongoDB cibles

Les identifiants sont des `ObjectId`. Les dates sont stockees au format BSON Date en UTC. Les exemples ci-dessous sont des objets JSON illustratifs.

### `companies`

```json
{
  "_id": "ObjectId",
  "name": "Atelier Nord",
  "slug": "atelier-nord",
  "created_at": "2026-10-15T10:00:00Z",
  "updated_at": "2026-10-15T10:00:00Z"
}
```

### `users`

```json
{
  "_id": "ObjectId",
  "email": "lea@example.org",
  "password_hash": "argon2id hash",
  "display_name": "Lea Martin",
  "created_at": "2026-10-15T10:00:00Z"
}
```

### `memberships`

Une collection distincte permet a un meme compte d'appartenir a plusieurs entreprises sans dupliquer son identite.

```json
{
  "_id": "ObjectId",
  "company_id": "ObjectId",
  "user_id": "ObjectId",
  "role": "admin",
  "created_at": "2026-10-15T10:00:00Z"
}
```

### `projects`

```json
{
  "_id": "ObjectId",
  "company_id": "ObjectId",
  "name": "Lancement produit",
  "description": "Preparation du lancement",
  "member_ids": ["ObjectId"],
  "created_by": "ObjectId",
  "created_at": "2026-10-15T10:00:00Z",
  "updated_at": "2026-10-15T10:00:00Z"
}
```

### `tasks`

```json
{
  "_id": "ObjectId",
  "company_id": "ObjectId",
  "project_id": "ObjectId",
  "title": "Preparer les maquettes",
  "description": "",
  "status": "todo",
  "assignee_id": null,
  "due_at": null,
  "created_by": "ObjectId",
  "created_at": "2026-10-15T10:00:00Z",
  "updated_at": "2026-10-15T10:00:00Z"
}
```

Les valeurs permises pour `status` sont `todo`, `in_progress` et `done`. Les champs `company_id` et `project_id` sont denormalises dans chaque tache pour filtrer et autoriser les requetes sans parcours de collections supplementaire.

## Index proposes

- `users`: index unique sur `email`.
- `memberships`: index unique compose `{ company_id: 1, user_id: 1 }`, plus `{ user_id: 1, company_id: 1 }` pour retrouver les entreprises d'un utilisateur.
- `projects`: `{ company_id: 1, name: 1 }`.
- `tasks`: `{ company_id: 1, project_id: 1, status: 1 }` et `{ company_id: 1, project_id: 1, created_at: 1 }`.
- `tasks`: `{ company_id: 1, assignee_id: 1, status: 1 }` pour les vues par responsable.

Pour chaque requete, l'API derive l'entreprise autorisee de la session et applique `company_id` dans le filtre MongoDB, y compris pour la modification et la suppression. Elle verifie egalement que le projet et le responsable appartiennent a cette entreprise.

## Etat du prototype

Le code implemente actuellement la collection `tasks` et ses operations de lecture, creation, modification du statut et suppression. Chaque document porte `company_id` et `project_id`, dont les valeurs proviennent de la configuration serveur `DEMO_COMPANY_ID` et `DEFAULT_PROJECT_ID`. Les collections utilisateurs, entreprises, projets, les index de production et l'authentification restent a implementer avant d'activer le multi-tenant.

MongoDB est lance sans authentification dans le compose de developpement. Il ne doit pas etre expose tel quel en production. Le volume conserve la base lors de `docker compose down`; `docker compose down -v` la supprime.
