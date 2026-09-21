// Génère les icônes PNG (obligatoires pour l'installation Android/WebAPK, l'écran d'accueil iOS
// et les notifications) à partir des SVG existants. À lancer une fois : node scripts/generate-icons.mjs
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

async function render(svgFile, size, outFile) {
  const svg = await readFile(path.join(publicDir, svgFile));
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(path.join(publicDir, outFile));
  console.log('OK', outFile);
}

// Badge de notification Android : silhouette MONOCHROME (blanc sur transparent), sans dégradé.
// Une carte avec un losange évidé, reprenant le motif du logo.
const badgeSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <mask id="m">
    <rect width="96" height="96" fill="black"/>
    <rect x="24" y="8" width="48" height="80" rx="9" fill="white"/>
    <path d="M48 30 L62 50 L48 70 L34 50 Z" fill="black"/>
  </mask>
  <rect width="96" height="96" fill="white" mask="url(#m)"/>
</svg>`;

await render('icon-192.svg', 192, 'icon-192.png');
await render('icon-512.svg', 512, 'icon-512.png');
await render('icon-maskable.svg', 512, 'icon-maskable-512.png');
await render('icon-512.svg', 180, 'apple-touch-icon.png');
await render('icon-copilot-192.svg', 192, 'icon-copilot-192.png');
await render('icon-copilot-512.svg', 512, 'icon-copilot-512.png');
await render('icon-copilot-maskable.svg', 512, 'icon-copilot-maskable-512.png');
await sharp(Buffer.from(badgeSvg)).png().toFile(path.join(publicDir, 'badge-96.png'));
console.log('OK badge-96.png');
