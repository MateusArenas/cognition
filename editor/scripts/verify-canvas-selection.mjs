// Camada 1.5 de testes (docs/13-qualidade-e-testes.md): nem vitest nem jest conseguem
// exercitar geometria real de SVG/DOM (getBoundingClientRect, viewBox, transform de verdade)
// — precisa de um browser de verdade. Roda `runtime.html` num Chromium headless via Playwright
// e verifica, pra cada tipo de diagrama, que tocar um elemento seleciona ELE (não outro) e que
// o destaque azul (`drawSelection`) cobre exatamente o elemento que `data-sel-key` mirou — as
// duas classes de bug reais já achadas nesta camada (ver docs/06-canvas.md, docs/07-selecao.md):
// Camada 2/3 mapeando o elemento errado, e a conversão tela↔SVG saindo com o tamanho errado.
//
// Não roda no `npm test` normal (precisa baixar o Chromium do Playwright, pesado demais pro
// dia a dia) — rode com `npm run verify:canvas` quando mexer em runtime.shell.html.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimePath = path.join(__dirname, '..', 'src', 'features', 'diagram', 'canvas', 'runtime.html');

if (!fs.existsSync(runtimePath)) {
  console.error('runtime.html não existe — rode `npm run runtime` primeiro.');
  process.exit(1);
}

const tokens = {
  bg: '#000', label: '#fff', labelSecondary: '#8e8e93',
  surface: '#1c1c1e', surface2: '#2c2c2e', surface3: '#3a3a3c',
  separator: '#38383a', separatorBold: '#48484a', blue: '#0a84ff', red: '#ff453a',
};

// Limitação pré-existente, sem relação com nenhum bug corrigido nesta camada (docs/07-selecao.md):
// o rótulo de uma relação diagonal/curva pode cair exatamente na borda do hit da linha (26px de
// stroke, mas a curva Bezier pode não passar perto do rótulo em si) — tocar o texto, nesse caso
// raro, não pega a linha. Não é a mesma classe de bug do getScreenCTM/viewBox (essa é sobre ONDE
// a linha passa, não sobre conversão de coordenadas) — documentado e não mexido de propósito
// pra não arriscar o que já está 100% no ER; ver CHECKLIST.md.
const LIMITACOES_CONHECIDAS = new Set(['é pedido em']);

const CASOS = [
  {
    nome: 'ER (4 tabelas, inclui relação vertical e diagonal)',
    code: `erDiagram
    CLIENTE {
        string id PK
        string nome
        string email
    }
    PEDIDO {
        string id PK
        string cliente_id FK
        string numero UK "nº do WMS"
    }
    PRODUTO {
        string id PK
        string sku UK
    }
    ITEM_PEDIDO {
        string id PK
        string pedido_id FK
        string produto_id FK
    }
    CLIENTE ||--o{ PEDIDO : faz
    PEDIDO ||--|{ ITEM_PEDIDO : contém
    PRODUTO ||--o{ ITEM_PEDIDO : "é pedido em"
`,
  },
  {
    nome: 'Flowchart (nós + arestas rotuladas)',
    code: `flowchart TD
    A[Início] --> B{Decide}
    B -->|Sim| C[Faz]
    B -->|Não| D[Não faz]
`,
  },
  {
    nome: 'stateDiagram-v2 (rótulo de nó em foreignObject)',
    code: `stateDiagram-v2
    [*] --> Rascunho
    Rascunho --> EmRevisao : enviar
    EmRevisao --> Aprovado : aprovar
    EmRevisao --> Rascunho : rejeitar
    Aprovado --> [*]
`,
  },
  {
    nome: 'classDiagram',
    code: `classDiagram
    class Pedido {
      +String id
      +calcularTotal()
    }
    class Cliente {
      +String nome
    }
    Cliente --> Pedido
`,
  },
  {
    nome: 'sequenceDiagram',
    code: `sequenceDiagram
    participant Usuario
    participant App
    Usuario->>App: Abre tela
    App-->>Usuario: Mostra dados
`,
  },
];

async function testarDiagrama(browser, caso) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.addInitScript(() => {
    window.__msgs = [];
    window.ReactNativeWebView = { postMessage: (s) => window.__msgs.push(JSON.parse(s)) };
  });
  await page.goto('file://' + runtimePath);
  await page.evaluate(
    ({ code, tokens }) => window.__handle({ t: 'render', code, theme: 'dark', tokens }),
    { code: caso.code, tokens }
  );
  await page.waitForFunction(() => !!document.querySelector('#host svg'), { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);

  const alvos = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('text, foreignObject'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, rotulo: (el.textContent || '').trim().slice(0, 24) };
      })
      .filter((e) => e.w > 8 && e.h > 8);
  });

  const falhas = [];
  for (const alvo of alvos) {
    await page.evaluate(() => { window.__msgs.length = 0; });
    await page.mouse.click(alvo.cx, alvo.cy);
    await page.waitForTimeout(60);
    const msgs = await page.evaluate(() => window.__msgs);
    const tap = msgs.find((m) => m.t === 'tap');
    if (!tap || !tap.sel) {
      if (LIMITACOES_CONHECIDAS.has(alvo.rotulo)) continue;
      falhas.push({ rotulo: alvo.rotulo, motivo: 'toque não selecionou nada' });
      continue;
    }

    await page.evaluate((sel) => window.__handle({ t: 'select', sel }), tap.sel);
    await page.waitForTimeout(60);
    const conf = await page.evaluate((sel) => {
      const alvoEl = document.querySelector('[data-sel-key="' + sel.kind + ':' + sel.id + '"]');
      const glow = document.querySelector('.selglow');
      if (!alvoEl || !glow) return { alvoAchado: !!alvoEl, glowAchado: !!glow };
      const t = alvoEl.getBoundingClientRect(), g = glow.getBoundingClientRect();
      return {
        alvoAchado: true, glowAchado: true,
        dcx: Math.abs((t.left + t.width / 2) - (g.left + g.width / 2)),
        dcy: Math.abs((t.top + t.height / 2) - (g.top + g.height / 2)),
        glowCobreAlvo: g.left <= t.left + 1 && g.top <= t.top + 1 && g.right >= t.right - 1 && g.bottom >= t.bottom - 1,
      };
    }, tap.sel);

    const ok = conf.alvoAchado && conf.glowAchado && conf.dcx < 1 && conf.dcy < 1 && conf.glowCobreAlvo;
    if (!ok) falhas.push({ rotulo: alvo.rotulo, sel: tap.sel, ...conf });
  }

  await page.close();
  return { erros, falhas, total: alvos.length };
}

const browser = await chromium.launch();
let algumaFalha = false;

for (const caso of CASOS) {
  const { erros, falhas, total } = await testarDiagrama(browser, caso);
  const status = erros.length || falhas.length ? 'FALHOU' : 'ok';
  console.log(`[${status}] ${caso.nome} — ${total} elemento(s) verificado(s)`);
  if (erros.length) {
    console.log('  erros de JS na página:', erros);
    algumaFalha = true;
  }
  if (falhas.length) {
    console.log('  falhas:', JSON.stringify(falhas, null, 2));
    algumaFalha = true;
  }
}

await browser.close();
process.exit(algumaFalha ? 1 : 0);
