import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DiagnosticReportInput, formatDiagnosticReport } from './diagnosticReportFormat';
import { KATIKA_AUTHORIZED_EMAIL, isAdminIdentity } from '../utils/adminAccess';

const baseInput: DiagnosticReportInput = {
  generatedAt: '2026-11-02T10:00:00.000Z',
  origin: 'https://njambo-kora.ai.studio',
  appVersion: '2.5.400',
  buildId: 'abc',
  socketLabel: 'Ouverte (Connectée)',
  latencyMs: 80,
  activeRoomCode: 'K8T4',
  isGoogleUser: true,
  playerId: 'player-1',
  hasReconnectToken: true,
  lastError: null,
  health: { status: 'ok', instanceId: 'i-1', activeRooms: 3 },
  healthFallback: 'Non disponible',
};

describe('rapport de diagnostic', () => {
  it('indique la présence du jeton de reconnexion sans jamais en donner une partie', () => {
    const report = formatDiagnosticReport(baseInput);
    assert.match(report, /Jeton de reconnexion présent : Oui\n/);
    assert.ok(!report.includes('••••'));
  });

  it('reprend les éléments utiles à l’analyse', () => {
    const report = formatDiagnosticReport({
      ...baseInput,
      lastError: { code: 'E_ROOM', message: 'Table introuvable', timestamp: 0 },
    });
    assert.match(report, /Version App : 2\.5\.400 \(abc\)/);
    assert.match(report, /Table active : K8T4/);
    assert.match(report, /Identifiant joueur : player-1/);
    assert.match(report, /Code : E_ROOM\nMessage : Table introuvable/);
    assert.match(report, /Instance ID : i-1/);
  });

  it('signale un serveur illisible au lieu d’échouer', () => {
    const report = formatDiagnosticReport({ ...baseInput, health: null, healthFallback: 'Erreur (HTTP 503)' });
    assert.match(report, /Statut : Erreur \(HTTP 503\)/);
  });
});

describe('compte d’administration', () => {
  it('reconnaît le propriétaire, sans tenir compte de la casse ni des espaces', () => {
    assert.equal(isAdminIdentity(` ${KATIKA_AUTHORIZED_EMAIL.toUpperCase()} `), true);
  });

  it('reconnaît un administrateur désigné par son jeton', () => {
    assert.equal(isAdminIdentity('autre@example.com', { admin: true }), true);
  });

  it('refuse tout autre compte, et un drapeau qui n’est pas exactement vrai', () => {
    assert.equal(isAdminIdentity('joueur@example.com'), false);
    assert.equal(isAdminIdentity('joueur@example.com', { admin: 'true' }), false);
    assert.equal(isAdminIdentity(null, null), false);
  });
});
