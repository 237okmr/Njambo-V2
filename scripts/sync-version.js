import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Read single source of truth version from package.json
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const version = pkg.version || '2.5.0';

// 2. Generate date-stamped unique build ID (e.g., 2026.09.03-v250)
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const vClean = version.replace(/\./g, '');
const buildId = `${year}.${month}.${day}-v${vClean}`;

// 3. Write /public/version.json (used by useAutoUpdate.ts)
const versionJsonPath = path.join(rootDir, 'public', 'version.json');
const versionJsonData = {
  version,
  buildId,
  updatedAt: now.toISOString(),
};
fs.writeFileSync(versionJsonPath, JSON.stringify(versionJsonData, null, 2) + '\n', 'utf-8');

// 4. Write /src/version.ts (bundled with client application)
const versionTsPath = path.join(rootDir, 'src', 'version.ts');
const versionTsContent = `// App version build metadata - synchronized automatically
export const APP_VERSION = "${version}";
export const APP_BUILD_ID = "${buildId}";
`;
fs.writeFileSync(versionTsPath, versionTsContent, 'utf-8');

// 5. Update /public/sw.js cache version to force atomic eviction of old assets
const swPath = path.join(rootDir, 'public', 'sw.js');
if (fs.existsSync(swPath)) {
  let swContent = fs.readFileSync(swPath, 'utf-8');
  swContent = swContent.replace(
    /const CACHE_GAME = '[^']+';/,
    `const CACHE_GAME = 'njambo-kora-assets-v${vClean}';`
  );
  swContent = swContent.replace(
    /const CACHE_COPILOT = '[^']+';/,
    `const CACHE_COPILOT = 'katika-copilot-assets-v${vClean}';`
  );
  fs.writeFileSync(swPath, swContent, 'utf-8');
}

console.log(`[version:sync] Synchronized App Version to v${version} (Build ID: ${buildId}, Cache: njambo-kora-assets-v${vClean})`);
