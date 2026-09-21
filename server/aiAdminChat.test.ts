import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ThinkingLevel } from '@google/genai';
import {
  computeMaxOutputTokens,
  getCandidateModels,
  isTransitoryError,
  resolveGenerationParameters,
  detectIntents,
  buildSystemInstruction,
  buildContents,
} from './aiAdminChat.js';

describe('aiAdminChat - computeMaxOutputTokens', () => {
  it('calcule la valeur de base par défaut (1200 tokens pour balanced standard)', () => {
    const tokens = computeMaxOutputTokens({}, 'balanced');
    assert.equal(tokens, 1200);
  });

  it('applique le plafond d’audit global ou anomalies (1800 de base)', () => {
    const tokensAudit = computeMaxOutputTokens({ isGlobalAudit: true }, 'balanced');
    assert.equal(tokensAudit, 1800);

    const tokensAnomalies = computeMaxOutputTokens({ wantsAnomalies: true }, 'balanced');
    assert.equal(tokensAnomalies, 1800);
  });

  it('applique le plafond visuel social (2400 de base)', () => {
    const tokensSocial = computeMaxOutputTokens({ wantsSocial: true }, 'balanced');
    assert.equal(tokensSocial, 2400);
  });

  it('ajuste selon le ton (+600 pour detailed, -300 pour concise)', () => {
    // Standard
    assert.equal(computeMaxOutputTokens({}, 'detailed'), 1800); // 1200 + 600
    assert.equal(computeMaxOutputTokens({}, 'concise'), 900); // 1200 - 300

    // Global audit
    assert.equal(computeMaxOutputTokens({ isGlobalAudit: true }, 'detailed'), 2400); // 1800 + 600
    assert.equal(computeMaxOutputTokens({ isGlobalAudit: true }, 'concise'), 1500); // 1800 - 300

    // Social
    assert.equal(computeMaxOutputTokens({ wantsSocial: true }, 'detailed'), 3000); // 2400 + 600
    assert.equal(computeMaxOutputTokens({ wantsSocial: true }, 'concise'), 2100); // 2400 - 300
  });

  it('respecte le plancher absolu de 900 tokens', () => {
    const tokens = computeMaxOutputTokens({}, 'concise');
    assert.ok(tokens >= 900);
  });
});

describe('aiAdminChat - getCandidateModels', () => {
  it('renvoie au plus 2 modèles distincts par défaut (gemini-3.8-flash et gemini-3.1-flash-lite)', () => {
    const prevEnv = process.env.GEMINI_MODEL;
    delete process.env.GEMINI_MODEL;

    const candidates = getCandidateModels();
    assert.deepEqual(candidates, ['gemini-3.8-flash', 'gemini-3.1-flash-lite']);

    if (prevEnv) process.env.GEMINI_MODEL = prevEnv;
  });

  it('place le modèle demandé en premier suivi du secours gemini-3.1-flash-lite', () => {
    const candidates = getCandidateModels('gemini-2.5-pro');
    assert.deepEqual(candidates, ['gemini-2.5-pro', 'gemini-3.1-flash-lite']);
  });

  it('ne renvoie qu’un seul modèle si le modèle demandé est déjà gemini-3.1-flash-lite', () => {
    const candidates = getCandidateModels('gemini-3.1-flash-lite');
    assert.deepEqual(candidates, ['gemini-3.1-flash-lite']);
  });

  it('ne contient jamais les modèles obsolètes gemini-flash-latest ou gemini-pro-latest', () => {
    const candidates = getCandidateModels();
    assert.ok(!candidates.includes('gemini-flash-latest'));
    assert.ok(!candidates.includes('gemini-pro-latest'));
  });
});

describe('aiAdminChat - resolveGenerationParameters', () => {
  it('configure thinkingLevel.LOW pour les modèles gemini-3', () => {
    const intents = detectIntents('Analyse les parties');
    const params = resolveGenerationParameters('Analyse les parties', intents, {}, 'gemini-3.8-flash');
    assert.deepEqual(params.thinkingConfig, { thinkingLevel: ThinkingLevel.LOW });
  });

  it('configure thinkingBudget: 1024 pour les modèles gemini-2.5', () => {
    const intents = detectIntents('Analyse les parties');
    const params = resolveGenerationParameters('Analyse les parties', intents, {}, 'gemini-2.5-pro');
    assert.deepEqual(params.thinkingConfig, { thinkingBudget: 1024 });
  });

  it('ne met aucun thinkingConfig pour les autres modèles', () => {
    const intents = detectIntents('Analyse les parties');
    const params = resolveGenerationParameters('Analyse les parties', intents, {}, 'custom-model');
    assert.equal(params.thinkingConfig, undefined);
  });
});

