# Diagramas do projeto

Cinco fluxos em Mermaid — o próprio editor de Mermaid, documentado com Mermaid. Comece por
aqui antes de ler os docs individuais: dá a visão de relance da arquitetura e dos fluxos
centrais. Cada diagrama linka o doc que o detalha.

## 1. Arquitetura em camadas

`domain/` não importa nada de `features/`, `design/` ou `store/` — é a regra que mantém o
projeto escalável. Ver [02-setup-e-estrutura.md](02-setup-e-estrutura.md).

```mermaid
graph TD
    APP["app/ (rotas expo-router)"]
    FEATURES["features/ (diagram, code, document, gallery, ai, library)"]
    STORE["store/ (useDoc, useLibrary, useSettings, history)"]
    DESIGN["design/ (tokens, tema, componentes base)"]
    DOMAIN["domain/ (types, serialize, parse, catalog, mutations)<br/>TypeScript puro — zero dependência de UI"]
    SERVICES["services/ (storage, export, share, haptics, ai)"]

    APP --> FEATURES
    APP --> DESIGN
    FEATURES --> STORE
    FEATURES --> DESIGN
    FEATURES --> SERVICES
    STORE --> DOMAIN
    FEATURES -.->|"serialize/parse/mutations, nunca o contrário"| DOMAIN
    SERVICES --> DOMAIN

    style DOMAIN fill:#0A84FF,color:#fff,stroke:#0A84FF
```

## 2. Ponte RN ↔ WebView

O WebView é um componente burro: desenha e reporta toques. Ver [06-canvas.md](06-canvas.md).

```mermaid
sequenceDiagram
    participant Store as useDoc (RN)
    participant Bridge as bridge.ts (RN)
    participant Web as runtime.html (WebView)

    Store->>Bridge: doc muda -> serialize(doc)
    Bridge->>Web: injectJavaScript(ToWeb: render)
    Web->>Web: mermaid.render + desenha seleção
    Web-->>Bridge: postMessage(FromWeb: ready)
    Note over Web: usuário toca num elemento
    Web-->>Bridge: postMessage(FromWeb: tap, sel)
    Bridge->>Store: select(sel)
    Store->>Bridge: injectJavaScript(ToWeb: select)
    Web->>Web: desenha o destaque da seleção
```

## 3. Ciclo do modelo — a "regra de ouro"

O texto Mermaid nunca é editado por regex durante a interação: é derivado do modelo e é
entrada do modelo. Ver [04-dominio.md](04-dominio.md).

```mermaid
flowchart LR
    Doc["Doc (FlowDoc/ErDoc/...)"] -->|serialize| Texto["texto Mermaid"]
    Texto -->|render no canvas| Toque["toque do usuário"]
    Toque -->|3 camadas de seleção| Sel["Selection (kind:id)"]
    Sel -->|mutação pura| NovoDoc["novo Doc"]
    NovoDoc -->|serialize| Texto2["texto Mermaid atualizado"]
    NovoDoc -.->|apply, empilha undo| Doc

    style Doc fill:#0A84FF,color:#fff
    style NovoDoc fill:#0A84FF,color:#fff
```

## 4. Ida e volta documento ↔ diagrama

Um bloco ` ```mermaid ` dentro de um `.md` abre no canvas e volta atualizado, recortado no
offset exato. Ver [10-markdown.md](10-markdown.md).

```mermaid
sequenceDiagram
    participant Leitor as Modo Ler (.md)
    participant EstadoMd as retornoMd (useDoc)
    participant Canvas as DiagramScreen

    Leitor->>Leitor: toca em "Editar" no bloco mermaid
    Leitor->>EstadoMd: guarda {docId, md, ini, fim}
    Leitor->>Canvas: abrirDoc(parseMermaid(corpo do bloco))
    Note over Canvas: edição normal — toque, barra de ações, IA...
    Canvas->>EstadoMd: voltarParaDocumento()
    EstadoMd->>EstadoMd: md.slice(0,ini) + serialize(doc) + md.slice(fim)
    EstadoMd->>Leitor: abrirDoc(documento com o md atualizado)
```

## 5. Roteiro de build

Estado no momento desta versão do arquivo — a fonte viva é o
[CHECKLIST.md](../CHECKLIST.md), atualize este diagrama se o status mudar (regra de
manutenção no topo do [CLAUDE.md](../CLAUDE.md)).

```mermaid
flowchart TD
    E0["Etapa 0 — Scaffold"]:::done --> E1["Etapa 1 — Domínio"]:::done
    E1 --> E2["Etapa 2 — Design system"]:::done
    E2 --> E3["Etapa 3 — Canvas renderiza"]:::done
    E3 --> E4["Etapa 4 — Ponte de toque"]:::done
    E4 --> E5["Etapa 5 — Store + código com realce"]:::done
    E5 --> E6["Etapa 6 — Barra de ações + compositor"]:::done
    E6 --> E7["Etapa 7 — Inspetores nó/aresta"]:::done
    E7 --> E8["Etapa 8 — Seleção camadas 2/3 (ER, texto)"]:::done
    E8 --> E9["Etapa 9 — Inspetores tabela/coluna/relação"]:::done
    E9 --> E10["Etapa 10 — Galeria dos 25 tipos"]:::done
    E10 --> E11["Etapa 11 — Documentos Markdown"]:::done
    E11 --> E12["Etapa 12 — Diagramas embutidos"]:::done
    E12 --> E13["Etapa 13 — Biblioteca (SQLite)"]:::done
    E13 --> E14["Etapa 14 — Exportar/compartilhar/importar"]:::done
    E14 --> E15["Etapa 15 — IA"]:::done
    E15 --> E16["Etapa 16 — Acessibilidade e polimento"]:::done

    classDef done fill:#30D158,color:#fff,stroke:#30D158
    classDef pendente fill:#3A3A3C,color:#fff,stroke:#3A3A3C
```
