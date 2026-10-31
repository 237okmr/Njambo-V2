import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emitWalletChanged, setWalletChangeListener } from './walletEvents';

describe('Kora Cash — signal de changement de solde', () => {
  it('transmet l\'identifiant du joueur à l\'abonné', () => {
    const seen: string[] = [];
    setWalletChangeListener((uid) => seen.push(uid));
    emitWalletChanged('joueur-1');
    emitWalletChanged('joueur-2');
    assert.deepEqual(seen, ['joueur-1', 'joueur-2']);
    setWalletChangeListener(null);
  });

  it('sans abonné, ne fait rien et ne plante pas', () => {
    setWalletChangeListener(null);
    assert.doesNotThrow(() => emitWalletChanged('joueur-1'));
  });

  it('une erreur de l\'abonné ne remonte pas au registre des mouvements', () => {
    setWalletChangeListener(() => {
      throw new Error('panne');
    });
    assert.doesNotThrow(() => emitWalletChanged('joueur-1'));
    setWalletChangeListener(null);
  });
});
