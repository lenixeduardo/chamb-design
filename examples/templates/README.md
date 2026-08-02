# Exemplos de template

Uma página exportada por modelo, gerada por
[`scripts/generate-template-examples.mjs`](../../scripts/generate-template-examples.mjs).
Não edite à mão — rode o script:

```bash
pnpm build && node scripts/generate-template-examples.mjs
```

Cada pasta é o que o exportador HTML produz para o documento do modelo: um
`index.html` sem dependências e um `styles.css` com os tokens do tema chamb
como variáveis CSS. Abra o arquivo direto no navegador.

| Exemplo | Blueprint | Seções | Hero | Descrição |
| --- | --- | --- | --- | --- |
| [`saas`](saas/index.html) | `tpl:saas` | 10 | biblioteca | Página de produto completa: prova social, funcionalidades, métricas, planos e FAQ. |
| [`landing`](landing/index.html) | `tpl:landing` | 7 | biblioteca | Uma página de conversão enxuta: promessa, prova, benefícios e chamada final. |
| [`waitlist`](waitlist/index.html) | `tpl:waitlist` | 5 | biblioteca | Pré-lançamento: uma promessa, três motivos e um campo de e-mail. |
| [`portfolio`](portfolio/index.html) | `tpl:portfolio` | 6 | biblioteca | Apresentação pessoal, trabalhos selecionados e um caminho direto para o contato. |
| [`agency`](agency/index.html) | `tpl:agency` | 7 | biblioteca | Serviços, clientes e prova de trabalho, terminando num formulário de contato. |
| [`store`](store/index.html) | `tpl:store` | 7 | biblioteca | Página de venda de um produto físico ou digital, do detalhe à garantia. |
| [`app`](app/index.html) | `tpl:app` | 5 | biblioteca | Casca de aplicação: navegação lateral, KPIs, gráfico, tabela e pipeline. |
| [`saas-hero-21st`](saas-hero-21st/index.html) | `tpl:saas` | 10 | 21st.dev | Página de produto completa: prova social, funcionalidades, métricas, planos e FAQ. |

Um detalhe de idioma: o texto que o blueprint controla está em português, e o
conteúdo de exemplo que vive dentro de cada bloco (os cartões de
funcionalidades, os depoimentos, o FAQ) continua no inglês neutro da
biblioteca — blocos são language-neutral de propósito, e a cópia deles é o
primeiro campo que qualquer pessoa edita no canvas.

A última linha é o mesmo blueprint de SaaS com a hero vinda do
[21st.dev](../../docs/MCP_21ST.md), a partir de uma resposta gravada — o que
está sendo mostrado é a conversão (JSX → nós → tokens → CSS), que não deve
depender de uma chave de API para ser vista.
