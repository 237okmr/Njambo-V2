import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  LOCAL_QUESTIONS,
  LOCAL_STORIES,
  classifyQuestion,
  detectStoryTag,
  pickLocalPost,
} from './hokutoBank';
import { KeyValueStorage, buildQuestionHint, getRecentQuestionTypes, recordPostQuestion, recordQuestionType, withQuestionHint } from './postHistory';

const wordCount = (text: string) => text.trim().split(/\s+/).length;

describe('hokutoBank - banque locale d\'histoires et de questions', () => {
  it('respecte les limites : histoires de 40 mots maximum, questions de 12 mots maximum', () => {
    for (const stories of Object.values(LOCAL_STORIES)) {
      for (const story of stories) assert.ok(wordCount(story) <= 40, story);
    }
    for (const questions of Object.values(LOCAL_QUESTIONS)) {
      for (const question of questions) assert.ok(wordCount(question) <= 12, question);
    }
  });

  it('respecte les règles de voix : pas de revendication, pas de gain, pas d\'argent réel', () => {
    const all = [...Object.values(LOCAL_STORIES).flat(), ...Object.values(LOCAL_QUESTIONS).flat()].join(' ').toLowerCase();
    for (const forbidden of ['premier jeu', 'gratuit', 'argent', 'gagner de', 'cfa', 'gain', 'bamileke', 'politique']) {
      assert.strictEqual(all.includes(forbidden), false, forbidden);
    }
  });

  it('reconnaît le thème d\'un visuel', () => {
    assert.strictEqual(detectStoryTag('Le Kora du dimanche'), 'KORA');
    assert.strictEqual(detectStoryTag('Quitter la table en pleine partie'), 'RAGE_QUIT');
    assert.strictEqual(detectStoryTag('Bienvenue aux nouveaux joueurs'), 'DEBUTANT');
    assert.strictEqual(detectStoryTag('Merci pour vos retours'), 'COMMUNAUTE');
  });

  it('classe les types de question', () => {
    assert.strictEqual(classifyQuestion('Tag le pote qui bluffe !'), 'TAG');
    assert.strictEqual(classifyQuestion('Cap ou pas cap de gagner ?'), 'DEFI');
    assert.strictEqual(classifyQuestion('Team bluff ou team prudence ?'), 'VOTE');
    assert.strictEqual(classifyQuestion('Tu aurais joué quoi ?'), 'PRONOSTIC');
  });

  it('écarte les types de question récents tant qu\'il en reste d\'autres', () => {
    const post = pickLocalPost('Le Kora du dimanche', 'seed', ['PRONOSTIC', 'VOTE', 'DEFI']);
    assert.strictEqual(post.questionType, 'TAG');
    const again = pickLocalPost('Le Kora du dimanche', 'seed', ['PRONOSTIC', 'VOTE', 'DEFI', 'TAG']);
    assert.ok(['PRONOSTIC', 'VOTE', 'DEFI', 'TAG'].includes(again.questionType));
  });

  it('le choix est stable pour un même visuel', () => {
    assert.deepStrictEqual(pickLocalPost('Bluff à la table', 'x'), pickLocalPost('Bluff à la table', 'x'));
  });
});

describe('postHistory - varier le type de question d\'un post à l\'autre', () => {
  const makeStorage = (): KeyValueStorage => {
    const data = new Map<string, string>();
    return {
      getItem: (k) => (data.has(k) ? data.get(k)! : null),
      setItem: (k, v) => void data.set(k, v),
    };
  };

  it('garde les 3 derniers types, le plus récent en premier', () => {
    const storage = makeStorage();
    ['Tag le pote qui bluffe !', 'Team bluff ou team prudence ?', 'Cap ou pas cap ?', 'Tu aurais joué quoi ?'].forEach((q) =>
      recordPostQuestion(q, storage)
    );
    assert.deepStrictEqual(getRecentQuestionTypes(storage), ['PRONOSTIC', 'DEFI', 'VOTE']);
  });

  it('ajoute une phrase d\'évitement au brief seulement quand il y a un historique', () => {
    const storage = makeStorage();
    assert.strictEqual(withQuestionHint('Fais un visuel', storage), 'Fais un visuel');
    recordPostQuestion('Tag le pote qui bluffe !', storage);
    const hinted = withQuestionHint('Fais un visuel', storage);
    assert.ok(hinted.startsWith('Fais un visuel'));
    assert.ok(hinted.includes('tag un pote'));
    assert.ok(buildQuestionHint([]) === '');
  });

  it('ignore une question vide et ne casse pas sans stockage', () => {
    const storage = makeStorage();
    recordPostQuestion('   ', storage);
    recordPostQuestion(undefined, storage);
    assert.deepStrictEqual(getRecentQuestionTypes(storage), []);
    assert.deepStrictEqual(getRecentQuestionTypes(null), []);
    recordQuestionType('TAG', null);
  });
});
