# Specification fonctionnelle

## Objectif

Tandem est une application web responsive de gestion de projet. Elle reprend le tableau Kanban comme point d'entree et doit, a terme, permettre a plusieurs entreprises de gerer leurs projets, membres et taches sans acceder aux donnees des autres entreprises.

## Fonctionnalites

- Creer un compte avec nom, email et mot de passe ; l'inscription peut creer une entreprise avec le compte comme administrateur, ou rejoindre une entreprise avec son code d'invitation.
- Se connecter et se deconnecter ; la session est portee par un cookie HTTP-only signe.
- Afficher et gerer les tableaux accessibles au compte : creation, renommage et suppression.
- A la creation ou a la modification d'un tableau, choisir les membres de la meme entreprise qui y ont acces.
- Creer, modifier et supprimer des taches dans le tableau ouvert.
- Choisir le statut initial et le responsable parmi les membres du tableau ; modifier le statut par glisser-deposer.
- Rechercher une tache par son titre et afficher les compteurs Kanban.
- Enregistrer les entreprises, comptes, tableaux, membres et taches dans MongoDB ; le volume Docker conserve les donnees au redemarrage.
- Signaler l'etat de connexion et afficher les erreurs de requete.

Chaque compte appartient a une seule entreprise dans cette version. Un administrateur peut partager le code d'invitation de son entreprise ; un utilisateur qui le saisit rejoint cette entreprise comme membre.

## Isolation stricte des entreprises

L'entreprise est determinee a partir de la session signee et du compte relu en base, jamais a partir d'un `company_id` fourni par le navigateur. Chaque lecture, modification et suppression de tableau ou de tache est filtree par l'entreprise. L'API verifie aussi que l'utilisateur appartient au tableau et que le responsable d'une tache appartient a la meme entreprise et au meme tableau. Une ressource d'une autre entreprise est traitee comme introuvable.

## Parcours nominal

1. L'administrateur cree son compte et son entreprise.
2. Il partage le code d'invitation ; ses collegues creent leur compte en rejoignant l'entreprise.
3. Un membre cree un tableau et selectionne les personnes de son entreprise qui y participent.
4. Les membres creent des taches, les assignent et les font progresser entre les statuts.
5. MongoDB conserve les donnees et l'API limite chaque operation a l'entreprise et au tableau autorises.
