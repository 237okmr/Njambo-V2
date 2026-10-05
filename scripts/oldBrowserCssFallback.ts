import type { Plugin } from 'vite';

/**
 * Filet de sécurité pour les navigateurs trop anciens pour la syntaxe « in oklab » des dégradés Tailwind v4.
 * Sans lui, tout dégradé (bg-gradient-to-*) disparaît entièrement sur ces appareils. Pour chaque règle qui
 * déclare « --tw-gradient-position: <direction> in oklab », on ajoute une règle de secours qui ne s'applique
 * QUE si le navigateur ne comprend pas « in oklab » : les navigateurs récents gardent le rendu actuel.
 */
export function addOldBrowserGradientFallback(css: string): string {
  const re = /(\.[^{}]+?)\{[^{}]*?--tw-gradient-position:([^;}]*?) in oklab(?:[;}])/g;
  const extra: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const selector = m[1].trim();
    const position = m[2].trim();
    const key = `${selector}|${position}`;
    if (seen.has(key)) continue;
    seen.add(key);
    extra.push(`${selector}{--tw-gradient-position:${position}}`);
  }
  if (extra.length === 0) return css;
  return `${css}\n@supports not (background-image:linear-gradient(in oklab,red,blue)){${extra.join('')}}\n`;
}

export function oldBrowserCssFallback(): Plugin {
  return {
    name: 'njambo-old-browser-css-fallback',
    enforce: 'post',
    transform(code, id) {
      if (!/\.css(\?|$)/.test(id) || !code.includes('in oklab')) return null;

      // When Vite transforms CSS in dev mode, the code passed to transform may already be a JS module
      if (code.includes('__vite__css')) {
        return {
          code: code.replace(/const __vite__css = ("(?:[^"\\]|\\.)*"|`[\s\S]*?`|'(?:[^'\\]|\\.)*')/, (_full, literal) => {
            try {
              const rawCss = literal.startsWith('`') ? literal.slice(1, -1) : JSON.parse(literal);
              const modifiedCss = addOldBrowserGradientFallback(rawCss);
              const newLiteral = literal.startsWith('`')
                ? `\`${modifiedCss.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\``
                : JSON.stringify(modifiedCss);
              return `const __vite__css = ${newLiteral}`;
            } catch {
              return _full;
            }
          }),
          map: null,
        };
      }

      if (code.startsWith('export default ') && (code.includes('"') || code.includes('`') || code.includes("'"))) {
        return {
          code: code.replace(/export default ("(?:[^"\\]|\\.)*"|`[\s\S]*?`|'(?:[^'\\]|\\.)*')/, (_full, literal) => {
            try {
              const rawCss = literal.startsWith('`') ? literal.slice(1, -1) : JSON.parse(literal);
              const modifiedCss = addOldBrowserGradientFallback(rawCss);
              const newLiteral = literal.startsWith('`')
                ? `\`${modifiedCss.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\``
                : JSON.stringify(modifiedCss);
              return `export default ${newLiteral}`;
            } catch {
              return _full;
            }
          }),
          map: null,
        };
      }

      // If it's a JS module we couldn't parse, do not append raw CSS to it
      if (/^\s*(import\s|export\s)/.test(code)) {
        return null;
      }

      return { code: addOldBrowserGradientFallback(code), map: null };
    },
    generateBundle(_opts, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.css') && typeof file.source === 'string') {
          file.source = addOldBrowserGradientFallback(file.source);
        }
      }
    },
  };
}