describe('aiAdminChat - isTransitoryError', () => {
  it('identifie correctement les erreurs transitoires (429, 500, 503, timeout, réseau)', () => {
    assert.equal(isTransitoryError(new Error('HTTP 429 Too Many Requests')), true);
    assert.equal(isTransitoryError(new Error('503 Service Unavailable')), true);
    assert.equal(isTransitoryError(new Error('500 Internal Server Error')), true);
    assert.equal(isTransitoryError(new Error('Connection timeout')), true);
    assert.equal(isTransitoryError(new Error('fetch failed')), true);
    assert.equal(isTransitoryError(new Error('ResourceExhausted: Quota exceeded')), true);
  });

  it('rejette les erreurs non-transitoires (400, 404, invalid_argument, unauthenticated)', () => {
    assert.equal(isTransitoryError(new Error('HTTP 400 Bad Request')), false);
    assert.equal(isTransitoryError(new Error('404 Not Found')), false);
    assert.equal(isTransitoryError(new Error('Invalid_argument: model unknown')), false);
    assert.equal(isTransitoryError(new Error('Permission_denied: API key invalid')), false);
  });
});

describe('aiAdminChat - detectIntents', () => {
  it('« ok » → aucun module activé', () => {
    const intents = detectIntents('ok');
    assert.equal(intents.isGlobalAudit, false);
    assert.equal(intents.wantsMatches, false);
    assert.equal(intents.wantsLogs, false);
    assert.equal(intents.wantsPlayers, false);
    assert.equal(intents.wantsRooms, false);
    assert.equal(intents.wantsConfig, false);
    assert.equal(intents.wantsSocial, false);
    assert.equal(intents.wantsAnomalies, false);
    assert.equal(intents.wantsAudience, false);
    assert.equal(intents.wantsTrends, false);
    assert.equal(intents.wantsBehavior, false);
  });

  it('« quel est le taux de rétention J+7 ? » → wantsAudience', () => {
    const intents = detectIntents('quel est le taux de rétention J+7 ?');
    assert.equal(intents.wantsAudience, true);
    assert.equal(intents.wantsMatches, false);
    assert.equal(intents.isGlobalAudit, false);
  });

  it('« détaille » après « rétention J+7 » → wantsAudience par mémoire de sujet', () => {
    const intents = detectIntents('détaille', 'quel est le taux de rétention J+7 ?');
    assert.equal(intents.wantsAudience, true);
  });

  it('« bilan global » → isGlobalAudit', () => {
    const intents = detectIntents('bilan global');
    assert.equal(intents.isGlobalAudit, true);
  });

  it('« combien de joueurs bannis ? » → wantsPlayers sans wantsMatches', () => {
    const intents = detectIntents('combien de joueurs bannis ?');
    assert.equal(intents.wantsPlayers, true);
    assert.equal(intents.wantsMatches, false);
  });

  it('« quels sont les bugs signalés par les testeurs ? » → wantsBacklog', () => {
    const intents = detectIntents('quels sont les bugs signalés par les testeurs ?');
    assert.equal(intents.wantsBacklog, true);
    assert.equal(intents.wantsMatches, false);
  });

  it('« roadmap et priorités » → wantsBacklog', () => {
    const intents = detectIntents('roadmap et priorités');
    assert.equal(intents.wantsBacklog, true);
  });

  it('« détaille » après « bugs testeurs » → wantsBacklog par mémoire de sujet', () => {
    const intents = detectIntents('détaille', 'quels sont les bugs testeurs ?');
    assert.equal(intents.wantsBacklog, true);
  });

  it('« quel modèle de rake ? » → wantsMonetization', () => {
    const intents = detectIntents('quel modèle de rake ?');
    assert.equal(intents.wantsMonetization, true);
    assert.equal(intents.wantsManagement, false);
    assert.equal(intents.wantsMatches, false);
    assert.equal(intents.wantsPlayers, false);
    assert.equal(intents.wantsRooms, false);
    assert.equal(intents.wantsConfig, false);
  });

  it('« mes priorités de la semaine » → wantsManagement', () => {
    const intents = detectIntents('mes priorités de la semaine');
    assert.equal(intents.wantsManagement, true);
    assert.equal(intents.wantsMonetization, false);
    assert.equal(intents.wantsMatches, false);
    assert.equal(intents.wantsPlayers, false);
    assert.equal(intents.wantsRooms, false);
    assert.equal(intents.wantsConfig, false);
  });

  it('« bilan global » → aucun des deux (wantsMonetization = false, wantsManagement = false)', () => {
    const intents = detectIntents('bilan global');
    assert.equal(intents.isGlobalAudit, true);
    assert.equal(intents.wantsMonetization, false);
    assert.equal(intents.wantsManagement, false);
  });

  it('« détaille » après « quel modèle de rake ? » → wantsMonetization par mémoire de sujet', () => {
    const intents = detectIntents('détaille', 'quel modèle de rake ?');
    assert.equal(intents.wantsMonetization, true);
  });

  it('« détaille » après « mes priorités de la semaine » → wantsManagement par mémoire de sujet', () => {
    const intents = detectIntents('détaille', 'mes priorités de la semaine');
    assert.equal(intents.wantsManagement, true);
  });
});

