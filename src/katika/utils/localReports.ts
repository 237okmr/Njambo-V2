import { KatikaMetricsSnapshot } from '../services/katikaMetricsSnapshot';

/**
 * Génère un rapport de diagnostic et de santé opérationnelle complet en Markdown
 * exécuté 100% en local côté navigateur, sans appel réseau ni consommation de quota Gemini.
 */
export function buildLocalHealthReport(snapshot: KatikaMetricsSnapshot | null): string {
  if (!snapshot) {
    return `### 🩺 Bilan de Santé Opérationnelle (Local)
⚠️ *Métriques non disponibles pour le moment. Veuillez patienter ou cliquer sur Rafraîchir.*`;
  }

  const dateStr = snapshot.formattedDate || new Date(snapshot.timestamp).toLocaleString('fr-FR');
  const summary = snapshot.summary;
  const kpis = snapshot.kpis?.allTime;
  const anomalies = snapshot.detectedAnomalies || [];
  const topPlayers = snapshot.playersOverview?.topPlayers || [];
  const baseline = snapshot.whatIfBaseline;
  const config = snapshot.activeEngineConfig;

  let report = `### 🩺 Bilan de Santé Opérationnel du Serveur Njambo Kora
*Généré instantanément en local le ${dateStr}*

---

#### 1. 📊 Vue d'Ensemble & Stabilité Système
- **Indice de Santé Global** : **${summary.healthStatus}** (${summary.completionRatePct}% de complétion)
- **Tables Actives en Temps Réel** : \`${summary.activeRooms}\` table(s)
- **Joueurs Connectés en Ligne** : \`${summary.connectedPlayers}\` joueur(s)
- **Total Manches Débutées** : \`${summary.totalManches}\`
- **Total Parties / Donnes Disputées** : \`${summary.totalParties}\`

#### 2. ⚡ Indicateurs Clés de Jeu (KPIs)
- **Koras Simples validés** : \`${kpis?.koraCount ?? 0}\`
- **Doubles Koras d'anthologie** : \`${kpis?.doubleKoraCount ?? 0}\`
- **Victoires 3 Sept** : \`${kpis?.threeSevensCount ?? 0}\` | **Victoires < 21** : \`${kpis?.under21Count ?? 0}\`
- **Manches Abandonnées / Forfaits** : \`${kpis?.manchesAbandonedCount ?? 0}\` (${kpis?.abandonmentFrustrations?.abandonmentRate ?? 0}% d'abandon)
- **Moyenne Donnes / Manche** : \`${kpis?.avgPartiesPerManche ?? 0}\`

#### 3. ⏱️ Cadence & Configuration Moteur
- **Timer de tour configuré** : \`${config?.turnTimerSeconds ?? baseline?.currentTimer ?? 15}s\`
- **Durée moyenne par donne** : \`${baseline?.avgPartieSec ?? 25}s\`
- **Durée moyenne par manche** : \`${baseline?.avgMancheSec ?? 180}s\`
- **Multiplicateurs Kora / Double Kora** : \`x${config?.koraMultiplier ?? baseline?.currentKoraMultiplier ?? 2}\` / \`x${config?.doubleKoraMultiplier ?? baseline?.currentDoubleKoraMultiplier ?? 4}\`
- **Mise minimale par table** : \`${config?.minTableBet ?? baseline?.currentMinBet ?? 100} jetons\`

#### 4. 🚨 Détection des Anomalies & Alertes (${anomalies.length})
`;

  if (anomalies.length === 0) {
    report += `> ✅ **Aucune anomalie critique détectée.** La fluidité des donnes, l'économie et le comportement des joueurs sont conformes aux seuils nominaux.\n`;
  } else {
    anomalies.forEach((a) => {
      const severityIcon = a.severity === 'CRITICAL' ? '🛑' : a.severity === 'WARNING' ? '⚠️' : 'ℹ️';
      report += `- ${severityIcon} **[${a.category}] ${a.title}** : ${a.description} *(Valeur : \`${JSON.stringify(a.value)}\` | Seuil : \`${a.threshold}\`)*\n`;
    });
  }

  if (topPlayers.length > 0) {
    report += `\n#### 5. 👑 Champions en Tête (Données Réelles)\n`;
    topPlayers.slice(0, 3).forEach((p, idx) => {
      const medals = ['🥇', '🥈', '🥉'];
      report += `- ${medals[idx] || '•'} **${p.name}** — \`${p.victories} victoires\` | \`${p.chips.toLocaleString('fr-FR')} jetons\` | Taux d'abandon : \`${p.abandonRate}%\`\n`;
    });
  }

  report += `\n---
*⚡ Diagnostic généré 100% côté client sans appel réseau ni consommation de quota Gemini.*`;

  return report;
}
