import { GoogleGenAI } from '@google/genai';
import { VISUAL_SPEC_JSON_SCHEMA } from '../src/katika/visual/specSchema';
import { validateAndRepairSpec, ValidateSpecResult } from '../src/katika/visual/validateSpec';
import { VisualSpec } from '../src/katika/visual/visualSpec';

let genAIClient: GoogleGenAI | null = null;

function getGenAIClient(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Clé d'API GEMINI_API_KEY absente.");
    }
    genAIClient = new GoogleGenAI({ apiKey });
  }
  return genAIClient;
}

const AI_VISUAL_SYSTEM_PROMPT = `
Tu es le Moteur de Génération Visuelle Officiel de Njambo Kora (Studio Social Katika).
Ton rôle est de transformer le brief de l'utilisateur en une spécification visuelle structurée version 2 (VisualSpec V2) au format JSON.

# RÈGLES STRUCTURALES DU VISUEL (VERSION 2)
1. Format : "SQUARE" (1080x1080, défaut), "STORY" (1080x1920), ou "BANNER" (1920x1080).
2. Palette : "EMERALD_GOLD" (défaut), "EBONY_GOLD", "SUNSET_TERRACOTTA", ou "ROYAL_SAPPHIRE".
3. Motif : "NDOP_CHEVRON" (défaut), "DIAMONDS", ou "MINIMAL".
4. Blocs (2 à 7 blocs maximum, ordonnés) :
   - "BADGE" : Texte court (max 28 caractères, ex: "NJAMBO KORA").
   - "HOOK" : Accroche principale (max 8 mots, OBLIGATOIRE dans le visuel). Indiquer accentWords si pertinent.
   - "BODY" : Explication (max 22 mots).
   - "BULLETS" : 1 à 4 puces (max 9 mots/puce). Style: "CHECK", "SUIT", "NUMBER".
   - "STAT" : Chiffre clé (value: max 8 caractères) + Libellé (label: max 6 mots).
   - "QUOTE" : Citation ou témoignage (max 25 mots).
   - "COMPARE" : Comparaison Avant/Après (leftTitle, leftText, rightTitle, rightText - max 14 mots chaque).
   - "CARDS" : 1 à 5 cartes du jeu. Rang: 3, 4, 5, 6, 7, 8, 9, 10 (SANS As, Roi, Dame, Valet, 2, 10♠). Enseigne: ♥, ♦, ♣, ♠. Libellé "KORA" réservé EXCLUSIVEMENT aux cartes de rang 3. Disposition: "FAN", "ROW", "DUEL".
   - "STEPS" : 2 à 5 étapes (max 6 mots/étape).
   - "EVENT" : Événement/Tournoi (date, prize en jetons virtuels, mode, spots).
   - "IMAGE" : Image externe/capture (frame: "PHONE", "ROUNDED", "NONE").
   - "SPACER" : Espace vertical (size: "S", "M", "L").
5. CTA : Call-To-Action (text: max 5 mots, intent: "PLAY", "JOIN_GROUP", "COMMENT", "SHARE").

# RÈGLES DE SÉCURITÉ ET CONFORMITÉ KATIKA
- INTERDICTION ABSOLUE : Pas de cartes As, Roi, Dame, Valet, 2 ou 10♠.
- INTERDICTION DES SUJETS SENSIBLES : Aucun mot ou référence à l'ethnie, la région, la religion ou la politique (bamileke, beti, sawa, anglophone, francophone, élection, président, religion, etc.).
- PAS DE GAINS EN MONNAIE RÉELLE : Utiliser uniquement "jetons virtuels", "bêta ouverte", "en bêta", "pour le plaisir". Ne jamais écrire "100% gratuit" (remplacer par "bêta ouverte" ou "en bêta").
- AUCUN IDENTIFIANT TECHNIQUE : Pas de #p_usr, #usr, #table, #log dans les textes.
- INTERDICTION ABSOLUE D'INVENTER DES JOUEURS : Ne JAMAIS inventer de pseudo (ex: "Big Smig", "King Kora", etc.) ni de stats individuelles fictives (score de maîtrise, nombre de parties inventé). Si des joueurs officiels certifiés sont fournis dans la télémétrie, tu peux citer leur pseudo exact et leurs scores réels. Si aucun joueur n'est fourni, formule le visuel sous forme de défi communautaire ou d'invitation ("Qui sera le 1er Maître du Kora ?", "Le Trône de Njambo Kora t'attend !", "Défie les champions").
- STATISTIQUES RÉELLES : Si des données de télémétrie sont fournies, utilise des valeurs vérifiables ou reste qualitatif.
`.trim();

/**
 * Génère une VisualSpec V2 complète via Gemini et la valide.
 */
