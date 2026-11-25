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
- Definir les taches prealables a une autre tache ; celle-ci reste bloquee tant que tous ses prerequis ne sont pas termines.
- Ajouter a une tache une checklist d'etapes, modifier le libelle des etapes, les cocher et suivre leur progression depuis la carte.
- Choisir le statut initial et une ou plusieurs personnes responsables parmi les membres du tableau ; modifier le statut par glisser-deposer.
- Acceder au calendrier depuis la barre laterale, sous les tableaux ; il rassemble les taches assignees a l'utilisateur courant et les place a leur echeance, avec une distinction visuelle par statut.
- Naviguer entre les mois du calendrier. Les taches terminees sont masquees par defaut ; un toggle permet de les afficher en semi-transparence.
- Rechercher une tache par son titre et afficher les compteurs Kanban.
- Enregistrer les entreprises, comptes, tableaux, membres et taches dans MongoDB ; le volume Docker conserve les donnees au redemarrage.
- Signaler l'etat de connexion et afficher les erreurs de requete.

Chaque compte appartient a une seule entreprise dans cette version. Un administrateur peut partager le code d'invitation de son entreprise ; un utilisateur qui le saisit rejoint cette entreprise comme membre.

## Calendrier des taches

Le calendrier est accessible depuis la barre laterale, sous la liste des tableaux. Il rassemble, a leur date d'echeance, les taches auxquelles l'utilisateur courant est assigne dans les tableaux auxquels il a acces. Un clic sur une tache du calendrier ouvre le tableau correspondant. Les taches sans echeance ne sont pas placees dans le calendrier. Leur statut est distingue visuellement. Les taches terminees sont masquees par defaut ; l'utilisateur peut les afficher au moyen d'un toggle, auquel cas elles apparaissent en semi-transparence. La navigation permet de consulter les mois precedents et suivants.

## Gestion de l'entreprise et des membres

Seul le proprietaire peut utiliser les routes de gestion de l'entreprise et des comptes membres. Il peut modifier le nom de l'entreprise et les champs `display_name` et `email` d'un compte. Un compte ayant le role `owner` ne peut pas etre supprime en tant que membre. La suppression d'un membre le retire des listes de responsables des taches et de ses droits d'acces aux tableaux. La suppression de l'entreprise est permanente et cascade sur ses donnees dependantes ; l'interface demande une confirmation explicite avant l'appel et deconnecte l'utilisateur apres succes. La suppression d'un tableau demeure distincte : elle supprime ses taches.

## Isolation stricte des entreprises

L'entreprise est determinee a partir de la session signee et du compte relu en base, jamais a partir d'un `company_id` fourni par le navigateur. Chaque lecture, modification et suppression de tableau ou de tache est filtree par l'entreprise. L'API verifie aussi que l'utilisateur appartient au tableau et que chaque responsable d'une tache appartient a la meme entreprise et au meme tableau. Une ressource d'une autre entreprise est traitee comme introuvable.

## Parcours nominal

1. L'administrateur cree son compte et son entreprise.
2. Il partage le code d'invitation ; ses collegues creent leur compte en rejoignant l'entreprise.
3. Un membre cree un tableau et selectionne les personnes de son entreprise qui y participent.
4. Les membres creent des taches avec une description et une echeance facultative, les assignent a une ou plusieurs personnes et les font progresser entre les statuts.
5. Le proprietaire gere le nom de l'entreprise et ses membres, ou supprime l'entreprise avec confirmation.
6. MongoDB conserve les donnees et l'API limite chaque operation a l'entreprise et au tableau autorises.

## Checklists de taches

Chaque tache peut contenir jusqu'a 100 sous-taches. Une sous-tache possede un identifiant unique, un titre de 1 a 200 caracteres, une description facultative de 2000 caracteres maximum et un etat coche/non coche. Les sous-taches peuvent etre ajoutees, modifiees, cochees ou supprimees dans le formulaire de la tache ; la carte affiche le nombre d'etapes cochees.

## Dependances entre taches

Une tache peut avoir une ou plusieurs taches prealables dans le meme tableau. Elle ne peut pas dependre d'elle-meme et les dependances circulaires sont refusees. Tant qu'un prerequis n'est pas termine, la tache dependante ne peut pas passer a un statut autre que « A faire » ; sa carte indique qu'elle est en attente. La suppression d'un prerequis retire automatiquement le lien des taches dependantes.
