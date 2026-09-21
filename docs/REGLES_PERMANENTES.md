# RÈGLES PERMANENTES DU PROJET NJAMBO KORA

Ce document consigne les règles d'architecture et de logique métier **permanentes**, strictes et inviolables de la plateforme Njambo Kora, sauf demande explicite et univoque du propriétaire du projet.

---

## 🏆 1. RÈGLE PERMANENTE DU PALMARÈS (LEADERBOARD)

> **MANDAT STRICT :**
> Le Palmarès (tous onglets : *Classement*, *Ratio*, *Kora*, *Fortune* et toutes périodes : *Tout*, *Semaine*, *Mois*) ne doit contenir **QUE des joueurs humains authentifiés avec un compte Google officiel (`google.com`)**, ayant des statistiques valides et cohérentes.

### Critères stricts d'éligibilité :
1. **Authentification Google obligatoire** :
   - `isGuest` doit être explicitement `false`.
   - `authProvider` doit être `'google.com'`.
   - Les comptes invités, anonymes, locaux ou non authentifiés sont **strictement exclus**.
2. **Exclusion totale des Robots et Simulateurs** :
   - Le drapeau `isBot` doit être `false` (ou absent).
   - L'identifiant `uid` ne doit **pas** débuter par un préfixe de bot ou de compte de test : `champ_kora_`, `bot_`, `usr_`, `guest_`, `test_`, `demo_`, `mock_`, `fake_`.
   - Le `displayName` ne doit pas correspondre à un nom officiel de bot ni à des termes génériques de substitution (*"joueur"*, *"bot"*, *"vous"*, *"player"*).
3. **Statistiques Valides et Cohérentes** :
   - Le joueur doit avoir disputé au moins une partie (`MIN_GAMES_TO_APPEAR = 1`, soit `totalGames >= 1` ou `gamesPlayed >= 1` ou `partiesPlayed >= 1`).
   - Nombre de victoires inférieur ou égal au nombre de parties : `victories <= totalGames` et `partiesWon <= partiesPlayed`.
   - Nombre de Double Kora inférieur ou égal au nombre de Kora : `doubleKoraCount <= koraCount`.
   - Solde de points et de jetons non négatifs.

### Fichiers Garants :
- **Serveur & API Cache** : `server.ts` (`/api/leaderboard/cached`), `server/services/leaderboardCache.ts`
- **Définition & Prédicats Métier** : `src/services/masteryConfig.ts` (`isEligibleLeaderboardUser`, `getLeaderboardIneligibilityReasons`)
- **Service Client & Cache Local** : `src/services/leaderboardService.ts`
- **Sécurité Base de Données** : `firestore.rules` (règle `isGoogleSignIn()` pour la création/mise à jour des profils `users/{userId}`)
- **Console d'Arbitrage Katika** : `src/katika/components/tabs/KatikaPlayersTab.tsx` (Onglet Audit Éligibilité Palmarès) & `src/katika/services/katikaService.ts`

---

## 🔒 2. RÈGLES DE SÉCURITÉ ET D'INTÉGRITÉ DES PROFILS
- Aucun compte invité ou anonyme ne peut écrire directement dans la collection racine `users/{userId}` sur Firestore.
- La mise à jour des statistiques de maîtrise (`masteryScore`) et des soldes est strictement bornée et contrôlée par les règles de sécurité `firestore.rules`.
- L'e-mail privé des joueurs authentifiés est isolé dans la sous-collection `users/{userId}/private/` et ne figure jamais dans les données publiques.
