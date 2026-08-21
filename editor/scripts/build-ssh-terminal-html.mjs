// Embute xterm.js (+ addon-fit) e o CSS deles no shell do terminal SSH, gerando terminal.html —
// mesmo motivo/técnica de build-runtime.mjs (canvas Mermaid): precisa funcionar offline (avião
// ligado), então o bundle vai dentro do HTML, não carregado de CDN. Ver docs/20-ssh-mobile.md.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const terminalDir = path.join(__dirname, '..', 'src', 'features', 'ssh', 'terminal');

// require.resolve (não um path relativo fixo a editor/node_modules) de propósito: o npm
// workspaces pode escolher hospedar @xterm/* na raiz do monorepo OU dentro de editor/node_modules
// dependendo do que mais existe no lockfile — resolução de módulo de verdade encontra a certa
// nos dois casos, um path escrito à mão não.
const xtermPkgDir = path.dirname(require.resolve('@xterm/xterm/package.json'));
const fitPkgDir = path.dirname(require.resolve('@xterm/addon-fit/package.json'));

const xtermJs = fs.readFileSync(path.join(xtermPkgDir, 'lib', 'xterm.js'), 'utf8');
const xtermCss = fs.readFileSync(path.join(xtermPkgDir, 'css', 'xterm.css'), 'utf8');
const fitJs = fs.readFileSync(path.join(fitPkgDir, 'lib', 'addon-fit.js'), 'utf8');
const shell = fs.readFileSync(path.join(terminalDir, 'terminal.shell.html'), 'utf8');

// Função como segundo argumento do replace() em vez da string direta — mesmo motivo documentado
// em build-runtime.mjs: "$&"/"$1" etc. no bundle minificado são interpretados como token
// especial de substituição quando passados como STRING, corrompendo o arquivo em silêncio.
const out = shell
  .replace('/*__XTERM_CSS__*/', () => xtermCss)
  .replace('/*__XTERM_JS__*/', () => xtermJs)
  .replace('/*__ADDON_FIT_JS__*/', () => fitJs);

fs.writeFileSync(path.join(terminalDir, 'terminal.html'), out);
const kb = (xtermJs.length + xtermCss.length + fitJs.length) / 1024;
console.log(`terminal.html gerado (${kb.toFixed(0)} KB de xterm.js + addon-fit + CSS embutidos).`);
