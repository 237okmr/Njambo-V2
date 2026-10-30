/**
 * Client Campay pour Kora Cash.
 *
 * Aucune de ces fonctions n'écrit le log complet de la réponse Campay
 * (peut logger status et reference, jamais le corps brut qui pourrait contenir des données sensibles).
 */

import { getProviderCredentials } from './cashSecrets';
import { getEngineConfig } from '../engine/engineConfig';
import { PARAM_BY_KEY } from '../engine/engineParams';
import type { CampayDeps, CollectResult, TransactionRead } from './campayDeposits';
import {
  attachCampayReference,
  confirmDeposit,
  createDeposit,
  getDeposit,
  markDepositFailed,
} from './depositStore';

export async function testCampayConnection(
  environment: 'demo' | 'live'
): Promise<{ ok: boolean; message: string }> {
  try {
    const creds = await getProviderCredentials('campay', environment);
    if (!creds || !creds.username || !creds.password) {
      return {
        ok: false,
        message: `Identifiants Campay manquants pour l'environnement ${environment}. Veuillez renseigner le nom d'utilisateur et le mot de passe.`,
      };
    }

    const baseUrl = environment === 'live' ? 'https://campay.net' : 'https://demo.campay.net';
    const response = await fetch(`${baseUrl}/api/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: creds.username,
        password: creds.password,
      }),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data && (data.token || data.access_token)) {
        return {
          ok: true,
          message: `Connexion Campay réussie avec succès (mode ${environment.toUpperCase()}).`,
        };
      }
    }

    let errorMessage = `Erreur HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.message || errJson?.detail || errJson?.error) {
        errorMessage = String(errJson.message || errJson.detail || errJson.error);
      }
    } catch {
      // Ignorer l'erreur de désérialisation
    }

    return {
      ok: false,
      message: `Échec d'authentification Campay (${environment}) : ${errorMessage}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Erreur de communication avec Campay : ${err?.message || 'Erreur inconnue'}`,
    };
  }
}

export async function initiateCampayDeposit(params: {
  amount: number;
  phoneNumber: string;
  externalReference: string;
  environment: 'demo' | 'live';
}): Promise<{ reference: string; status: string }> {
  if (params.environment === 'live') {
    throw new Error('LIVE non activé — lot retrait non livré');
  }

  const creds = await getProviderCredentials('campay', 'demo');
  if (!creds) {
    throw new Error('Identifiants Campay (démo) non configurés.');
  }

  // Priorité au jeton permanent stocké ; sinon, récupération d'un jeton via username/password
  let token = creds.permanent_token || creds.token;
  if (!token && creds.username && creds.password) {
    const tokenRes = await fetch('https://demo.campay.net/api/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: creds.username,
        password: creds.password,
      }),
    });
    if (tokenRes.ok) {
      const tokenData = await tokenRes.json().catch(() => ({}));
      token = tokenData?.token || tokenData?.access_token;
    }
  }

  if (!token) {
    throw new Error('Jeton d\'accès Campay introuvable ou échec d\'obtention.');
  }

  const res = await fetch('https://demo.campay.net/api/collect/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${token}`,
    },
    body: JSON.stringify({
      amount: String(params.amount),
      currency: 'XAF',
      from: params.phoneNumber,
      description: `Recharge Kora Cash démo #${params.externalReference}`,
      external_reference: params.externalReference,
    }),
  });

  const data = await res.json().catch(() => ({}));

  // Journalisation minimale autorisée : status HTTP et reference uniquement (jamais le corps brut complet)
  console.log('[Campay] Collect status HTTP:', res.status, 'reference:', data?.reference, 'status:', data?.status);

  if (!res.ok) {
    const errorMsg = data?.message || data?.detail || `Erreur HTTP ${res.status}`;
    throw new Error(`Échec collecte Campay: ${errorMsg}`);
  }

  return {
    reference: String(data?.reference || ''),
    status: String(data?.status || 'PENDING'),
  };
}

// ---------------------------------------------------------------------------
// Dépôt Mobile Money réel (bac à sable uniquement) : fonctions utilisées par le service campayDeposits.ts
// ---------------------------------------------------------------------------

const CAMPAY_DEMO_BASE_URL = 'https://demo.campay.net';

/** Délai maximal d'un appel à Campay : lu dans le registre unique (réglable dans katika), jamais écrit en dur ici. */
function providerTimeoutMs(): number {
  const cfg = getEngineConfig() as unknown as Record<string, unknown>;
  const configured = Number(cfg.cashProviderTimeoutSeconds);
  const seconds = Number.isFinite(configured) && configured > 0 ? configured : Number(PARAM_BY_KEY.cashProviderTimeoutSeconds.default);
  return Math.round(seconds * 1000);
}