describe('aiAdminChat - buildSystemInstruction', () => {
  it('contient les marqueurs des règles conservées et exclut le plafond "1 000"', () => {
    const instruction = buildSystemInstruction({}, 'Bonjour', undefined);

    // Vérification des marqueurs obligatoires
    assert.ok(
      instruction.toLowerCase().includes('lecture seule'),
      'Doit mentionner la lecture seule'
    );
    assert.ok(
      instruction.includes('#m_'),
      'Doit mentionner les identifiants réels sources (#m_)'
    );
    assert.ok(
      instruction.includes('#note_'),
      'Doit mentionner les identifiants réels sources de carnet (#note_)'
    );
    assert.ok(
      instruction.includes("tu n'écris jamais dans le carnet"),
      'Doit mentionner la règle sur le carnet'
    );
    assert.ok(
      instruction.includes('UTM'),
      'Doit mentionner les paramètres UTM'
    );
    assert.ok(
      instruction.includes('31 cartes'),
      'Doit mentionner la règle des 31 cartes'
    );
    assert.ok(
      instruction.includes('Africa/Douala'),
      'Doit mentionner le fuseau horaire Africa/Douala pour la date'
    );
    assert.ok(
      instruction.includes('Palmarès (Score de Maîtrise)'),
      'Doit mentionner le classement Palmarès (Score de Maîtrise)'
    );
    assert.ok(
      instruction.includes('4 volets'),
      'Doit mentionner les 4 volets'
    );
    assert.ok(
      instruction.includes('Jetons virtuels d\'amusement — Aucune valeur monétaire réelle'),
      'Doit inclure la mention légale sur les jetons'
    );

    // Vérification de l'absence du plafond "1 000" ou "5 000"
    assert.ok(
      !instruction.includes('1 000'),
      'Ne doit plus contenir le plafond numérique de 1 000 jetons'
    );
    assert.ok(
      !instruction.includes('5 000'),
      'Ne doit plus contenir le plafond numérique de 5 000 jetons'
    );
  });

  it('injecte le module CARNET DE BORD uniquement si wantsBacklog est actif', () => {
    const mockSnapshot = {
      adminNotes: {
        openCount: 2,
        countsByType: { BUG: 1, FEEDBACK: 1 },
        items: [
          {
            id: 'n1',
            type: 'BUG',
            priority: 'P1',
            status: 'OUVERT',
            title: 'Timer bloqué en arrière-plan',
            source: 'Christian (Android)',
          },
          {
            id: 'n2',
            type: 'FEEDBACK',
            priority: 'P2',
            status: 'EN_COURS',
            title: 'Bouton Kora trop petit sur écran 5 pouces',
          },
        ],
      },
    };

    const instructionWithBacklog = buildSystemInstruction(
      {},
      'Quels sont les bugs dans le backlog ?',
      mockSnapshot
    );
    assert.ok(
      instructionWithBacklog.includes('### 📝 CARNET DE BORD ET BACKLOG'),
      'Doit inclure la section CARNET DE BORD'
    );
    assert.ok(
      instructionWithBacklog.includes('#note_n1|BUG|P1|OUVERT|Timer bloqué en arrière-plan|Christian (Android)'),
      'Doit formater la note au format compact'
    );
    assert.ok(
      instructionWithBacklog.includes('#note_n2|FEEDBACK|P2|EN_COURS|Bouton Kora trop petit sur écran 5 pouces'),
      'Doit formater la deuxième note'
    );

    const instructionWithoutBacklog = buildSystemInstruction(
      {},
      'Quel est le taux de Kora ?',
      mockSnapshot
    );
    assert.ok(
      !instructionWithoutBacklog.includes('### 📝 CARNET DE BORD ET BACKLOG'),
      'Ne doit pas inclure la section CARNET DE BORD si l intention backlog n est pas demandée'
    );
  });

  it('injecte le bloc MONÉTISATION uniquement si wantsMonetization est actif', () => {
    const instructionWithMonetization = buildSystemInstruction(
      {},
      'Quel modèle de rake mettre en place ?',
      undefined
    );
    assert.ok(
      instructionWithMonetization.includes('CADRE STRATÉGIQUE MONÉTISATION & JURIDIQUE :'),
      'Doit inclure le cadre monétisation'
    );
    assert.ok(
      instructionWithMonetization.includes('Jetons virtuels uniquement'),
      'Doit rappeler l état actuel en jetons virtuels'
    );
    assert.ok(
      instructionWithMonetization.includes('taux de rake × pot moyen × parties par jour'),
      'Doit inclure la formule indicative avec mention hypothèse'
    );
    assert.ok(
      instructionWithMonetization.includes('faire valider par un juriste'),
      'Doit mentionner la validation juridique'
    );

    const instructionWithoutMonetization = buildSystemInstruction(
      {},
      'Quel est le top 3 des joueurs ?',
      undefined
    );
    assert.ok(
      !instructionWithoutMonetization.includes('CADRE STRATÉGIQUE MONÉTISATION & JURIDIQUE :'),
      'Ne doit pas inclure le cadre monétisation quand non demandé'
    );
  });

  it('injecte le bloc PILOTAGE uniquement si wantsManagement est actif', () => {
    const instructionWithManagement = buildSystemInstruction(
      {},
      'Quelles sont mes priorités pour cette semaine ?',
      undefined
    );
    assert.ok(
      instructionWithManagement.includes('CADRE DE PILOTAGE DU PROJET & MANAGEMENT :'),
      'Doit inclure le cadre de pilotage'
    );
    assert.ok(
      instructionWithManagement.includes('3 priorités maximum, horizon 7 jours'),
      'Doit cadrer à 3 priorités et 7 jours'
    );
    assert.ok(
      instructionWithManagement.includes('notes du carnet (#note_)'),
      'Doit mentionner l ancrage sur les notes du carnet'
    );
    assert.ok(
      instructionWithManagement.includes('accès en lecture seule d\'abord'),
      'Doit mentionner l accès en lecture seule pour la future équipe'
    );

    const instructionWithoutManagement = buildSystemInstruction(
      {},
      'Combien de parties aujourd hui ?',
      undefined
    );
    assert.ok(
      !instructionWithoutManagement.includes('CADRE DE PILOTAGE DU PROJET & MANAGEMENT :'),
      'Ne doit pas inclure le cadre de pilotage quand non demandé'
    );
  });

  it('ajoute la ligne des sujets récents si recentTopics est fourni', () => {
    const instructionWithTopics = buildSystemInstruction(
      {},
      'développe le point 2',
      undefined,
      undefined,
      ['Taux de rétention', 'Abandons après Kora']
    );
    assert.ok(
      instructionWithTopics.includes("Sujets récents de l'admin : Taux de rétention | Abandons après Kora"),
      'Doit inclure la ligne des sujets récents séparés par un pipe'
    );

    const instructionWithoutTopics = buildSystemInstruction(
      {},
      'développe le point 2',
      undefined,
      undefined,
      []
    );
    assert.ok(
      !instructionWithoutTopics.includes("Sujets récents de l'admin :"),
      'Ne doit pas inclure la ligne si recentTopics est vide'
    );
  });

  it('limite recentTopics à 2 éléments et 120 caractères par élément', () => {
    const longTopic = 'A'.repeat(200);
    const instruction = buildSystemInstruction(
      {},
      'développe',
      undefined,
      undefined,
      ['Topic 1', longTopic, 'Topic 3']
    );
    assert.ok(
      instruction.includes(`Sujets récents de l'admin : Topic 1 | ${'A'.repeat(120)}`),
      'Doit tronquer à 120 caractères et ignorer le 3ème élément'
    );
    assert.ok(!instruction.includes('Topic 3'), 'Ne doit pas inclure le 3ème élément');
  });
});

