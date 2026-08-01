# Validação mobile — 390 × 844

Captura de todas as telas do app web em viewport de celular (iPhone 14: 390 ×
844, DPR 2, `isMobile`, pt-BR), rodando o build de produção em
`http://localhost:3000`.

Reproduzir:

```bash
pnpm build
pnpm --filter @opendesign/web start
node scripts/capture-mobile-screenshots.mjs
```

O script também grava [`overflow-audit.json`](overflow-audit.json): todo
elemento cuja caixa escapa da viewport. Isso importa porque o shell do editor é
`overflow-hidden` — a screenshot sozinha esconde a evidência, o painel some sem
deixar rastro de scroll.

## As telas

| #   | Arquivo                                                                                               | Tela                                                      |
| --- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 01  | [`01-workspace-vazio.png`](mobile/01-workspace-vazio.png)                                             | Área de trabalho, sem projetos                            |
| 02  | [`02-workspace-projetos.png`](mobile/02-workspace-projetos.png)                                       | Área de trabalho com projetos e pastas                    |
| 03  | [`03-workspace-busca-vazia.png`](mobile/03-workspace-busca-vazia.png)                                 | Busca sem resultado                                       |
| 04  | [`04-ajustes.png`](mobile/04-ajustes.png) · [`04b-ajustes-rolado.png`](mobile/04b-ajustes-rolado.png) | Diálogo de Ajustes (topo e rolado)                        |
| 05  | [`05-editor-camadas.png`](mobile/05-editor-camadas.png)                                               | Editor — aba Camadas                                      |
| 06  | [`06-editor-biblioteca.png`](mobile/06-editor-biblioteca.png)                                         | Editor — aba Biblioteca                                   |
| 07  | [`07-editor-recursos.png`](mobile/07-editor-recursos.png)                                             | Editor — aba Recursos                                     |
| 08  | [`08-editor-tema.png`](mobile/08-editor-tema.png)                                                     | Editor — aba Tema                                         |
| 09  | [`09-editor-selecao.png`](mobile/09-editor-selecao.png)                                               | Editor — camada selecionada                               |
| 10  | [`10-editor-sem-chat.png`](mobile/10-editor-sem-chat.png)                                             | Editor rolado na horizontal — o Inspector                 |
| 11  | [`11-editor-exportar.png`](mobile/11-editor-exportar.png)                                             | Diálogo de Exportação                                     |
| 12  | [`12-editor-overflow-real.png`](mobile/12-editor-overflow-real.png)                                   | Editor com `overflow` liberado — a largura real do layout |

## O que a validação mostrou

### 1. O editor não tem layout mobile — é o achado que domina o resto

`EditorShell` é uma linha flex fixa: aside 288 px + canvas + aside 288 px +
chat 320 px, dentro de um contêiner `overflow-hidden`. Em 390 px isso dá
**~900 px de conteúdo em 390 px de tela**: 75 elementos ficam fora da viewport
(`overflow-audit.json`).

Consequências concretas nas capturas 05–10:

- **O canvas nunca aparece.** O painel esquerdo ocupa 288 dos 390 px e o
  Inspector começa em 289 px — o canvas fica inteiramente atrás dele. Não há
  como ver o que se está editando.
- **Metade da barra superior está inacessível.** O nome do projeto, Exportar
  (x = 392 px) e AI (x = 496 px) estão fora da tela; o `overflow-hidden` impede
  qualquer scroll para alcançá-los.
- **O chat da IA é inalcançável**, mesmo aberto por padrão (`chatOpen = true`)
  — ele começa depois dos 900 px.
- O Inspector (captura 10) só apareceu porque um `focus` rolou o contêiner na
  horizontal. Não é navegação, é acidente — e mesmo assim o canvas continua
  invisível.

Nenhuma dessas telas é utilizável hoje em celular. Não é questão de ajuste de
espaçamento: falta uma decisão de layout (abas em tela cheia, drawers sobre o
canvas, ou uma barra inferior alternando canvas / camadas / inspector / chat).

### 2. Diálogos com largura fixa vazam da tela

O de Exportação (captura 11) é o pior: o botão **Baixar** está cortado no
canto, a lista de alvos corta em "Astro", e o preview de código fica quase todo
fora. O de Ajustes (04) se comporta bem porque é de coluna única — mas as
linhas de provedor apertam: "sem chave" quebra em duas linhas e o link
(`console.anthropic.com ↗`) encosta na borda direita.

### 3. Área de trabalho: quase certa, com uma quebra no cabeçalho

A home (01–03) é a única tela que responde de verdade — cards, empty state,
hero e busca empilham bem. Dois problemas:

- **A ação do cabeçalho estoura a margem.** "Novo projeto" termina em x = 387
  px, contra a borda de conteúdo em 366 px: 21 px além da goteira de 24 px, a
  3 px do vidro. O `flex-wrap` do `<header>` não ajuda porque o grupo interno
  de três botões não quebra. E "Código-fonte" quebra em duas linhas dentro de
  uma pílula de altura fixa.
- **Duplicar e Excluir só existem no hover.** Os `IconButton` dos cards são
  `opacity-0 group-hover:opacity-100` — em toque não há hover, então essas duas
  ações simplesmente não existem no celular.

### 4. Alvos de toque abaixo do mínimo

Todos os botões e campos medem **36 px** de altura (`h-9`), contra 44 px do iOS
e 48 px do Android. Os `IconButton` do editor são menores ainda. Vale um
tamanho maior em ponteiro grosso (`@media (pointer: coarse)`).

### 5. Detalhes de conteúdo notados de passagem

Não são bugs de mobile, mas aparecem nas capturas:

- Pluralização dos cards: "1 página · **1 camadas**" — `pageCount` é tratado,
  `nodeCount` não (`app/page.tsx:275`).
- A Biblioteca mistura idiomas: as abas e a busca estão em pt-BR, mas os títulos
  de seção ("PRIMITIVES", "BUTTONS", "CARDS", "CHARTS") e as descrições dos
  blocos ("Action button with variant and size props.") estão em inglês.
- A hero esconde o mascote abaixo de `md` (`hidden md:block`), como previsto —
  o watermark rotacionado continua e é o único elemento que sai da viewport na
  home, contido pelo `overflow-hidden` da seção. Comportamento correto.
