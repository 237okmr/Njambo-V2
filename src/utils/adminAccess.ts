/**
 * Reconnaît le compte propriétaire. Sert uniquement à choisir ce qui s'affiche côté client :
 * le serveur et les règles Firestore restent seuls juges des droits. Les admins ajoutés n'ont plus de droit global
 * (claim « admin ») : leurs droits sont lus par le serveur dans leur fiche (/api/katika/me).
 */
export const KATIKA_AUTHORIZED_EMAIL = '237okmr@gmail.com';

export function isAdminIdentity(email: string | null | undefined, _claims?: Record<string, unknown> | null): boolean {
  const normalizedEmail = (email || '').trim().toLowerCase();
  return normalizedEmail === KATIKA_AUTHORIZED_EMAIL.toLowerCase();
}
