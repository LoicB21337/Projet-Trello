# Specification technique

## Architecture

- `web` : React/Vite compile en fichiers statiques, servis par Nginx.
- `api` : API REST FastAPI et PyMongo asynchrone ; Nginx transmet `/api/*` au service.
- `mongo` : MongoDB officiel avec volume persistant `mongo_data`.
- Docker Compose coordonne les services et attend que MongoDB puis l'API soient sains avant de demarrer le frontend.

La configuration de connexion est fournie par `MONGODB_URI` et `MONGO_DATABASE`. Le code ne depend pas d'un nom de replica set ou d'un hote particulier ; une URI de replica set ou de cluster peut etre injectee par l'environnement. `docker compose up -d --build` utilise les valeurs par defaut pour un lancement local.

L'API signe des sessions HS256 dans un cookie `tandem_session` HTTP-only, SameSite Strict. Les mots de passe sont haches en Argon2id. `AUTH_SECRET_KEY` est injectee par l'environnement ; si elle est vide, une cle aleatoire temporaire est generee au demarrage (les sessions deviennent invalides au redemarrage). En production, fournir une cle privee stable et activer `AUTH_COOKIE_SECURE` derriere HTTPS.

## Documents MongoDB cibles

Les identifiants sont des `ObjectId`. Les dates sont stockees au format BSON Date en UTC. Les exemples ci-dessous sont des objets JSON illustratifs.

### `companies`

```json
{
  "_id": "ObjectId",
  "name": "Atelier Nord",
  "invite_code": "code aleatoire",
  "owner_id": "ObjectId",
  "created_at": "2026-10-15T10:00:00Z"
}
```

### `users`

```json
{
  "_id": "ObjectId",
  "company_id": "ObjectId",
  "email": "lea@example.org",
  "password_hash": "argon2id hash",
  "display_name": "Lea Martin",
  "role": "owner",
  "created_at": "2026-10-15T10:00:00Z"
}
```

Chaque compte est rattache a une entreprise par `company_id`. Une inscription par code d'invitation cree un utilisateur avec le role `member`; l'inscription qui cree l'entreprise donne le role `owner`.

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

## Indexes crees par l'API

- `users`: index unique sur `email`.
- `companies`: index unique sur `invite_code`.
- `projects`: `{ company_id: 1, member_ids: 1, created_at: 1 }`.
- `tasks`: `{ company_id: 1, project_id: 1, created_at: 1 }`.

Pour chaque requete, l'API derive l'entreprise autorisee de la session et applique `company_id` dans le filtre MongoDB, y compris pour la modification et la suppression. Elle verifie egalement que le projet et le responsable appartiennent a cette entreprise.

## Isolation et autorisations

Le cookie contient les identifiants du compte et de son entreprise. A chaque requete, l'API verifie la signature puis relit le compte avec les deux identifiants. Les projets sont lus ou modifies uniquement si `company_id` correspond et que l'utilisateur figure dans `member_ids`. Les taches sont toujours requetees avec `company_id` et `project_id`; toute affectation est validee contre les membres du projet. Les routes qui recoivent un identifiant de projet ne l'utilisent jamais seules comme autorisation.

L'API implemente l'inscription d'une entreprise ou l'adhesion par code, la connexion/deconnexion, la liste des membres, le CRUD des tableaux, l'assignation de membres et le CRUD des taches avec responsable. Les roles disponibles sont `owner` et `member`; le createur d'un tableau peut le gerer, tandis que les autres membres conservent les droits de travail dans ce tableau.

MongoDB est lance sans authentification dans le compose de developpement. Il ne doit pas etre expose tel quel en production. Le volume conserve la base lors de `docker compose down`; `docker compose down -v` la supprime.
