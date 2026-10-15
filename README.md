# Tandem

Premiere version d'un outil de gestion de projet avec un tableau Kanban. Le frontend React est servi par Nginx, l'API REST est construite avec FastAPI et les taches sont stockees dans MongoDB.

## Demarrage

Prerequis : Docker et Docker Compose.

```bash
docker compose up -d --build
```

Ouvrir [http://localhost:8080](http://localhost:8080). L'API est disponible sur [http://localhost:8000/api](http://localhost:8000/api) et sa documentation interactive sur [http://localhost:8000/api/docs](http://localhost:8000/api/docs).

Les donnees MongoDB sont conservees dans le volume Docker `mongo_data`. Pour arreter l'application sans supprimer les donnees :

```bash
docker compose down
```

Pour supprimer aussi la base locale :

```bash
docker compose down -v
```

## Architecture

- `frontend/` : application React/Vite, construite dans l'image puis servie par Nginx.
- `backend/app/` : API FastAPI, acces asynchrone a MongoDB via PyMongo.
- `compose.yml` : services web, api et mongo ; MongoDB n'est pas expose sur le poste hote.
- `docs/` : specifications fonctionnelle et technique.

Consulter [la specification fonctionnelle](docs/specification-fonctionnelle.md) et [la specification technique](docs/specification-technique.md).

Les taches portent `company_id` et `project_id`, et les index MongoDB commencent par ces champs pour preparer les requetes multi-entreprises. Cette premiere version est un prototype mono-espace : l'identifiant de l'entreprise est configure cote serveur (`DEMO_COMPANY_ID`), mais il n'y a pas encore de comptes, d'authentification ni de gestion des entreprises/projets. Ne pas l'exposer comme service multi-tenant avant d'avoir ajoute l'authentification et l'autorisation cote serveur.

## Configuration

Compose fonctionne sans fichier supplementaire. Pour personnaliser les valeurs, copier `.env.example` vers `.env` puis ajuster les variables. L'hote et le port MongoDB locaux sont injectes par l'environnement. Pour un replica set ou un cluster distant, definir `MONGODB_URI` dans le fichier `.env` local ou dans l'environnement du processus Docker ; cette valeur n'est pas enregistree dans Git. `.env.example` ne contient aucune URI ni aucun identifiant reel. Le service MongoDB local sans authentification est destine au developpement seulement.

Les commandes de developpement frontend se lancent depuis `frontend/` (`npm install`, puis `npm run dev`). Pour l'API, creer un environnement virtuel dans `backend/`, installer `requirements.txt` et lancer `uvicorn app.main:app --reload` depuis ce dossier.
