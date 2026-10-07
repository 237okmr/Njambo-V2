import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { VISUAL_VARIANTS_JSON_SCHEMA } from '../src/katika/visual/specSchema';
import { validateAndRepairSpec, ValidateSpecResult } from '../src/katika/visual/validateSpec';
import {
  VISUAL_BLOCK_TYPES,
  VISUAL_FORMATS,
  VISUAL_PALETTES,
  VISUAL_PATTERNS,
} from '../src/katika/visual/visualSpec';
import { isTransitoryError } from './aiAdminChat';
import { getEngineConfig } from './engine/engineConfig';
import { buildMoneyRulesBlock, isKoraCashEnabled } from '../src/katika/visual/moneyPolicy';
import { applyVariantChecks } from '../src/katika/visual/variantCheck';
import { injectTrickBlock, momentToBrief, removeDuplicateCards } from '../src/katika/visual/situation';
import type { KoraMoment } from './engine/koraMoment';

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

/** Plafond d'appels Gemini pour un même visuel (essai + une seule relance + un seul modèle de secours). */
const MAX_GEMINI_CALLS_PER_VISUAL = 3;

/** Nombre de variantes demandées en un seul appel. */
const VARIANTS_COUNT = 3;

function buildVisualSystemPrompt(koraCashEnabled: boolean): string {
  return `
Tu es le Moteur de Génération Visuelle Officiel de Njambo Kora (Studio Social Katika).
Tu transformes le brief de l'administrateur en ${VARIANTS_COUNT} VARIANTES de visuel (VisualSpec V2, au format JSON) et, pour chacune, le texte du post qui l'accompagne.

# ${VARIANTS_COUNT} VARIANTES DISTINCTES
- Renvoie exactement ${VARIANTS_COUNT} variantes dans "variants", avec les angles "HUMOUR" (clin d'œil urbain camerounais), "DEFI" (provoque une réponse du lecteur) et "CLAIR" (simple et pédagogique).
- Les ${VARIANTS_COUNT} variantes doivent différer par la palette, le motif ET l'accroche (3 accroches différentes, 3 palettes différentes si possible).

# STRUCTURE D'UN VISUEL (VERSION 2)
1. Format : ${VISUAL_FORMATS.join(', ')} ("SQUARE" par défaut = 1080x1080 ; "STORY" = 1080x1920 ; "BANNER" = 1920x1080).
2. Palette : ${VISUAL_PALETTES.join(', ')} ("EMERALD_GOLD" par défaut).
3. Motif : ${VISUAL_PATTERNS.join(', ')} ("NDOP_CHEVRON" par défaut).
4. Blocs (2 à 7 maximum, ordonnés). Types autorisés : ${VISUAL_BLOCK_TYPES.join(', ')}.
   - "BADGE" : texte court (max 28 caractères, ex : "NJAMBO KORA").
   - "HOOK" : accroche principale (max 8 mots, OBLIGATOIRE). Indiquer accentWords si pertinent.
   - "BODY" : explication (max 22 mots).
   - "BULLETS" : 1 à 4 puces (max 9 mots par puce). Style : "CHECK", "SUIT", "NUMBER".
   - "STAT" : chiffre clé (value : max 8 caractères) + libellé (label : max 6 mots).
   - "QUOTE" : citation ou témoignage (max 25 mots).
   - "COMPARE" : comparaison avant/après (leftTitle, leftText, rightTitle, rightText ; max 14 mots chacun).
   - "CARDS" : 1 à 5 cartes du jeu. Rang : 3, 4, 5, 6, 7, 8, 9, 10 (SANS As, Roi, Dame, Valet, 2, 10♠). Enseigne : ♥, ♦, ♣, ♠. Libellé "KORA" réservé EXCLUSIVEMENT aux cartes de rang 3. Disposition : "FAN", "ROW", "DUEL".
   - "STEPS" : 2 à 5 étapes (max 6 mots par étape).
   - "EVENT" : événement ou tournoi (date, prize en jetons virtuels, mode, spots).
   - "IMAGE" : image externe ou capture (frame : "PHONE", "ROUNDED", "NONE").
   - "SPACER" : espace vertical (size : "S", "M", "L").
5. CTA : appel à l'action (text : max 5 mots, intent : "PLAY", "JOIN_GROUP", "COMMENT", "SHARE").

# POST D'ACCOMPAGNEMENT (champs story, question, hashtags) : il COMPLÈTE le visuel, il ne le répète pas
- story : 1 à 3 phrases courtes (40 mots maximum). Voix d'Hokuto : un pote humble qui lance un défi, tutoiement, argot urbain léger. Raconte le contexte ou le moment. Ne recopie ni l'accroche ni le texte du visuel.
- question : 12 mots maximum, qui fait réagir (pronostic, vote A ou B, défi, ou « tag un pote qui… »). Les 3 variantes ont 3 questions de types différents.
- hashtags : 0 à 3 parmi #NjamboKora, #JeuDeCartes, #Katika, #Kora, #BêtaTest.
- Jamais de revendication du type « premier jeu camerounais », jamais de promesse de gain.

# RÈGLES DE SÉCURITÉ ET CONFORMITÉ KATIKA
- INTERDICTION ABSOLUE : pas de cartes As, Roi, Dame, Valet, 2 ou 10♠. Le Kora est uniquement le 5e pli gagné avec un 3.
- INTERDICTION DES SUJETS SENSIBLES : aucun mot ou référence à l'ethnie, la région, la religion ou la politique (bamileke, beti, sawa, anglophone, francophone, élection, président, religion, etc.).
${buildMoneyRulesBlock(koraCashEnabled)}
- AUCUN IDENTIFIANT TECHNIQUE : pas de #p_usr, #usr, #table, #log dans les textes.
- INTERDICTION ABSOLUE D'INVENTER DES JOUEURS : ne JAMAIS inventer de pseudo (ex : "Big Smig", "King Kora") ni de statistique individuelle fictive. Si des joueurs officiels certifiés sont fournis dans la télémétrie, tu peux citer leur pseudo exact et leurs scores réels. Si aucun joueur n'est fourni, formule le visuel comme un défi communautaire ou une invitation ("Qui sera le 1er Maître du Kora ?", "Le Trône de Njambo Kora t'attend !", "Défie les champions").
- STATISTIQUES RÉELLES : si des données de télémétrie sont fournies, utilise des valeurs vérifiables ou reste qualitatif.
`.trim();
}

