# Specification fonctionnelle

## Objectif

Tandem est une application web responsive de gestion de projet. Elle reprend le tableau Kanban comme point d'entree et doit, a terme, permettre a plusieurs entreprises de gerer leurs projets, membres et taches sans acceder aux donnees des autres entreprises.

## Fonctionnalites

- Creer un compte avec nom, email et mot de passe ; l'inscription peut creer une entreprise avec le compte comme administrateur, ou rejoindre une entreprise avec son code d'invitation.
- Se connecter et se deconnecter ; la session est portee par un cookie HTTP-only signe.
- Afficher l'entreprise et son code d'invitation ; le proprietaire peut renommer l'entreprise, modifier les noms et adresses email des membres, et supprimer un membre.
- Permettre au proprietaire de supprimer definitivement l'entreprise apres confirmation explicite ; cette operation supprime en cascade ses membres, tableaux et taches puis deconnecte le proprietaire.
- Afficher et gerer les tableaux accessibles au compte : creation, renommage et suppression.
- Renseigner une description a la creation ou a la modification d'un tableau.
- A la creation ou a la modification d'un tableau, choisir les membres de la meme entreprise qui y ont acces.
- Creer, modifier et supprimer des taches dans le tableau ouvert.
- Renseigner une description et une echeance facultative pour une tache ; afficher l'echeance explicitement sur sa carte, distinctement de la date de creation.
- Choisir le statut initial et le responsable parmi les membres du tableau ; modifier le statut par glisser-deposer.
- Rechercher une tache par son titre et afficher les compteurs Kanban.
- Enregistrer les entreprises, comptes, tableaux, membres et taches dans MongoDB ; le volume Docker conserve les donnees au redemarrage.
- Signaler l'etat de connexion et afficher les erreurs de requete.

Chaque compte appartient a une seule entreprise dans cette version. Un administrateur peut partager le code d'invitation de son entreprise ; un utilisateur qui le saisit rejoint cette entreprise comme membre.

## Gestion de l'entreprise et des membres

Seul le proprietaire peut utiliser les routes de gestion de l'entreprise et des comptes membres. Il peut modifier le nom de l'entreprise et les champs `display_name` et `email` d'un compte. Un compte ayant le role `owner` ne peut pas etre supprime en tant que membre. La suppression d'un membre supprime aussi ses affectations aux taches et ses droits d'acces aux tableaux. La suppression de l'entreprise est permanente et cascade sur ses donnees dependantes ; l'interface demande une confirmation explicite avant l'appel et deconnecte l'utilisateur apres succes. La suppression d'un tableau demeure distincte : elle supprime ses taches.

## Contrat JSON expose

- `GET /api/company` expose l'entreprise courante sous la forme `{ "id": "...", "name": "...", "invite_code": "..." }`.
- `PATCH /api/company` accepte `{ "name": "..." }`. `DELETE /api/company` reussit avec le statut `204` sans corps.
- `PATCH /api/users/{user_id}` accepte un objet contenant un ou les deux champs facultatifs `display_name` et `email`. `DELETE /api/users/{user_id}` reussit avec le statut `204` sans corps.
- Les routes de creation et de modification des tableaux transportent `description` avec `name` et, selon l'operation, `member_ids`. Une description vide est autorisee.
- Les routes de creation et de modification des taches transportent `description` et `due_at` en plus des champs habituels (`title`, `status`, `assignee_id`). `due_at` est soit `null`/absent, soit une date-heure ISO-8601 ; l'API renvoie sa valeur date-heure ISO-8601.

Exemples des objets renvoyes par les routes de lecture :

```json
{
  "id": "company-id",
  "name": "Atelier Nord",
  "invite_code": "code-invitation"
}
```

```json
{
  "id": "project-id",
  "name": "Lancement produit",
  "description": "Preparation du lancement",
  "member_ids": ["user-id"],
  "created_by": "user-id",
  "created_at": "2026-10-15T10:00:00Z"
}
```

```json
{
  "id": "task-id",
  "project_id": "project-id",
  "title": "Preparer les maquettes",
  "description": "Valider les ecrans avec l'equipe",
  "status": "todo",
  "assignee_id": null,
  "due_at": "2026-10-20T16:30:00Z",
  "created_at": "2026-10-15T10:00:00Z",
  "updated_at": "2026-10-15T10:00:00Z"
}
```

`created_at` est la date de creation et ne represente jamais l'echeance.

## Isolation stricte des entreprises

L'entreprise est determinee a partir de la session signee et du compte relu en base, jamais a partir d'un `company_id` fourni par le navigateur. Chaque lecture, modification et suppression de tableau ou de tache est filtree par l'entreprise. L'API verifie aussi que l'utilisateur appartient au tableau et que le responsable d'une tache appartient a la meme entreprise et au meme tableau. Une ressource d'une autre entreprise est traitee comme introuvable.

## Parcours nominal

1. L'administrateur cree son compte et son entreprise.
2. Il partage le code d'invitation ; ses collegues creent leur compte en rejoignant l'entreprise.
3. Un membre cree un tableau et selectionne les personnes de son entreprise qui y participent.
4. Les membres creent des taches avec une description et une echeance facultative, les assignent et les font progresser entre les statuts.
5. Le proprietaire gere le nom de l'entreprise et ses membres, ou supprime l'entreprise avec confirmation.
6. MongoDB conserve les donnees et l'API limite chaque operation a l'entreprise et au tableau autorises.
