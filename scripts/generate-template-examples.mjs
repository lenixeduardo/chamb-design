/**
 * One exported example per model template.
 *
 *   node scripts/generate-template-examples.mjs
 *
 * Builds every blueprint into a real `DesignDocument`, runs it through the HTML
 * exporter, and writes the result to `examples/templates/<id>/`. The pages are
 * genuine output — the same path the app takes — so a diff here is a real
 * regression in a blueprint, a block or the style compiler, not in a fixture
 * someone typed by hand.
 *
 * Node ids come from a seeded RNG, so regenerating an unchanged template
 * produces a byte-identical file and the diff stays readable.
 *
 * The last example exercises the 21st.dev path with a recorded snippet instead
 * of a live call: the conversion (JSX -> nodes -> tokens -> CSS) is the part
 * worth showing, and it must not depend on an API key to be shown.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createId, seededRng, setIdRng, validateDocumentIntegrity } from '@opendesign/core';
import { BUILTIN_COMPONENTS } from '@opendesign/components';
import { chambThemes, chambTokens } from '@opendesign/plugin-chamb-brand';
import { TEMPLATE_BLUEPRINTS, buildTemplate } from '@opendesign/templates';
import { generateHeroSection } from '@opendesign/mcp';
import { htmlExporter } from '@opendesign/exporters';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT ?? path.join(root, 'examples/templates');

/** A recorded 21st.dev answer, trimmed to the component it returns. */
const RECORDED_21ST_ANSWER = `Here is a hero section for your product.

\`\`\`tsx
export function Hero() {
  return (
    <section className="w-full bg-background py-24 px-6 flex flex-col items-center">
      <div className="max-w-3xl flex flex-col items-center gap-6">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Financeiro para clínicas
        </span>
        <h1 className="text-4xl md:text-6xl font-semibold text-foreground text-center">
          O fechamento do mês em uma tarde
        </h1>
        <p className="text-lg text-muted-foreground text-center max-w-xl">
          Conciliação automática, repasses por profissional e relatórios que o contador aceita
          sem pedir a planilha de volta.
        </p>
        <div className="flex gap-3">
          <button className="bg-primary text-primary-foreground rounded-md px-6 py-3 font-medium">
            Testar grátis
          </button>
          <a href="/demo" className="border border-border rounded-md px-6 py-3 text-foreground">
            Ver demonstração
          </a>
        </div>
      </div>
    </section>
  );
}
\`\`\`
`;

const brand = () => ({
  components: BUILTIN_COMPONENTS,
  tokens: chambTokens(),
  themes: chambThemes(),
  activeThemeId: 'chamb-light',
});

async function writeExample(slug, document, note) {
  const integrity = validateDocumentIntegrity(document);
  if (!integrity.ok) throw new Error(`${slug}: ${integrity.errors.slice(0, 3).join('; ')}`);

  const directory = path.join(OUT, slug);
  fs.mkdirSync(directory, { recursive: true });

  for (const file of await htmlExporter.generate(document)) {
    fs.writeFileSync(path.join(directory, file.path), file.contents);
  }

  const nodes = Object.keys(document.nodes).length;
  console.log(`${slug.padEnd(18)} ${String(nodes).padStart(4)} nós  ${note}`);
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  const index = [];

  for (const [position, blueprint] of TEMPLATE_BLUEPRINTS.entries()) {
    // One seed per template, so adding a template never renumbers the others.
    setIdRng(seededRng(100 + position));

    const slug = blueprint.id.replace('tpl:', '');
    const { document, skipped } = buildTemplate(blueprint, brand());
    if (skipped.length > 0) throw new Error(`${slug}: blocos ausentes ${skipped.join(', ')}`);

    await writeExample(slug, document, `${blueprint.sections.length} seções · hero da biblioteca`);
    index.push({ slug, blueprint, hero: 'biblioteca' });
  }

  // The 21st.dev variant: same blueprint, generated above-the-fold section.
  setIdRng(seededRng(200));
  const saas = TEMPLATE_BLUEPRINTS.find((entry) => entry.id === 'tpl:saas');
  const client = { generateComponent: async () => ({ text: RECORDED_21ST_ANSWER, tool: 'generate' }) };
  const hero = await generateHeroSection({
    request: 'saas de gestão financeira para clínicas',
    client,
    createId,
  });

  if (hero.source !== '21st.dev') throw new Error(`hero caiu no fallback: ${hero.warnings.join('; ')}`);

  const { document } = buildTemplate(saas, {
    ...brand(),
    name: 'SaaS + hero 21st.dev',
    hero: { nodes: hero.nodes, rootId: hero.rootId },
  });

  await writeExample('saas-hero-21st', document, `hero convertida do 21st.dev (${hero.nodes.length} nós)`);
  index.push({ slug: 'saas-hero-21st', blueprint: saas, hero: '21st.dev' });

  fs.writeFileSync(path.join(OUT, 'README.md'), readme(index));
  console.log(`\n${index.length} exemplos em ${path.relative(root, OUT)}`);
}

function readme(entries) {
  const rows = entries
    .map(
      ({ slug, blueprint, hero }) =>
        `| [\`${slug}\`](${slug}/index.html) | \`${blueprint.id}\` | ${blueprint.sections.length} | ${hero} | ${blueprint.description} |`,
    )
    .join('\n');

  return `# Exemplos de template

Uma página exportada por modelo, gerada por
[\`scripts/generate-template-examples.mjs\`](../../scripts/generate-template-examples.mjs).
Não edite à mão — rode o script:

\`\`\`bash
pnpm build && node scripts/generate-template-examples.mjs
\`\`\`

Cada pasta é o que o exportador HTML produz para o documento do modelo: um
\`index.html\` sem dependências e um \`styles.css\` com os tokens do tema chamb
como variáveis CSS. Abra o arquivo direto no navegador.

| Exemplo | Blueprint | Seções | Hero | Descrição |
| --- | --- | --- | --- | --- |
${rows}

Um detalhe de idioma: o texto que o blueprint controla está em português, e o
conteúdo de exemplo que vive dentro de cada bloco (os cartões de
funcionalidades, os depoimentos, o FAQ) continua no inglês neutro da
biblioteca — blocos são language-neutral de propósito, e a cópia deles é o
primeiro campo que qualquer pessoa edita no canvas.

A última linha é o mesmo blueprint de SaaS com a hero vinda do
[21st.dev](../../docs/MCP_21ST.md), a partir de uma resposta gravada — o que
está sendo mostrado é a conversão (JSX → nós → tokens → CSS), que não deve
depender de uma chave de API para ser vista.
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
