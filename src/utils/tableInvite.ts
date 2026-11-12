/**
 * Invitation en présentiel : code d'une table lisible à voix haute. Fonctions pures, aucun délai.
 */

/** « ABCD12 » devient « A B C D 1 2 » : chaque caractère se dicte et se lit séparément. Chaîne vide si le code est vide. */
export function spacedTableCode(code: unknown): string {
  if (typeof code !== 'string') return '';
  const clean = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return clean.split('').join(' ');
}
