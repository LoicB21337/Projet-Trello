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

Les routes de gestion de l'entreprise et des membres sont reservees au proprietaire. Les structures et regles API sont detaillees dans [la specification fonctionnelle](docs/specification-fonctionnelle.md) et [la specification technique](docs/specification-technique.md).

## Comptes et entreprises

Au premier lancement, creez un compte et choisissez un nom d'entreprise : l'entreprise et son compte administrateur sont enregistres dans MongoDB. Pour ajouter un collegue, copiez le code d'invitation affiche dans la barre laterale ; celui-ci choisit « Rejoindre une entreprise » lors de son inscription.

Les tableaux appartiennent a une entreprise et leur creation permet de selectionner les membres. Ils peuvent comporter une description. Les taches sont propres au tableau, peuvent etre assignees a plusieurs de ses membres et ont une description ainsi qu'une echeance facultative (affichee separement de leur date de creation). La connexion utilise un cookie de session HTTP-only ; l'API derive l'entreprise de la session, verifie l'appartenance au tableau et ne fait pas confiance a un `company_id` fourni par le navigateur.

Le calendrier, accessible depuis la barre laterale sous les tableaux, rassemble les taches assignees a l'utilisateur courant a leur echeance. Cliquer sur une tache du calendrier ouvre son tableau. Les taches sont distinguees par statut ; les taches terminees sont masquees par defaut et peuvent etre affichees avec le toggle, en semi-transparence. La navigation permet de passer d'un mois a l'autre.

Le proprietaire peut ouvrir « Gerer l'entreprise » depuis le menu de l'entreprise pour renommer celle-ci et modifier ou supprimer les membres. Le compte proprietaire ne peut pas etre supprime comme membre. Supprimer un membre retire aussi ses affectations et ses acces aux tableaux. La suppression de l'entreprise est permanente et en cascade (membres, tableaux et taches) ; elle exige une confirmation explicite et deconnecte le proprietaire.

## Configuration

Compose fonctionne sans fichier supplementaire. Pour personnaliser les valeurs, copier `.env.example` vers `.env` puis ajuster les variables. Ce fichier est ignore par Git. Pour un replica set ou un cluster distant, definir `MONGODB_URI` uniquement dans `.env`. En local, une cle de session aleatoire est generee au demarrage ; definir `AUTH_SECRET_KEY` dans `.env` pour conserver les sessions lors des redemarrages. En production, utiliser une cle privee aleatoire et activer `AUTH_COOKIE_SECURE` derriere HTTPS. MongoDB local sans authentification est destine au developpement seulement.

Les commandes de developpement frontend se lancent depuis `frontend/` (`npm install`, puis `npm run dev`). Pour l'API, creer un environnement virtuel dans `backend/`, installer `requirements.txt` et lancer `uvicorn app.main:app --reload` depuis ce dossier.
