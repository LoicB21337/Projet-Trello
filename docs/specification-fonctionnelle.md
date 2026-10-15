# Specification fonctionnelle

## Objectif

Tandem est une application web responsive de gestion de projet. Elle reprend le tableau Kanban comme point d'entree et doit, a terme, permettre a plusieurs entreprises de gerer leurs projets, membres et taches sans acceder aux donnees des autres entreprises.

## Version actuelle

- Afficher le tableau du projet de demonstration avec les colonnes « A faire », « En cours » et « Termine ».
- Creer une tache en choisissant son titre et son statut initial.
- Changer son statut en la deplacant entre les colonnes.
- Supprimer une tache.
- Rechercher une tache par son titre.
- Persister les taches dans MongoDB et conserver les donnees apres redemarrage avec un volume Docker.
- Signaler l'etat de connexion a l'API et afficher les erreurs de requete.

## Fonctionnalites prevues

- Creer, modifier et supprimer des entreprises, des projets et des utilisateurs.
- Associer chaque projet et chaque utilisateur a une entreprise.
- Inviter un utilisateur dans une entreprise et gerer ses roles.
- Ajouter des membres a un projet et assigner chaque tache a un utilisateur.
- Modifier le titre, la description, le responsable, l'echeance et le statut d'une tache.
- Proposer des vues tableau et liste, ainsi que des filtres par membre, statut et echeance.
- Authentifier les utilisateurs et autoriser chaque action selon leur appartenance et leur role.

## Isolation des entreprises

Dans la version cible, le serveur determine les entreprises accessibles a partir de l'identite authentifiee. Chaque operation sur un projet ou une tache est limitee cote API a l'entreprise courante ; un identifiant transmis par le navigateur ne constitue jamais une preuve d'autorisation. Les acces hors entreprise doivent echouer sans reveler l'existence de la ressource.

Le prototype actuel configure un seul espace par `DEMO_COMPANY_ID` cote serveur et n'offre ni comptes ni authentification. Il ne satisfait donc pas encore l'exigence d'isolation multi-entreprises pour une mise en production.

## Parcours nominal cible

1. Un administrateur cree son entreprise et son compte, ou rejoint une entreprise existante.
2. Il cree un projet et invite les membres de son entreprise.
3. Les membres consultent le tableau, creent des taches, les assignent et les font progresser entre les statuts.
4. Les changements sont stockes dans MongoDB et restent limites a l'entreprise autorisee.
