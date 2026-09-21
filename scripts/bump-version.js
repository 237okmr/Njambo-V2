import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pkgPath = path.join(rootDir, 'package.json');

try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const currentVersion = pkg.version || '2.5.0';
  const parts = currentVersion.split('.');

  if (parts.length >= 3) {
    // Standard semver: major.minor.patch
    const patch = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(patch)) {
      parts[parts.length - 1] = String(patch + 1);
    } else {
      parts[parts.length - 1] = '1';
    }
  } else if (parts.length > 0) {
    // If it's something like "2" or "2.5", parse and increment or append
    const lastPart = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastPart)) {
      parts[parts.length - 1] = String(lastPart + 1);
    } else {
      parts.push('1');
    }
  } else {
    parts.push('1', '0', '0');
  }

  const newVersion = parts.join('.');
  pkg.version = newVersion;

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  console.log(`[version:bump] Automatically bumped version from v${currentVersion} to v${newVersion}`);
} catch (error) {
  console.error('[version:bump] Failed to automatically bump version:', error);
  process.exit(1);
}