describe('aiAdminChat - buildContents', () => {
  it('construit un seul tour user si l’historique est vide', () => {
    const contents = buildContents('Quelle est la santé du jeu ?');
    assert.equal(contents.length, 1);
    assert.equal(contents[0].role, 'user');
    assert.equal(contents[0].parts[0].text, 'Quelle est la santé du jeu ?');
  });

  it('conserve au plus le dernier échange complet [user, model] suivi du message courant', () => {
    const history: Array<{ role: 'user' | 'model'; text: string }> = [
      { role: 'user', text: 'Question 1' },
      { role: 'model', text: 'Réponse 1' },
      { role: 'user', text: 'Question 2' },
      { role: 'model', text: 'Réponse 2 avec 3 points' },
    ];
    const contents = buildContents('développe le point 2', undefined, history);
    assert.equal(contents.length, 3);
    assert.equal(contents[0].role, 'user');
    assert.equal(contents[0].parts[0].text, 'Question 2');
    assert.equal(contents[1].role, 'model');
    assert.equal(contents[1].parts[0].text, 'Réponse 2 avec 3 points');
    assert.equal(contents[2].role, 'user');
    assert.equal(contents[2].parts[0].text, 'développe le point 2');
  });

  it('ignore un message model placé en tête d’historique', () => {
    const history: Array<{ role: 'user' | 'model'; text: string }> = [
      { role: 'model', text: 'Réponse orpheline en tête' },
    ];
    const contents = buildContents('Bonjour', undefined, history);
    assert.equal(contents.length, 1);
    assert.equal(contents[0].role, 'user');
    assert.equal(contents[0].parts[0].text, 'Bonjour');
  });

  it('tronque les réponses d’historique à 1200 caractères et nettoie JSON / tableaux', () => {
    const longText = 'B'.repeat(1500);
    const history: Array<{ role: 'user' | 'model'; text: string }> = [
      { role: 'user', text: 'Donne-moi les stats' },
      { role: 'model', text: `Voici :\n\`\`\`json\n{"a":1}\n\`\`\`\n| A | B |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n| 7 | 8 |\n${longText}` },
    ];
    const contents = buildContents('détaille', undefined, history);
    assert.equal(contents.length, 3);
    const cleanedModelText = contents[1].parts[0].text || '';
    assert.ok(cleanedModelText.includes('[Visuel JSON généré au tour précédent]'));
    assert.ok(cleanedModelText.includes('[Données tabulaires du tour précédent]'));
    assert.ok(cleanedModelText.length <= 1203);
  });
});

