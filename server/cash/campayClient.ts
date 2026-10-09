/**
 * Client Campay pour Kora Cash.
 *
 * Aucune de ces fonctions n'écrit le log complet de la réponse Campay
 * (peut logger status et reference, jamais le corps brut qui pourrait contenir des données sensibles).
 */

import { getProviderCredentials } from './cashSecrets';

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
