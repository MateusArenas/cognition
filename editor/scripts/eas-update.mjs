#!/usr/bin/env node
// `eas update`/`expo export` força NODE_ENV=production e não deixa sobrepor (ver
// node_modules/@expo/cli/build/src/export/exportApp.js: "Force the environment during export
// and do not allow overriding it") — então o .env.$NODE_ENV automático do Expo só distingue dev
// (expo start) de "tudo que não é dev", nunca hml de production. Este script carrega o
// .env.<nome> pedido e pré-popula process.env ANTES de chamar `eas update`; @expo/env não
// sobrescreve uma env var já definida no processo (documentado no próprio pacote), então o
// valor daqui vence sobre o que `.env.production` traria por padrão. Ver
// docs/02-setup-e-estrutura.md.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [envName, branch, ...messageParts] = process.argv.slice(2);
const message = messageParts.join(' ') || `Publicado via scripts/eas-update.mjs (${envName})`;

if (!envName || !branch) {
  console.error('uso: node scripts/eas-update.mjs <development|hml|production> <branch-eas> [mensagem]');
  process.exit(1);
}

const envFile = join(root, `.env.${envName}`);
const env = { ...process.env };
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
}

for (const platform of ['ios', 'android']) {
  const result = spawnSync('eas', ['update', '--branch', branch, '--platform', platform, '--message', message, '--non-interactive'], {
    cwd: root,
    stdio: 'inherit',
    env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
