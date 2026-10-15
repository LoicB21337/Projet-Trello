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

## Comptes et entreprises

Au premier lancement, creez un compte et choisissez un nom d'entreprise : l'entreprise et son compte administrateur sont enregistres dans MongoDB. Pour ajouter un collegue, copiez le code d'invitation affiche dans la barre laterale ; celui-ci choisit « Rejoindre une entreprise » lors de son inscription.

Les tableaux appartiennent a une entreprise et leur creation permet de selectionner les membres. Les taches sont propres au tableau, peuvent etre assignees a l'un de ses membres et restent stockees dans MongoDB. La connexion utilise un cookie de session HTTP-only ; l'API derive l'entreprise de la session, verifie l'appartenance au tableau et ne fait pas confiance a un `company_id` fourni par le navigateur.

## Configuration

Compose fonctionne sans fichier supplementaire. Pour personnaliser les valeurs, copier `.env.example` vers `.env` puis ajuster les variables. Ce fichier est ignore par Git. Pour un replica set ou un cluster distant, definir `MONGODB_URI` uniquement dans `.env`. En local, une cle de session aleatoire est generee au demarrage ; definir `AUTH_SECRET_KEY` dans `.env` pour conserver les sessions lors des redemarrages. En production, utiliser une cle privee aleatoire et activer `AUTH_COOKIE_SECURE` derriere HTTPS. MongoDB local sans authentification est destine au developpement seulement.

Les commandes de developpement frontend se lancent depuis `frontend/` (`npm install`, puis `npm run dev`). Pour l'API, creer un environnement virtuel dans `backend/`, installer `requirements.txt` et lancer `uvicorn app.main:app --reload` depuis ce dossier.