describe.skip('aiAdminChat - socialGeneratorBlock', () => {
  it('contient les interdits obligatoires et respecte le plafond de 700 tokens estimés', () => {
    const instruction = buildSystemInstruction({}, 'Crée un visuel social', undefined);
    assert.ok(
      instruction.includes('GÉNÉRATEUR DE VISUELS & AFFICHES POUR RÉSEAUX SOCIAUX'),
      'Doit inclure le bloc socialGeneratorBlock'
    );

    // Extraction du bloc socialGeneratorBlock
    const blockMatch = instruction.match(/GÉNÉRATEUR DE VISUELS[\s\S]*?\}\n/);
    assert.ok(blockMatch, 'Le bloc socialGeneratorBlock doit être présent');
    const blockText = blockMatch[0];

    // Vérification de la taille (≤ 700 tokens estimés : caractères ÷ 3.4)
    const estimatedTokens = Math.ceil(blockText.length / 3.4);
    assert.ok(
      estimatedTokens <= 700,
      `La taille du bloc (${estimatedTokens} tokens) dépasse le plafond de 700 tokens`
    );

    // Vérification des interdits
    const interdits = [
      'gratuit',
      'bêta',
      'premier jeu camerounais',
      'Promesse de gains',
      'As',
      'figures',
      'atout',
      'définition fausse du Kora',
      '5e pli gagné avec un 3',
      'Citation ou témoignage inventé attribué à une personne réelle',
      'ethnie',
      'région',
      'religion',
      'politique',
      'Chiffres non présents dans les données',
    ];

    for (const interdit of interdits) {
      assert.ok(
        blockText.toLowerCase().includes(interdit.toLowerCase()),
        `Le bloc socialGeneratorBlock doit mentionner l'interdit : "${interdit}"`
      );
    }

    // Vérification des contraintes de contenu et des nouveaux champs
    assert.ok(blockText.includes('headline ≤ 8 mots'));
    assert.ok(blockText.includes('mainText ≤ 22 mots'));
    assert.ok(blockText.includes('ctaText ≤ 5 mots'));
    assert.ok(blockText.includes('ctaLibrary'));
    assert.ok(blockText.includes('MEME_OR_PUNCHLINE'));
    assert.ok(blockText.includes('BEFORE_AFTER'));
    assert.ok(blockText.includes('CROSS_PROMO_RULES'));
    assert.ok(blockText.includes('whatsAppMessage'));
    assert.ok(blockText.includes('whatsAppStatus'));
    assert.ok(blockText.includes('FACEBOOK'));
  });
});