/** Jeton permanent s'il est enregistré, sinon jeton obtenu avec le nom d'utilisateur et le mot de passe. Jamais journalisé. */
async function resolveDemoToken(creds: Record<string, string>): Promise<string | null> {
  const direct = creds.permanent_token || creds.token;
  if (direct) return direct;
  if (!creds.username || !creds.password) return null;
  const res = await fetch(`${CAMPAY_DEMO_BASE_URL}/api/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: creds.username, password: creds.password }),
    signal: AbortSignal.timeout(providerTimeoutMs()),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data?.token || data?.access_token || null;
}

/** Demande la collecte à Campay. Distingue refus net, acceptation et issue incertaine (voir CollectResult). */
export async function startCampayCollect(params: { amount: number; phone: string; depositId: string }): Promise<CollectResult> {
  let token: string | null = null;
  try {
    const creds = await getProviderCredentials('campay', 'demo');
    if (!creds) return { kind: 'REJECTED', message: 'Le paiement par Mobile Money n\'est pas disponible pour le moment.' };
    token = await resolveDemoToken(creds);
  } catch {
    // Rien n'a encore été demandé à Campay : l'échec est sans risque.
    return { kind: 'REJECTED', message: 'Campay est injoignable pour le moment. Réessaie dans un instant.' };
  }
  if (!token) return { kind: 'REJECTED', message: 'Le paiement par Mobile Money n\'est pas disponible pour le moment.' };

  try {
    const res = await fetch(`${CAMPAY_DEMO_BASE_URL}/api/collect/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
      body: JSON.stringify({
        amount: String(params.amount),
        currency: 'XAF',
        from: params.phone,
        description: `Recharge Kora Cash demo ${params.depositId}`,
        external_reference: params.depositId,
      }),
      signal: AbortSignal.timeout(providerTimeoutMs()),
    });
    const data = await res.json().catch(() => ({}));
    console.log('[Campay] Collecte : statut HTTP', res.status, 'dépôt', params.depositId);
    if (res.ok && typeof data?.reference === 'string' && data.reference) {
      return { kind: 'ACCEPTED', reference: data.reference };
    }
    if (res.status >= 400 && res.status < 500) {
      const detail = typeof data?.message === 'string' && data.message ? data.message : `Erreur ${res.status}`;
      return { kind: 'REJECTED', message: `Campay a refusé la demande : ${detail}` };
    }
    return { kind: 'UNKNOWN', message: `Réponse inattendue de Campay (statut ${res.status}).` };
  } catch {
    return { kind: 'UNKNOWN', message: 'Aucune réponse de Campay.' };
  }
}

/** Relit une transaction chez Campay par sa référence. Ne renvoie que le statut, le montant et les références. */
export async function readCampayTransaction(reference: string): Promise<TransactionRead> {
  try {
    const creds = await getProviderCredentials('campay', 'demo');
    if (!creds) return { kind: 'UNAVAILABLE', message: 'Identifiants Campay absents.' };
    const token = await resolveDemoToken(creds);
    if (!token) return { kind: 'UNAVAILABLE', message: 'Jeton Campay indisponible.' };
    const res = await fetch(`${CAMPAY_DEMO_BASE_URL}/api/transaction/${encodeURIComponent(reference)}/`, {
      method: 'GET',
      headers: { Authorization: `Token ${token}` },
      signal: AbortSignal.timeout(providerTimeoutMs()),
    });
    if (!res.ok) return { kind: 'UNAVAILABLE', message: `Relecture impossible (statut ${res.status}).` };
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') return { kind: 'UNAVAILABLE', message: 'Réponse illisible.' };
    return {
      kind: 'OK',
      reading: {
        status: data.status,
        amount: data.amount,
        reference: data.reference,
        externalReference: data.external_reference,
      },
    };
  } catch {
    return { kind: 'UNAVAILABLE', message: 'Aucune réponse de Campay.' };
  }
}

/** Clé de signature des notifications (enregistrée chiffrée dans le panneau Prestataires de katika). */
async function getCampayWebhookKey(): Promise<string | null> {
  const creds = await getProviderCredentials('campay', 'demo');
  const key = creds?.webhook_key;
  return typeof key === 'string' && key !== '' ? key : null;
}

/** Branche le service campayDeposits sur la vraie base de données et le vrai Campay (bac à sable). */
export function createLiveCampayDeps(): CampayDeps {
  return {
    createDeposit,
    getDeposit,
    attachCampayReference,
    markDepositFailed,
    confirmDeposit,
    startCollect: startCampayCollect,
    readTransaction: readCampayTransaction,
    getWebhookKey: getCampayWebhookKey,
    nowMs: () => Date.now(),
  };
}
