/**
 * Tests des règles pures du dépôt Campay : numéro, statuts, montants, signature du webhook, décision de crédit.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  normalizeCameroonPhone,
  mapCampayStatus,
  parseCampayAmount,
  isValidCampayReference,
  verifyCampayWebhookSignature,
  extractWebhookEvent,
  verifyWebhookEvent,
  decideFromCampayReading,
} from './campayRules';
import { newDepositId } from './depositRules';

const KEY = 'cle-de-webhook-de-test';
const NOW = 1_800_000_000_000;

function b64url(value: unknown): string {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}

function sign(payload: Record<string, unknown>, key = KEY, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }): string {
  const h = b64url(header);
  const p = b64url(payload);
  const s = createHmac('sha256', key).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}

describe('Campay — numéro de téléphone', () => {
  it('normalise les formes courantes vers 237 + 9 chiffres', () => {
    assert.deepEqual(normalizeCameroonPhone('677123456'), { ok: true, phone: '237677123456' });
    assert.deepEqual(normalizeCameroonPhone('237677123456'), { ok: true, phone: '237677123456' });
    assert.deepEqual(normalizeCameroonPhone('+237 677 12 34 56'), { ok: true, phone: '237677123456' });
    assert.deepEqual(normalizeCameroonPhone('00237-677-123-456'), { ok: true, phone: '237677123456' });
    assert.deepEqual(normalizeCameroonPhone('(237) 655.123.456'), { ok: true, phone: '237655123456' });
  });

  it('refuse vide, lettres, trop court, trop long, fixe et autre pays', () => {
    assert.equal(normalizeCameroonPhone('').ok, false);
    assert.equal(normalizeCameroonPhone(undefined).ok, false);
    assert.equal(normalizeCameroonPhone('abc').ok, false);
    assert.equal(normalizeCameroonPhone('67712345').ok, false);
    assert.equal(normalizeCameroonPhone('6771234567').ok, false);
    assert.equal(normalizeCameroonPhone('222123456').ok, false);
    assert.equal(normalizeCameroonPhone('33612345678').ok, false);
  });
});

describe('Campay — statuts, montants, références', () => {
  it('seul SUCCESSFUL donne un succès, seul FAILED un échec, tout le reste attend', () => {
    assert.equal(mapCampayStatus('SUCCESSFUL'), 'SUCCESS');
    assert.equal(mapCampayStatus(' successful '), 'SUCCESS');
    assert.equal(mapCampayStatus('FAILED'), 'FAILED');
    assert.equal(mapCampayStatus('PENDING'), 'PENDING');
    assert.equal(mapCampayStatus('SUCCESS'), 'PENDING');
    assert.equal(mapCampayStatus(''), 'PENDING');
    assert.equal(mapCampayStatus(undefined), 'PENDING');
    assert.equal(mapCampayStatus(42), 'PENDING');
  });

  it('lit un montant entier, texte ou nombre, et refuse le reste', () => {
    assert.equal(parseCampayAmount(1000), 1000);
    assert.equal(parseCampayAmount('1000'), 1000);
    assert.equal(parseCampayAmount('1000.00'), 1000);
    assert.equal(parseCampayAmount(' 500 '), 500);
    assert.equal(parseCampayAmount('1000.50'), null);
    assert.equal(parseCampayAmount(1000.5), null);
    assert.equal(parseCampayAmount('0'), null);
    assert.equal(parseCampayAmount('-100'), null);
    assert.equal(parseCampayAmount('1e3'), null);
    assert.equal(parseCampayAmount(null), null);
  });

  it('reconnaît une référence de transaction bien formée', () => {
    assert.equal(isValidCampayReference('7c1e2f4a-9b3d-4c55-8a10-0f6d2e1b9a77'), true);
    assert.equal(isValidCampayReference('abc'), false);
    assert.equal(isValidCampayReference('../etc/passwd'), false);
    assert.equal(isValidCampayReference(12345678), false);
  });
});

describe('Campay — signature du webhook (JWT HS256)', () => {
  it('accepte une signature valide', () => {
    const token = sign({ reference: 'ref-123456', exp: NOW / 1000 + 600 });
    const r = verifyCampayWebhookSignature(token, KEY, NOW);
    assert.equal(r.valid, true);
    assert.equal(r.payload?.reference, 'ref-123456');
  });

  it('refuse une mauvaise clé, un jeton modifié et un jeton absent', () => {
    const token = sign({ reference: 'ref-123456' });
    assert.equal(verifyCampayWebhookSignature(token, 'autre-cle', NOW).reason, 'BAD_SIGNATURE');
    const [h, , s] = token.split('.');
    const forged = `${h}.${b64url({ reference: 'ref-999999' })}.${s}`;
    assert.equal(verifyCampayWebhookSignature(forged, KEY, NOW).reason, 'BAD_SIGNATURE');
    assert.equal(verifyCampayWebhookSignature(undefined, KEY, NOW).reason, 'MISSING');
    assert.equal(verifyCampayWebhookSignature('', KEY, NOW).reason, 'MISSING');
    assert.equal(verifyCampayWebhookSignature(token, '', NOW).reason, 'MISSING');
  });

  it('refuse alg none, un autre algorithme et un jeton mal formé', () => {
    const none = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ reference: 'ref-123456' })}.`;
    assert.equal(verifyCampayWebhookSignature(none, KEY, NOW).valid, false);
    const hs512 = sign({ reference: 'ref-123456' }, KEY, { alg: 'HS512', typ: 'JWT' });
    assert.equal(verifyCampayWebhookSignature(hs512, KEY, NOW).reason, 'ALG_REFUSED');
    assert.equal(verifyCampayWebhookSignature('a.b', KEY, NOW).reason, 'MALFORMED');
    assert.equal(verifyCampayWebhookSignature('a.b.c.d', KEY, NOW).reason, 'MALFORMED');
    assert.equal(verifyCampayWebhookSignature('???.???.???', KEY, NOW).reason, 'MALFORMED');
  });

  it('refuse un jeton expiré ou pas encore valide', () => {
    assert.equal(verifyCampayWebhookSignature(sign({ exp: NOW / 1000 - 1 }), KEY, NOW).reason, 'EXPIRED');
    assert.equal(verifyCampayWebhookSignature(sign({ nbf: NOW / 1000 + 60 }), KEY, NOW).reason, 'NOT_YET_VALID');
  });
});

describe('Campay — lecture et vérification de l\'événement', () => {
  const depositId = newDepositId();
  const reference = '7c1e2f4a-9b3d-4c55-8a10-0f6d2e1b9a77';

  it('lit les paramètres d\'URL et le corps JSON, le corps l\'emportant', () => {
    const fromQuery = extractWebhookEvent({ reference, external_reference: depositId, signature: 'sig', status: 'SUCCESSFUL' }, undefined);
    assert.deepEqual(fromQuery, { reference, externalReference: depositId, signature: 'sig' });
    const fromBody = extractWebhookEvent({ reference: 'ancienne-ref' }, { reference, external_reference: depositId, signature: 'sig2' });
    assert.deepEqual(fromBody, { reference, externalReference: depositId, signature: 'sig2' });
    assert.deepEqual(extractWebhookEvent(undefined, null), { reference: undefined, externalReference: undefined, signature: undefined });
  });

  it('valide un événement signé pour un dépôt connu', () => {
    const signature = sign({ reference, exp: NOW / 1000 + 600 });
    const v = verifyWebhookEvent({ reference, externalReference: depositId, signature }, KEY, NOW);
    assert.deepEqual(v, { ok: true, reference, depositId });
  });

  it('refuse identifiants mal formés, signature fausse et référence du jeton différente', () => {
    const signature = sign({ reference });
    assert.equal(verifyWebhookEvent({ reference: 'x', externalReference: depositId, signature }, KEY, NOW).reason, 'BAD_REFERENCE');
    assert.equal(verifyWebhookEvent({ reference, externalReference: 'dep_court', signature }, KEY, NOW).reason, 'BAD_DEPOSIT_ID');
    assert.equal(verifyWebhookEvent({ reference, externalReference: depositId, signature: 'a.b.c' }, KEY, NOW).reason, 'MALFORMED');
    assert.equal(verifyWebhookEvent({ reference, externalReference: depositId, signature }, 'autre-cle', NOW).reason, 'BAD_SIGNATURE');
    const other = sign({ reference: 'une-autre-reference' });
    assert.equal(verifyWebhookEvent({ reference, externalReference: depositId, signature: other }, KEY, NOW).reason, 'REFERENCE_MISMATCH');
  });
});

describe('Campay — décision après relecture du statut', () => {
  const deposit = { id: newDepositId(), amount: 1000, campayReference: '7c1e2f4a-9b3d-4c55-8a10-0f6d2e1b9a77' };

  it('crédite seulement un paiement réussi pour le bon montant', () => {
    assert.deepEqual(decideFromCampayReading(deposit, { status: 'SUCCESSFUL', amount: '1000.00' }), { decision: 'CREDIT' });
    assert.deepEqual(
      decideFromCampayReading(deposit, { status: 'SUCCESSFUL', amount: 1000, reference: deposit.campayReference, externalReference: deposit.id }),
      { decision: 'CREDIT' },
    );
  });

  it('refuse de créditer si le montant diffère, manque ou est décimal', () => {
    assert.deepEqual(decideFromCampayReading(deposit, { status: 'SUCCESSFUL', amount: '999' }), { decision: 'REJECT', reason: 'AMOUNT_MISMATCH' });
    assert.deepEqual(decideFromCampayReading(deposit, { status: 'SUCCESSFUL', amount: '1000.50' }), { decision: 'REJECT', reason: 'AMOUNT_MISMATCH' });
    assert.deepEqual(decideFromCampayReading(deposit, { status: 'SUCCESSFUL' }), { decision: 'REJECT', reason: 'AMOUNT_MISMATCH' });
  });

  it('attend si le paiement est en attente ou le statut inconnu, et marque l\'échec', () => {
    assert.deepEqual(decideFromCampayReading(deposit, { status: 'PENDING', amount: '1000' }), { decision: 'WAIT' });
    assert.deepEqual(decideFromCampayReading(deposit, { status: 'quelque chose', amount: '1000' }), { decision: 'WAIT' });
    assert.deepEqual(decideFromCampayReading(deposit, {}), { decision: 'WAIT' });
    assert.deepEqual(decideFromCampayReading(deposit, { status: 'FAILED', amount: '1000' }), { decision: 'MARK_FAILED' });
  });

  it('rejette une relecture qui concerne un autre dépôt ou une autre référence', () => {
    assert.deepEqual(
      decideFromCampayReading(deposit, { status: 'SUCCESSFUL', amount: '1000', externalReference: newDepositId() }),
      { decision: 'REJECT', reason: 'EXTERNAL_REF_MISMATCH' },
    );
    assert.deepEqual(
      decideFromCampayReading(deposit, { status: 'SUCCESSFUL', amount: '1000', reference: 'une-autre-reference' }),
      { decision: 'REJECT', reason: 'REFERENCE_MISMATCH' },
    );
  });
});