export interface VisualVariantResult extends ValidateSpecResult {
  angle?: string;
}

export interface VisualVariantsResponse {
  variants: VisualVariantResult[];
  /** Nombre d'appels Gemini réellement effectués (sert au compteur horaire). */
  callsMade: number;
  /** Vrai si l'échec vient d'un quota ou d'une limite de débit Gemini. */
  quotaExceeded: boolean;
  warnings: string[];
}

function resolveThinkingConfig(modelName: string): any {
  const m = modelName.toLowerCase();
  if (m.startsWith('gemini-3')) return { thinkingLevel: ThinkingLevel.LOW };
  if (m.startsWith('gemini-2.5')) return { thinkingBudget: 1024 };
  return undefined;
}

function parseVariants(rawText: string, context: Parameters<typeof validateAndRepairSpec>[1]): VisualVariantResult[] {
  const parsed = JSON.parse(rawText);
  const list: any[] = Array.isArray(parsed?.variants) ? parsed.variants : [];
  const out: VisualVariantResult[] = [];

  for (const raw of list.slice(0, VARIANTS_COUNT)) {
    if (!raw || typeof raw !== 'object') continue;
    const { angle, story, question, hashtags, ...specRaw } = raw;
    const result = validateAndRepairSpec({ ...specRaw, post: { story, question, hashtags } }, context);
    if (result.spec !== null) {
      out.push({ ...result, angle: typeof angle === 'string' ? angle : undefined });
    }
  }
  return out;
}

/**
 * Génère jusqu'à 3 variantes de visuel (avec leur texte de post) en UN SEUL appel Gemini, puis les valide.
 * Une seule relance au total, jamais après une erreur de quota ; un seul modèle de secours.
 */
