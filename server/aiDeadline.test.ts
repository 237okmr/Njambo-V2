import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AiDeadlineError, runWithDeadline } from './aiDeadline';
import { isTransitoryError } from './aiAdminChat';

describe('Délai maximal des appels à l\'IA', () => {
  it('renvoie le résultat quand l\'IA répond à temps', async () => {
    assert.equal(await runWithDeadline(1000, async () => 'réponse'), 'réponse');
  });

  it('abandonne un appel qui ne répond jamais et annule le signal', async () => {
    let seen: AbortSignal | null = null;
    await assert.rejects(
      runWithDeadline(10, (signal) => {
        seen = signal;
        return new Promise(() => {});
      }),
      AiDeadlineError
    );
    assert.equal((seen as unknown as AbortSignal).aborted, true);
  });

  it('laisse passer l\'erreur de l\'appel sans annuler le signal', async () => {
    let seen: AbortSignal | null = null;
    await assert.rejects(
      runWithDeadline(1000, async (signal) => {
        seen = signal;
        throw new Error('400 invalide');
      }),
      /400 invalide/
    );
    assert.equal((seen as unknown as AbortSignal).aborted, false);
  });

  it('le dépassement est reconnu comme passager : le modèle de secours peut répondre', () => {
    assert.equal(isTransitoryError(new AiDeadlineError(60000)), true);
  });
});
