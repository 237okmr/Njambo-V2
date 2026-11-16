// Pile locale isolée pour les tests de parcours sur moteur Safari (WebKit).
//
// Ce que fait ce fichier, dans l'ordre :
//  1. démarre l'émulateur Firestore (rien ne touche la vraie base) ;
//  2. recopie l'application dans un dossier temporaire, avec une configuration Firebase factice
//     (projet « demo-njambo », base par défaut) et un fichier src/lib/firebase.ts de test qui se
//     branche sur l'émulateur — le dépôt lui-même n'est jamais modifié ;
//  3. compile le bundle de production dans ce dossier (vite build --outDir, sans toucher aux
//     fichiers de version du dépôt) ;
//  4. lance le vrai serveur (server.ts) en mode production, avec un environnement minimal :
//     aucun secret, aucun identifiant Google.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIREBASE_TOOLS = 'firebase-tools@15.36.0';

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitFor(check, label, timeoutMs, logs) {
  const start = Date.now();
  for (;;) {
    try {
      if (await check()) return;
    } catch {
      // on réessaie
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Délai dépassé : ${label}\n--- journal ---\n${(logs?.() ?? '').slice(-3000)}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args.join(' ')} → code ${code}\n${out.slice(-3000)}`))));
  });
}

function startLogged(cmd, args, opts) {
  const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let buf = '';
  const keep = (d) => {
    buf += d;
    if (buf.length > 20000) buf = buf.slice(-20000);
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  return { child, logs: () => buf };
}

function killGroup(child) {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // déjà arrêté
  }
}

function testFirebaseModule(emulatorPort) {
  return `import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = initializeFirestore(app, { localCache: memoryLocalCache(), experimentalForceLongPolling: true });
connectFirestoreEmulator(db, '127.0.0.1', ${emulatorPort});
export default app;
`;
}

export async function startStack() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'njambo-safari-'));
  const children = [];
  const stop = async () => {
    for (const c of children) killGroup(c);
    await new Promise((r) => setTimeout(r, 500));
    fs.rmSync(tmp, { recursive: true, force: true });
  };

  try {
    // 1. Émulateur Firestore
    const emuPort = await freePort();
    const emuDir = path.join(tmp, 'emulator');
    fs.mkdirSync(emuDir);
    fs.copyFileSync(path.join(REPO, 'firestore.rules'), path.join(emuDir, 'firestore.rules'));
    fs.writeFileSync(
      path.join(emuDir, 'firebase.json'),
      JSON.stringify({
        firestore: { rules: 'firestore.rules' },
        emulators: { firestore: { host: '127.0.0.1', port: emuPort }, ui: { enabled: false } },
      })
    );
    const emu = startLogged('npx', ['--yes', FIREBASE_TOOLS, 'emulators:start', '--only', 'firestore', '--project', 'demo-njambo'], {
      cwd: emuDir,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
    children.push(emu.child);

    // 2. Copie de l'application
    const app = path.join(tmp, 'app');
    fs.mkdirSync(app);
    for (const name of ['server.ts', 'server', 'src', 'public', 'index.html', 'package.json', 'tsconfig.json', 'vite.config.ts']) {
      fs.cpSync(path.join(REPO, name), path.join(app, name), { recursive: true });
    }
    fs.mkdirSync(path.join(app, 'scripts'));
    fs.copyFileSync(path.join(REPO, 'scripts', 'oldBrowserCssFallback.ts'), path.join(app, 'scripts', 'oldBrowserCssFallback.ts'));
    fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(app, 'node_modules'), 'dir');
    const realConfig = JSON.parse(fs.readFileSync(path.join(REPO, 'firebase-applet-config.json'), 'utf8'));
    fs.writeFileSync(
      path.join(app, 'firebase-applet-config.json'),
      JSON.stringify({
        ...realConfig,
        projectId: 'demo-njambo',
        apiKey: 'demo-key',
        authDomain: 'localhost',
        firestoreDatabaseId: '(default)',
        storageBucket: '',
        messagingSenderId: '0',
        appId: '1:0:web:demo',
        oAuthClientId: '',
      })
    );
    fs.writeFileSync(path.join(app, 'src', 'lib', 'firebase.ts'), testFirebaseModule(emuPort));

    // 3. Bundle de production (dans le dossier temporaire)
    await run(path.join(REPO, 'node_modules', '.bin', 'vite'), ['build', '--outDir', 'dist', '--logLevel', 'error'], {
      cwd: app,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production' },
    });

    // 4. Émulateur prêt, puis serveur réel
    await waitFor(async () => (await fetch(`http://127.0.0.1:${emuPort}/`)).ok, "démarrage de l'émulateur Firestore", 120000, emu.logs);
    const port = await freePort();
    const srv = startLogged(path.join(REPO, 'node_modules', '.bin', 'tsx'), ['server.ts'], {
      cwd: app,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: 'production',
        PORT: String(port),
        FIREBASE_PROJECT_ID: 'demo-njambo',
        GCLOUD_PROJECT: 'demo-njambo',
        FIRESTORE_EMULATOR_HOST: `127.0.0.1:${emuPort}`,
      },
    });
    children.push(srv.child);
    await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/version.json`)).ok, 'démarrage du serveur', 90000, srv.logs);

    // Arrêt propre du serveur seul : il vide alors ses mesures en mémoire dans Firestore (arrêt gracieux).
    const stopServer = () =>
      new Promise((resolve) => {
        if (srv.child.exitCode !== null) return resolve();
        srv.child.once('exit', () => resolve());
        killGroup(srv.child);
        setTimeout(resolve, 20000);
      });
    return { baseUrl: `http://127.0.0.1:${port}`, port, emulatorPort: emuPort, serverLogs: srv.logs, emulatorLogs: emu.logs, stopServer, stop };
  } catch (err) {
    await stop();
    throw err;
  }
}
