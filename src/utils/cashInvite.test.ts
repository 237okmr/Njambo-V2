import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCashInviteText,
  buildCashInviteUrl,
  buildCashInviteWhatsAppUrl,
  forgetCashInviteCode,
  normalizeCashInviteCode,
  readCashInviteCode,
  recallCashInviteCode,
  rememberCashInviteCode,
  stripCashInviteParam,
} from './cashInvite';

describe('invitation à une table Kora Cash', () => {
  it('ne reconnaît que les codes de 4 à 6 lettres ou chiffres, en majuscules', () => {
    assert.equal(normalizeCashInviteCode('fjw3'), 'FJW3');
    assert.equal(normalizeCashInviteCode(' ab-cd12 '), 'ABCD12');
    assert.equal(normalizeCashInviteCode('abc'), '');
    assert.equal(normalizeCashInviteCode('ABCDEFG'), '');
    assert.equal(normalizeCashInviteCode(undefined), '');
    assert.equal(normalizeCashInviteCode(42), '');
  });

  it('lit le code dans ?cash= et ignore ?join= (réservé aux tables gratuites)', () => {
    assert.equal(readCashInviteCode('?cash=fjw3'), 'FJW3');
    assert.equal(readCashInviteCode('?join=FJW3'), '');
    assert.equal(readCashInviteCode(''), '');
    assert.equal(readCashInviteCode('?cash=x'), '');
  });

  it('retire le paramètre sans toucher aux autres', () => {
    assert.equal(stripCashInviteParam('?cash=FJW3'), '');
    assert.equal(stripCashInviteParam('?cash=FJW3&utm=wa'), '?utm=wa');
    assert.equal(stripCashInviteParam('?utm=wa'), '?utm=wa');
  });

  it('fabrique un lien dans le scope /game/ qui ne porte que le code', () => {
    const url = buildCashInviteUrl('https://njambo-kora.ai.studio/game/', 'fjw3');
    assert.equal(url, 'https://njambo-kora.ai.studio/game/?cash=FJW3');
    assert.ok(!url.includes('join='));
    assert.ok(!url.includes('from='));
    assert.equal(buildCashInviteUrl('https://x/game/', 'zz'), 'https://x/game/');
  });

  it('écrit le message en FCFA, avec le rappel argent réel et 18 ans, sans jetons', () => {
    const text = buildCashInviteText({ code: 'FJW3', bet: 500, rakePercent: 4 });
    assert.ok(text.includes('500'));
    assert.ok(text.includes('FCFA'));
    assert.ok(text.includes('4 %'));
    assert.ok(text.includes('18 ans'));
    assert.ok(text.includes('FJW3'));
    assert.ok(!text.includes('jeton'));
    assert.ok(!text.includes('🪙'));
  });

  it('place le lien dans le message WhatsApp', () => {
    const url = 'https://njambo-kora.ai.studio/game/?cash=FJW3';
    const wa = buildCashInviteWhatsAppUrl({ code: 'FJW3', bet: 500, rakePercent: 4, url });
    assert.ok(wa.startsWith('https://wa.me/?text='));
    assert.ok(decodeURIComponent(wa).includes(url));
  });

  it('ne plante pas quand le stockage de la page est indisponible', () => {
    assert.doesNotThrow(() => rememberCashInviteCode('FJW3'));
    assert.equal(recallCashInviteCode(), '');
    assert.doesNotThrow(() => forgetCashInviteCode());
  });
});
