# Adaptation du Header d'Accueil (Options 1 & 2)

Optimisation ergonomique et responsive de la barre supérieure de l'écran d'accueil pour éliminer tout débordement horizontal sur mobile et garantir la visibilité complète du bouton de volume.

## Choix Validés & Décisions Clés

> [!IMPORTANT]
> L'utilisateur a validé la combinaison de l'**Option 1** (bouton PWA en icône seule sur mobile) et de l'**Option 2** (masquage complet du bouton PWA quand l'application est déjà installée).

- **Condition d'affichage PWA (Option 2)** : Si l'application est déjà installée (`isPwaInstalled === true`), le bouton d'installation est masqué du header d'accueil, libérant instantanément ~110px. L'accès aux informations d'installation reste consultable dans le profil/paramètres.
- **Affichage compact quand non installée (Option 1)** : Lorsque l'application n'est pas encore installée (`!isPwaInstalled`), le bouton s'affiche sous un format carré unifié `h-9 w-9` avec l'icône smartphone sur mobile, et n'affiche le texte `"Installer"` que sur écran plus large (`sm:inline`).
- **Garantie de non-débordement** : Tous les éléments (logo, notifications, profil, règles, installation éventuelle, volume) tiennent désormais confortablement sur les écrans de 320px à 390px sans jamais tronquer le bouton de son.

---

## 1. Vue d'ensemble & Problème Résolu

### Problème Identifié
Sur smartphone (360px à 390px de large), l'accumulation du bouton profil avec texte, du bouton règles, du bouton PWA avec libellé `"Installée ✓"` (~110px de large) et de la cloche de notifications créait une largeur totale supérieure à 400px. Le dernier bouton à droite (contrôle du volume) était refoulé et tronqué par le bord droit de l'écran.

```
AVANT (Débordement mobile) :
┌───┐ ┌───┐ ┌───────────────┐ ┌───┐ ┌────────────────┐ ┌──..
│🎴 │ │ 🔔│ │👤 Hokuto    > │ │📖 │ │📱 Installée ✓  │ │🔊 (Coupé)
└───┘ └───┘ └───────────────┘ └───┘ └────────────────┘ └──..

APRÈS - Cas 1 : Application déjà installée (Option 2)
┌───┐         ┌───┐ ┌───────────────┐ ┌───┐ ┌───┐
│🎴 │         │ 🔔│ │👤 Hokuto    > │ │📖 │ │🔊 │ (Tout est visible & aéré)
└───┘         └───┘ └───────────────┘ └───┘ └───┘

APRÈS - Cas 2 : Application non installée (Option 1)
┌───┐       ┌───┐ ┌───────────────┐ ┌───┐ ┌───┐ ┌───┐
│🎴 │       │ 🔔│ │👤 Hokuto    > │ │📖 │ │📱 │ │🔊 │ (Parfaitement aligné)
└───┘       └───┘ └───────────────┘ └───┘ └───┘ └───┘
```

---

## 2. Expérience Utilisateur & Design Visuel

- **Harmonie des tokens de boutons** : Tous les boutons secondaires d'action du header utilisent la classe canonique `h-9 w-9 rounded-xl` avec un fond sombre `bg-slate-800/90`, bordure discrète `border-slate-700/80` et transition fluide au tap (`active:scale-95`).
- **Accessibilité tactile** : La zone de frappe tactile minimale de 36px avec padding environnant respecte les cibles tactiles mobiles tout en évitant les collisions. Les attributs `aria-label` et `title` restent explicites (`"Installer l'application sur votre appareil"`).
- **Profil équilibré** : Le libellé du pseudo dans `HeaderProfileButton` est borné avec `max-w-[75px] xs:max-w-[90px] sm:max-w-[120px] truncate` pour garantir qu'un pseudo très long ne force jamais un débordement.

---

## 3. Plan de Mise en Œuvre Technique

### Fichiers impactés

1. `src/components/HomeScreen.tsx` :
   - Mettre à jour la condition du bouton PWA :
     - Si `isPwaInstalled` est `true` : Ne pas afficher le bouton dans le header.
     - Si `!isPwaInstalled` et `onOpenInstallModal` présent : Afficher le bouton avec classe `h-9 w-9 sm:w-auto px-0 sm:px-2.5 rounded-xl justify-center sm:gap-1.5`, l'icône `<Smartphone className="w-4 h-4 text-amber-400" />` et le texte `<span className="hidden sm:inline">Installer</span>`.
   - S'assurer que le container des actions de droite conserve `shrink-0 gap-1.5 sm:gap-2` et ne provoque aucun overflow.

2. Vérification de compatibilité & tests :
   - Tester le comportement en simulant `isPwaInstalled = true` et `isPwaInstalled = false`.
   - Lancer `compile_applet` pour valider l'absence d'erreurs TypeScript ou de syntaxe.
