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

`projects.description` et `tasks.description` sont des chaines (vides si aucune description n'est fournie). `tasks.due_at` est une date BSON UTC ou `null` lorsqu'aucune echeance n'est definie. L'API represente cette date par une chaine ISO-8601, par exemple `2026-10-20T16:30:00Z`. `created_at` reste la date de creation et n'est pas utilisee comme echeance.

## Calendrier des taches

Le calendrier est une fonctionnalite frontend accessible depuis la barre laterale, sous les tableaux. Pour le remplir, le frontend liste les projets accessibles avec les routes existantes, puis recupere les taches de chacun de ces projets par leurs routes existantes. Il ne conserve que les taches assignees a l'utilisateur courant (`assignee_id`) et ayant une echeance (`due_at`), puis les positionne selon cette echeance dans le mois consulte. Le statut permet de distinguer visuellement les taches. Les taches au statut `done` sont masquees par defaut ; le toggle d'affichage permet de les inclure en semi-transparence. La navigation mensuelle change le mois affiche. Cette fonctionnalite ne requiert ni nouvelle route API ni modification du schema des documents.

## Indexes crees par l'API

- `users`: index unique sur `email`.
- `companies`: index unique sur `invite_code`.
- `projects`: `{ company_id: 1, member_ids: 1, created_at: 1 }`.
- `tasks`: `{ company_id: 1, project_id: 1, created_at: 1 }`.

Pour chaque requete, l'API derive l'entreprise autorisee de la session et applique `company_id` dans le filtre MongoDB, y compris pour la modification et la suppression. Elle verifie egalement que le projet et le responsable appartiennent a cette entreprise.

## Isolation et autorisations

Le cookie contient les identifiants du compte et de son entreprise. A chaque requete, l'API verifie la signature puis relit le compte avec les deux identifiants. Les projets sont lus ou modifies uniquement si `company_id` correspond et que l'utilisateur figure dans `member_ids`. Les taches sont toujours requetees avec `company_id` et `project_id`; toute affectation est validee contre les membres du projet. Les routes qui recoivent un identifiant de projet ne l'utilisent jamais seules comme autorisation.

## Contrat API entreprise et membres

L'API expose les informations de l'entreprise courante avec `GET /api/company` :

```json
{
  "id": "company-id",
  "name": "Atelier Nord",
  "invite_code": "code aleatoire"
}
```

- `PATCH /api/company` accepte `{ "name": "Nouveau nom" }`.
- `DELETE /api/company` renvoie `204 No Content` apres suppression permanente en cascade de l'entreprise, de ses membres, tableaux et taches.
- `PATCH /api/users/{user_id}` accepte un ou les deux champs facultatifs `display_name` et `email`, par exemple `{ "display_name": "Lea Martin", "email": "lea@example.org" }`.
- `DELETE /api/users/{user_id}` renvoie `204 No Content`. La suppression retire egalement le membre des tableaux et annule ses affectations aux taches.

Les quatre routes de gestion ci-dessus sont reservees au role `owner`. Un compte `owner` ne peut pas etre supprime via la route de suppression d'un membre. L'interface demande une confirmation avant une suppression de membre et une confirmation explicite pour la suppression permanente de l'entreprise ; apres la suppression de l'entreprise, le proprietaire est deconnecte.

## Contrat API projets et taches

Les objets projet renvoyes par l'API comprennent `id`, `name`, `description`, `member_ids`, `created_by` et `created_at`. La creation et la modification transmettent la description avec les autres champs projet.

Les objets tache renvoyes par l'API comprennent `id`, `project_id`, `title`, `description`, `status`, `assignee_id`, `due_at`, `created_at` et `updated_at`. `due_at` est `null` ou une date-heure ISO-8601. Les appels de creation et de modification acceptent `description` et `due_at` avec les champs habituels (`title`, `status`, `assignee_id`). La carte frontend nomme explicitement l'echeance et n'utilise pas `created_at` a cette fin.

L'API implemente l'inscription d'une entreprise ou l'adhesion par code, la connexion/deconnexion, la liste des membres, la gestion de l'entreprise et des membres, le CRUD des tableaux, l'assignation de membres et le CRUD des taches avec responsable, description et echeance. Les roles disponibles sont `owner` et `member`; le createur d'un tableau peut le gerer, tandis que les autres membres conservent les droits de travail dans ce tableau.

MongoDB est lance sans authentification dans le compose de developpement. Il ne doit pas etre expose tel quel en production. Le volume conserve la base lors de `docker compose down`; `docker compose down -v` la supprime.
