// Embute o Mermaid minificado no shell do canvas, gerando runtime.html — necessário para o
// app funcionar offline (avião ligado). Ver docs/06-canvas.md §8.1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const canvasDir = path.join(__dirname, '..', 'src', 'features', 'diagram', 'canvas');

const mermaid = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'), 'utf8');
const shell = fs.readFileSync(path.join(canvasDir, 'runtime.shell.html'), 'utf8');

// Passar `mermaid` como string direto pro replace() é o bug: String.prototype.replace trata
// $&, $`, $', $$, $1-$99 como tokens especiais NO VALOR DE SUBSTITUIÇÃO mesmo quando a busca é
// uma string simples (não regex) — e o mermaid.min.js tem várias ocorrências de "$&" (é o
// idioma padrão de escape de regex, tipo `x.replace(/.../g, '\\$&')`), que viram "o trecho
// buscado" reinserido no meio do bundle, corrompendo o arquivo de um jeito que nem lança erro
// de sintaxe — só deixa `window.mermaid` nunca definido. Uma função como segundo argumento
// devolve o valor literal, sem interpretar `$`.
fs.writeFileSync(path.join(canvasDir, 'runtime.html'), shell.replace('/*__MERMAID__*/', () => mermaid));
console.log('runtime.html gerado (' + (mermaid.length / 1024 / 1024).toFixed(1) + ' MB de Mermaid embutido).');