export async function generateVisualVariants({
  brief,
  config,
  metricsSnapshot,
  moment,
}: {
  brief: string;
  config?: any;
  metricsSnapshot?: any;
  /** Vrai moment de jeu (anonyme) à illustrer : le code dessine le pli, l'IA n'écrit que les textes. */
  moment?: KoraMoment;
}): Promise<VisualVariantsResponse> {
  const ai = getGenAIClient();
  const systemPrompt = buildVisualSystemPrompt(isKoraCashEnabled(getEngineConfig()));
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
    const botKeywords = ['robam', 'hokuto', 'hokito', 'koubi doux', 'wizeman', 'thom', 'malo', 'efoulan', 'bozar', 'tchakap', 'mignon', 'vie2poulet', 'malox'];
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
    snapshotInfo += `\n\nCLASSEMENT OFFICIEL DES JOUEURS HUMAINS :\nAucun joueur humain actif enregistré dans le Palmarès actuel. INTERDICTION ABSOLUE D'INVENTER UN PSEUDO ! Utilise une formule de défi générique ("Qui sera le 1er Maître du Kora ?", "Le trône t'attend").`;
  }

  const situationInfo = moment
    ? `\n\nSITUATION RÉELLE À ILLUSTRER (anonyme, ne la modifie pas ; les cartes sont dessinées par le code : n'ajoute AUCUN bloc CARDS) : ${momentToBrief(moment)}`
    : '';
  const promptContents = `${brief}${snapshotInfo}${situationInfo}`;
  const validationContext = {
    snapshotStats: asksForStats ? metricsSnapshot?.summary : undefined,
    allowedPlayerNames: topHumanPlayers.map((p: { pseudo: string }) => p.pseudo.toLowerCase()),
  };

  let callsMade = 0;
  let quotaExceeded = false;
  let retried = false;
  const warnings: string[] = [];

  for (const modelName of candidateModels) {
    let prompt = promptContents;

    for (let attempt = 0; attempt < 2; attempt++) {
      if (callsMade >= MAX_GEMINI_CALLS_PER_VISUAL) break;
      callsMade++;

      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            systemInstruction: systemPrompt,
            temperature: attempt === 0 ? 0.9 : 0.6,
            topP: 0.95,
            maxOutputTokens: 3200,
            responseMimeType: 'application/json',
            responseSchema: VISUAL_VARIANTS_JSON_SCHEMA as any,
            thinkingConfig: resolveThinkingConfig(modelName),
          },
        });

        const rawText = response.text || '';
        const variants = rawText.trim() ? applyVariantChecks(parseVariants(rawText, validationContext)) : [];
        if (variants.length > 0) {
          // Cartes : le pli réel est dessiné par le code ; sinon on retire seulement les cartes en double.
          for (const variant of variants) {
            if (!variant.spec) continue;
            if (moment) {
              injectTrickBlock(variant.spec, moment);
            } else {
              const removed = removeDuplicateCards(variant.spec);
              if (removed.length > 0) {
                variant.warnings.push(`Carte(s) en double retirée(s) : ${removed.join(', ')}.`);
                variant.needsReview = true;
              }
            }
          }
          return { variants, callsMade, quotaExceeded: false, warnings };
        }
        warnings.push(`Aucune variante valide reçue de "${modelName}".`);
      } catch (err) {
        console.warn(`[AI Visual] Appel sur "${modelName}" échoué:`, err);
        if (isTransitoryError(err)) {
          // Quota, limite de débit ou panne passagère : aucune relance sur ce modèle, on passe au secours.
          const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
          quotaExceeded = /429|quota|resource_exhausted|resourceexhausted|rate limit/.test(message);
          break;
        }
      }

      // Réponse invalide : une seule relance au total, avec un rappel court (le prompt système porte déjà les règles).
      if (retried) break;
      retried = true;
      prompt = `${promptContents}\n\nRAPPEL : ta réponse précédente était invalide. Renvoie ${VARIANTS_COUNT} variantes valides, chacune avec au moins un bloc HOOK, des champs story et question, aucune carte interdite et aucun joueur inventé.`;
    }
  }

  warnings.push('La génération des variantes a échoué.');
  return { variants: [], callsMade, quotaExceeded, warnings };
}
