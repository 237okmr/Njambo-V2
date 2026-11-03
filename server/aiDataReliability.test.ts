import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataReliabilitySection, buildSystemInstruction } from './aiAdminChat';

const snapshot = (dataQuality: unknown) => ({
  timestamp: Date.UTC(2026, 10, 3, 11, 0, 0),
  dataQuality,
  summary: { connectedPlayers: 4, activeRooms: 1, totalManches: 0, totalParties: 0 },
  kpis: { allTime: {} },
});

describe('Fiabilité des chiffres transmis au copilote', () => {
  it('donne la date du relevé et le niveau', () => {
    const text = buildDataReliabilitySection(snapshot({ level: 'OK', notices: [] }));
    assert.match(text, /RELEVÉ:03\/11\/2026 12:00/);
    assert.match(text, /NIVEAU:COMPLET/);
  });

  it('une lecture ratée interdit de donner des chiffres d\'historique', () => {
    const prompt = buildSystemInstruction({}, 'combien de parties cette semaine ?', snapshot({ level: 'UNAVAILABLE', notices: ['Historique des manches : lecture impossible.'] }));
    assert.match(prompt, /NIVEAU:INDISPONIBLE/);
    assert.match(prompt, /ne donne aucun chiffre d'historique/);
    assert.doesNotMatch(prompt, /PARTIES_TOTAL:0/);
    assert.match(prompt, /JOUEURS_EN_LIGNE:4/);
  });

  it('des chiffres partiels sont transmis avec leur limite', () => {
    const prompt = buildSystemInstruction({}, 'bilan', snapshot({ level: 'PARTIAL', notices: ['Calcul partiel : 1 000 manches.'] }));
    assert.match(prompt, /NIVEAU:PARTIEL/);
    assert.match(prompt, /Calcul partiel/);
    assert.doesNotMatch(prompt, /CERTIFI/);
  });

  it('sans chiffres transmis, le copilote ne conclut pas à zéro', () => {
    const prompt = buildSystemInstruction({}, 'bilan', undefined);
    assert.match(prompt, /ne conclus pas à zéro/);
  });
});
