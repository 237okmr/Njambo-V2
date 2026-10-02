/**
 * SOURCE UNIQUE des règles « argent » données à l'IA du copilote (chat et visuels).
 * Aujourd'hui : bêta en jetons virtuels uniquement. Le jour où Kora Cash (mode à argent réel) ouvre, le bouton
 * général Kora Cash n'a qu'à enregistrer le réglage « koraCashEnabled » : les prompts suivent, sans les réécrire.
 *
 * Le texte de la variante « Kora Cash ouvert » est un point de départ prudent : à faire valider par un juriste
 * avant toute activation (règle fixe du projet : aucune règle légale précise affirmée sans source).
 */
export function isKoraCashEnabled(config?: { koraCashEnabled?: boolean } | null): boolean {
  return config?.koraCashEnabled === true;
}

/** Règle « Économie » du prompt du chat (règle n° 3). */
export function buildEconomyRuleForChat(koraCashEnabled: boolean): string {
  if (koraCashEnabled) {
    return "Économie : le mode Kora Cash (mises en argent réel) est ouvert à côté de la bêta en jetons virtuels. Ne jamais promettre ni suggérer un gain, rappeler que ce mode est réservé aux adultes et comporte des risques, ne jamais affirmer une règle légale précise sans source, recommander une validation par un juriste. Les dotations de tournoi en jetons virtuels portent la mention « Jetons virtuels d'amusement — Aucune valeur monétaire réelle ».";
  }
  return "aujourd'hui l'économie est exclusivement en jetons virtuels ; aucune monnaie réelle n'est implémentée. Un modèle à mises réelles avec prélèvement (rake) est envisagé mais non décidé : ne jamais le présenter comme acquis, ne jamais affirmer une règle légale précise sans source, recommander une validation par un juriste. Les dotations de tournoi sont proposées comme options chiffrées en jetons virtuels, avec la mention « Jetons virtuels d'amusement — Aucune valeur monétaire réelle ».";
}

/** Règle « argent » du prompt de création de visuels et de posts. */
export function buildMoneyRulesBlock(koraCashEnabled: boolean): string {
  if (koraCashEnabled) {
    return "- ARGENT RÉEL : le mode Kora Cash est ouvert. Tu peux le mentionner, toujours avec « réservé aux adultes » et « jouer comporte des risques », sans jamais promettre ni suggérer un gain. Pour la bêta et les tournois en jetons virtuels, utiliser uniquement « jetons virtuels », « bêta ouverte », « en bêta ». Ne jamais écrire « 100% gratuit ».";
  }
  return '- PAS DE GAINS EN MONNAIE RÉELLE : utiliser uniquement « jetons virtuels », « bêta ouverte », « en bêta », « pour le plaisir ». Ne jamais écrire « 100% gratuit » (remplacer par « bêta ouverte » ou « en bêta »).';
}
