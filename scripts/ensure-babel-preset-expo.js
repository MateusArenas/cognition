#!/usr/bin/env node
// Corrige um hazard real de hoisting deste monorepo (npm workspaces): dependências órfãs na
// raiz (@radix-ui/*, @visx/*, nem declaradas em editor/package.json nem backend/package.json,
// presentes desde antes de qualquer trabalho recente) empurram `babel-preset-expo` pra
// node_modules da RAIZ em vez de aninhado em editor/node_modules. De lá, o preset não consegue
// `require.resolve('expo-router')` (só existe em editor/node_modules — a resolução do Node só
// anda pra CIMA a partir de onde o pacote que fez o require mora, nunca pra o lado, pra dentro
// do node_modules de outro workspace) — o plugin de rotas do Expo Router nunca registra,
// `process.env.EXPO_ROUTER_APP_ROOT` nunca vira string de verdade, e o Metro quebra com
// "First argument of `require.context` should be a string" (já aconteceu 2x nesta sessão).
//
// `editor/metro.config.js` já resolve o mesmo tipo de problema pra react/react-dom/scheduler
// via `resolver.resolveRequest` — mas isso não ajuda AQUI: a resolução do preset do Babel
// acontece dentro do @babel/core, antes até do Metro começar a transformar qualquer arquivo,
// então o resolver do Metro nunca entra em cena. A única correção real é garantir que uma cópia
// física de babel-preset-expo exista dentro de editor/node_modules — este script roda sozinho
// depois de QUALQUER `npm install` (postinstall na raiz) e reaplica a cópia se precisar,
// pra esse hazard nunca mais depender de alguém lembrar de rodar um `cp -r` manual de novo.
//
// Ver a memória do agente (project_monorepo_dependency_hoisting_hazards) e
// docs/02-setup-e-estrutura.md pro relato completo dos dois incidentes reais.
const fs = require('fs');
const path = require('path');

const root = __dirname + '/..';
const rootSrc = path.join(root, 'node_modules', 'babel-preset-expo');
const editorDest = path.join(root, 'editor', 'node_modules', 'babel-preset-expo');

function hasContent(dir) {
  try {
    return fs.existsSync(path.join(dir, 'package.json'));
  } catch {
    return false;
  }
}

try {
  if (hasContent(editorDest)) {
    // Já aninhado certo (não foi hoisted desta vez, ou já foi corrigido) — nada a fazer.
    process.exit(0);
  }
  if (!hasContent(rootSrc)) {
    // babel-preset-expo nem instalado ainda (ex.: primeira etapa de um install parcial) —
    // não há o que copiar; um postinstall futuro cobre isso.
    process.exit(0);
  }
  fs.rmSync(editorDest, { recursive: true, force: true });
  fs.cpSync(rootSrc, editorDest, { recursive: true });
  // eslint-disable-next-line no-console
  console.log('[ensure-babel-preset-expo] copiado pra editor/node_modules/babel-preset-expo (hoisting hazard do monorepo, ver docs/02-setup-e-estrutura.md).');
} catch (err) {
  // Nunca derruba o install por causa disso — só avisa. Pior caso, o bundling do Metro falha
  // depois com o erro de sempre e alguém roda `npm run fix:babel-preset-expo` à mão.
  // eslint-disable-next-line no-console
  console.warn('[ensure-babel-preset-expo] não consegui corrigir automaticamente:', err.message);
}
