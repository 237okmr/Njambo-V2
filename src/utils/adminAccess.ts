/**
 * Reconnaît un compte d'administration. Sert uniquement à choisir ce qui s'affiche côté client :
 * le serveur et les règles Firestore restent seuls juges des droits.
 */
export const KATIKA_AUTHORIZED_EMAIL = '237okmr@gmail.com';

export function isAdminIdentity(email: string | null | undefined, claims?: Record<string, unknown> | null): boolean {
  const normalizedEmail = (email || '').trim().toLowerCase();
  return normalizedEmail === KATIKA_AUTHORIZED_EMAIL.toLowerCase() || claims?.admin === true;
}