export async function generateVisualSpec({
  brief,
  config,
  metricsSnapshot,
}: {
  brief: string;
  config?: any;
  metricsSnapshot?: any;
}): Promise<ValidateSpecResult> {
  const ai = getGenAIClient();
  const primaryModel =
    (config?.model && String(config.model).trim()) ||
    process.env.GEMINI_MODEL ||
    'gemini-3.8-flash';
  const candidateModels = primaryModel === 'gemini-3.1-flash-lite'
    ? [primaryModel]
    : [primaryModel, 'gemini-3.1-flash-lite'];

  // N'injecter les métriques dans le prompt que si le brief demande explicitement des chiffres ou des stats
  const asksForStats = /chiffre|stat|kpi|partie|manche|podium|top|score|taux|combien|joueur|champion|palmar[eè]s/i.test(brief);
  
  // Extraire les vrais joueurs humains si disponibles
  const isBotEntity = (name: string, id: string) => {
    const n = String(name || '').toLowerCase();
    const i = String(id || '').toLowerCase();
    if (i.includes('bot') || i === 'p2' || i === 'p3' || i === 'p4' || i.startsWith('ai_')) return true;
    if (n.includes('bot') || n.includes('robot') || n.includes('abandon') || n.includes('interrompue') || n.includes('forfait')) return true;
    const botKeywords = ['robam', 'hokuto', 'hokito', 'wizeman', 'thom', 'malo', 'efoulan', 'bozar', 'tchakap', 'mignon', 'vie2poulet', 'malox'];
    return botKeywords.some((kw) => n.includes(kw));
  };

  const rawPlayersList = Array.isArray(metricsSnapshot?.playersOverview?.playersList)
    ? metricsSnapshot.playersOverview.playersList
    : Array.isArray(metricsSnapshot?.playersOverview?.topPlayers)
    ? metricsSnapshot.playersOverview.topPlayers
    : [];

  const topHumanPlayers = rawPlayersList
    .filter((p: any) => p.isHuman !== false && !isBotEntity(p.name, p.id))
    .sort((a: any, b: any) => (b.masteryScore ?? 0) - (a.masteryScore ?? 0))
    .slice(0, 5)
    .map((p: any, idx: number) => ({
      rang: idx + 1,
      pseudo: String(p.name || 'Joueur').replace(/^#(?:p_|usr_|player_|table_)/i, '').replace(/[\(\)\[\]#]/g, '').trim(),
      masteryScore: p.masteryScore ?? 0,
      victoires: p.victories ?? 0,
      parties: p.totalGames ?? 0,
    }));

  let snapshotInfo = '';
  if (asksForStats && metricsSnapshot?.summary) {
    snapshotInfo += `\n\nMÉTRIQUES DE TÉLÉMÉTRIE EN DIRECT :\n${JSON.stringify(metricsSnapshot.summary)}`;
  }
  if (topHumanPlayers.length > 0) {
    snapshotInfo += `\n\nCLASSEMENT OFFICIEL DES JOUEURS HUMAINS (ZÉRO BOT) :\n${JSON.stringify(topHumanPlayers)}`;
  } else if (asksForStats || /top|joueur|champion|ma[iî]tre/i.test(brief)) {
    snapshotInfo += `\n\nCLASSEMENT OFFICIEL DES JOUEURS HUMAINS :\nAucun joueur humain actif enregistré dans le Palmarès actuel. INTERDICTION ABSOLUE D'INVENTER UN PSEUDO (ex: Big Smig) ! Utilise une formule de défi générique ("Qui sera le 1er Maître du Kora ?", "Le trône t'attend").`;
  }

  const promptContents = `${brief}${snapshotInfo}`;

  for (const modelName of candidateModels) {
    // Tentative 1
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [{ text: promptContents }],
          },
        ],
        config: {
          systemInstruction: AI_VISUAL_SYSTEM_PROMPT,
          temperature: 0.7,
          maxOutputTokens: 1500,
          responseMimeType: 'application/json',
          responseSchema: VISUAL_SPEC_JSON_SCHEMA as any,
        },
      });

      const rawText = response.text || '';
      if (rawText.trim()) {
        const parsedRaw = JSON.parse(rawText);
        const result = validateAndRepairSpec(parsedRaw, {
          snapshotStats: asksForStats ? metricsSnapshot?.summary : undefined,
          allowedPlayerNames: topHumanPlayers.map((p) => p.pseudo.toLowerCase()),
        });

        if (result.spec !== null) {
          return result;
        }
      }
    } catch (err) {
      console.warn(`[AI Visual] Premier essai sur "${modelName}" a échoué:`, err);
    }

    // Tentative 2 (Seconde chance en cas d'erreur ou d'invalidation)
    console.info(`[AI Visual] Seconde tentative sur "${modelName}" avec rappel des contraintes strictes...`);
    try {
      const retryPrompt = `
Ta précédente proposition était invalide ou non conforme.
Veuillez générer une VisualSpec V2 stricte au format JSON pour le brief suivant :
"${brief}"
RAPPEL :
- Contient au moins 1 bloc HOOK.
- Aucune carte As/Roi/Dame/Valet/2/10♠.
- KORA uniquement sur un 3.
- Aucun sujet politique, ethnique ou religieux.
- Uniquement jetons virtuels / bêta.
- INTERDICTION FORMELLE D'INVENTER DES JOUEURS FICTIFS (ex: Big Smig) OU DES SCORES INVENTÉS.
`.trim();

      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [{ text: retryPrompt }],
          },
        ],
        config: {
          systemInstruction: AI_VISUAL_SYSTEM_PROMPT,
          temperature: 0.5,
          maxOutputTokens: 1500,
          responseMimeType: 'application/json',
          responseSchema: VISUAL_SPEC_JSON_SCHEMA as any,
        },
      });

      const rawText = response.text || '';
      if (rawText.trim()) {
        const parsedRaw = JSON.parse(rawText);
        const result = validateAndRepairSpec(parsedRaw, {
          snapshotStats: asksForStats ? metricsSnapshot?.summary : undefined,
          allowedPlayerNames: topHumanPlayers.map((p) => p.pseudo.toLowerCase()),
        });
        if (result.spec !== null) {
          return result;
        }
      }
    } catch (retryErr) {
      console.warn(`[AI Visual] Seconde tentative échouée sur "${modelName}":`, retryErr);
    }
  }

  return {
    spec: null,
    warnings: ['La génération de la spécification visuelle a échoué après 2 tentatives.'],
    needsReview: true,
  };
}
