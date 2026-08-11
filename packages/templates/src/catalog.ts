import type { TemplateBlueprint } from './blueprint.js';

/**
 * The model templates.
 *
 * A blueprint is a *section order plus copy*, not a document: it names blocks
 * by contribution id and lets the registry resolve them. That is what keeps a
 * template working when a brand plugin retheme the project — the pricing table
 * in a SaaS page is the same pricing table everyone else gets, wearing the
 * active theme.
 *
 * Copy is Portuguese because that is what this product's users read; the
 * keywords are bilingual because a request arrives in either language.
 */

const saas: TemplateBlueprint = {
  id: 'tpl:saas',
  name: 'SaaS',
  category: 'Templates',
  intent: 'saas',
  description: 'Página de produto completa: prova social, funcionalidades, métricas, planos e FAQ.',
  keywords: [
    'saas',
    'software as a service',
    'produto',
    'product',
    'assinatura',
    'subscription',
    'plano',
    'planos',
    'pricing',
    'preços',
    'b2b',
    'trial',
    'dashboard product',
  ],
  meta: {
    title: 'SaaS — página de produto',
    description:
      'Landing de produto SaaS com prova social, funcionalidades, planos e perguntas frequentes.',
  },
  thumbnail: '/images/templates/saas-template.png',
  sections: [
    {
      block: 'lib:navbar',
      props: { links: 'Produto,Funcionalidades,Preços,Docs', cta: 'Testar grátis' },
    },
    {
      block: 'lib:hero-split',
      hero: true,
      props: {
        title: 'O painel que sua equipe abre primeiro',
        subtitle:
          'Conecte suas fontes de dados, acompanhe o que importa e compartilhe com o time — sem planilha no meio do caminho.',
        primaryCta: 'Testar grátis',
        secondaryCta: 'Ver demonstração',
        topic: 'product',
      },
    },
    { block: 'lib:logo-cloud', props: { title: 'Equipes que já usam' } },
    { block: 'lib:feature-grid', props: { title: 'Tudo que a operação precisa', columns: 3 } },
    // A dashboard widget doing duty as a marketing proof point: it needs the
    // section padding the Dashboard blocks deliberately do not carry.
    { block: 'lib:stat-grid', wrap: true, props: { columns: 4 } },
    { block: 'lib:testimonials', props: { title: 'Quem usa, conta' } },
    {
      block: 'lib:pricing-table',
      props: {
        title: 'Preços previsíveis',
        subtitle: 'Comece de graça e mude de plano quando o time crescer.',
      },
    },
    { block: 'lib:faq', props: { title: 'Perguntas frequentes' } },
    {
      block: 'lib:cta-banner',
      props: {
        title: 'Pronto para começar?',
        subtitle: 'Crie sua conta em menos de um minuto — sem cartão de crédito.',
        cta: 'Criar conta',
      },
    },
    { block: 'lib:footer', props: { tagline: 'O painel que sua equipe abre primeiro.' } },
  ],
};

const landing: TemplateBlueprint = {
  id: 'tpl:landing',
  name: 'Landing page',
  category: 'Templates',
  intent: 'landing',
  description: 'Uma página de conversão enxuta: promessa, prova, benefícios e chamada final.',
  keywords: [
    'landing',
    'landing page',
    'lançamento',
    'launch',
    'campanha',
    'campaign',
    'conversão',
    'conversion',
    'one page',
    'página única',
    'marketing',
    'anúncio',
  ],
  meta: {
    title: 'Landing page',
    description: 'Página de conversão com promessa, prova social, benefícios e chamada final.',
  },
  thumbnail: '/images/templates/landing-page-template.png',
  sections: [
    {
      block: 'lib:navbar',
      props: { links: 'Como funciona,Benefícios,Depoimentos', cta: 'Quero começar' },
    },
    {
      block: 'lib:hero-centered',
      hero: true,
      props: {
        eyebrow: 'Novo',
        title: 'Resolva em minutos o que hoje leva a semana inteira',
        subtitle:
          'Uma promessa clara, uma ação só. O resto da página existe para tirar a última dúvida antes do clique.',
        primaryCta: 'Começar agora',
        secondaryCta: 'Ver como funciona',
        topic: 'workspace',
      },
    },
    { block: 'lib:logo-cloud', props: { title: 'Já usado por' } },
    {
      block: 'lib:gallery',
      props: {
        title: 'O produto em uma tela',
        columns: 1,
        items: 'Tudo o que a página promete, em funcionamento',
        topic: 'product',
      },
    },
    { block: 'lib:feature-grid', props: { title: 'Por que funciona', columns: 3 } },
    { block: 'lib:testimonials', props: { title: 'Resultados reais' } },
    {
      block: 'lib:cta-banner',
      props: {
        title: 'Comece hoje',
        subtitle: 'Leva dois minutos e você já sai com o primeiro resultado.',
        cta: 'Começar agora',
      },
    },
    { block: 'lib:footer', props: { tagline: 'Uma promessa, uma ação.' } },
  ],
};

const waitlist: TemplateBlueprint = {
  id: 'tpl:waitlist',
  name: 'Lista de espera',
  category: 'Templates',
  intent: 'waitlist',
  description: 'Pré-lançamento: uma promessa, três motivos e um campo de e-mail.',
  keywords: [
    'waitlist',
    'lista de espera',
    'pré-lançamento',
    'pre launch',
    'prelaunch',
    'early access',
    'acesso antecipado',
    'beta',
    'coming soon',
    'em breve',
    'newsletter',
    'captura de email',
  ],
  meta: {
    title: 'Lista de espera',
    description: 'Página de pré-lançamento com captura de e-mail.',
  },
  thumbnail: '/images/templates/lista-espera-template.png',
  sections: [
    { block: 'lib:navbar', props: { links: 'O produto,Novidades', cta: 'Entrar na lista' } },
    {
      block: 'lib:hero-centered',
      hero: true,
      props: {
        eyebrow: 'Em breve',
        title: 'Estamos construindo algo melhor',
        subtitle:
          'Entre na lista e receba o convite antes de todo mundo — junto com o que estamos aprendendo no caminho.',
        primaryCta: 'Entrar na lista',
        secondaryCta: 'Saber mais',
        topic: 'abstract',
      },
    },
    { block: 'lib:feature-grid', props: { title: 'O que vem aí', columns: 3 } },
    {
      block: 'lib:newsletter',
      wrap: true,
      props: { title: 'Receba o convite primeiro', submitLabel: 'Entrar na lista' },
    },
    { block: 'lib:footer', props: { tagline: 'Em breve.' } },
  ],
};

const portfolio: TemplateBlueprint = {
  id: 'tpl:portfolio',
  name: 'Portfólio',
  category: 'Templates',
  intent: 'portfolio',
  description: 'Apresentação pessoal, trabalhos selecionados e um caminho direto para o contato.',
  keywords: [
    'portfolio',
    'portfólio',
    'pessoal',
    'personal',
    'freelancer',
    'designer',
    'developer',
    'desenvolvedor',
    'currículo',
    'resume',
    'cv',
    'trabalhos',
    'projetos',
  ],
  meta: {
    title: 'Portfólio',
    description: 'Portfólio com trabalhos selecionados e contato.',
  },
  thumbnail: '/images/templates/portfolio-template.png',
  sections: [
    { block: 'lib:navbar', props: { links: 'Trabalhos,Sobre,Contato', cta: 'Falar comigo' } },
    {
      block: 'lib:hero-split',
      hero: true,
      props: {
        title: 'Desenho produtos que as pessoas entendem de primeira',
        subtitle:
          'Dez anos entre pesquisa, interface e código. Abaixo, alguns trabalhos e o que mudou depois deles.',
        primaryCta: 'Ver trabalhos',
        secondaryCta: 'Falar comigo',
        visual: 'photo',
        topic: 'workspace',
      },
    },
    {
      block: 'lib:gallery',
      props: {
        title: 'Trabalhos selecionados',
        columns: 3,
        items:
          'Northwind — design system,Kestrel — app de campo,Lumen — marca e site,Vireo — painel de operações,Halcyon — editorial,Aster — identidade',
        topic: 'craft',
      },
    },
    { block: 'lib:testimonials', props: { title: 'O que dizem os clientes' } },
    {
      block: 'lib:contact-form',
      wrap: true,
      props: {
        title: 'Vamos conversar',
        subtitle: 'Conte o que você precisa — respondo em um dia útil.',
        submitLabel: 'Enviar mensagem',
      },
    },
    { block: 'lib:footer', props: { tagline: 'Disponível para novos projetos.' } },
  ],
};

const agency: TemplateBlueprint = {
  id: 'tpl:agency',
  name: 'Agência',
  category: 'Templates',
  intent: 'agency',
  description: 'Serviços, clientes e prova de trabalho, terminando num formulário de contato.',
  keywords: [
    'agência',
    'agency',
    'estúdio',
    'studio',
    'consultoria',
    'consulting',
    'serviços',
    'services',
    'clientes',
    'b2b services',
    'escritório',
  ],
  meta: {
    title: 'Agência',
    description: 'Site de agência com serviços, clientes e contato.',
  },
  thumbnail: '/images/templates/agencia-template.png',
  sections: [
    { block: 'lib:navbar', props: { links: 'Serviços,Cases,Time,Contato', cta: 'Pedir proposta' } },
    {
      block: 'lib:hero-centered',
      hero: true,
      props: {
        eyebrow: 'Estúdio de produto',
        title: 'Estratégia, design e entrega no mesmo time',
        subtitle:
          'Trabalhamos em ciclos curtos com quem decide, e entregamos coisa no ar — não apresentação.',
        primaryCta: 'Pedir proposta',
        secondaryCta: 'Ver cases',
        topic: 'team',
      },
    },
    { block: 'lib:logo-cloud', props: { title: 'Clientes' } },
    { block: 'lib:feature-grid', props: { title: 'O que fazemos', columns: 3 } },
    {
      block: 'lib:gallery',
      props: {
        title: 'Cases',
        columns: 3,
        items: 'Northwind — plataforma,Kestrel — rebrand,Lumen — e-commerce',
        topic: 'craft',
      },
    },
    { block: 'lib:testimonials', props: { title: 'O que dizem sobre o trabalho' } },
    {
      block: 'lib:contact-form',
      wrap: true,
      props: {
        title: 'Conte seu projeto',
        subtitle: 'Respondemos em um dia útil com uma primeira leitura do escopo.',
        submitLabel: 'Pedir proposta',
      },
    },
    { block: 'lib:footer', props: { tagline: 'Estratégia, design e entrega.' } },
  ],
};

const store: TemplateBlueprint = {
  id: 'tpl:store',
  name: 'Loja / produto',
  category: 'Templates',
  intent: 'store',
  description: 'Página de venda de um produto físico ou digital, do detalhe à garantia.',
  keywords: [
    'loja',
    'store',
    'ecommerce',
    'e-commerce',
    'comércio',
    'shop',
    'venda',
    'vender',
    'produto físico',
    'checkout',
    'infoproduto',
    'curso',
  ],
  meta: {
    title: 'Loja — página de produto',
    description: 'Página de venda com detalhes do produto, prova social e garantia.',
  },
  thumbnail: '/images/templates/product-template.png',
  sections: [
    { block: 'lib:navbar', props: { links: 'Produto,Entrega,Garantia', cta: 'Comprar' } },
    {
      block: 'lib:hero-split',
      hero: true,
      props: {
        title: 'Feito para durar mais que a próxima estação',
        subtitle:
          'Materiais escolhidos um a um, produção em série curta e envio em até dois dias úteis.',
        primaryCta: 'Comprar agora',
        secondaryCta: 'Ver detalhes',
        visual: 'photo',
        topic: 'retail',
      },
    },
    {
      block: 'lib:gallery',
      props: {
        title: 'Por dentro do produto',
        columns: 3,
        items: 'Costura reforçada,Tecido certificado,Acabamento à mão',
        topic: 'craft',
      },
    },
    { block: 'lib:feature-grid', props: { title: 'Feito para o dia a dia', columns: 3 } },
    { block: 'lib:testimonials', props: { title: 'Quem já comprou' } },
    { block: 'lib:faq', props: { title: 'Entrega, troca e garantia' } },
    {
      block: 'lib:cta-banner',
      props: {
        title: 'Leve o seu',
        subtitle: 'Frete grátis acima de R$ 300 e troca em 30 dias.',
        cta: 'Comprar agora',
      },
    },
    { block: 'lib:footer', props: { tagline: 'Feito para durar.' } },
  ],
};

const app: TemplateBlueprint = {
  id: 'tpl:app',
  name: 'App / dashboard',
  category: 'Templates',
  intent: 'app',
  description: 'Casca de aplicação: navegação lateral, KPIs, gráfico, tabela e pipeline.',
  keywords: [
    'app',
    'aplicação',
    'aplicativo',
    'dashboard',
    'painel',
    'admin',
    'backoffice',
    'interno',
    'internal tool',
    'crm',
    'métricas',
    'kpi',
    'relatório',
  ],
  meta: {
    title: 'App — dashboard',
    description: 'Casca de aplicação com navegação, indicadores e tabelas.',
  },
  sections: [
    {
      block: 'lib:app-sidebar',
      slot: 'aside',
      props: { items: 'Visão geral,Clientes,Negócios,Relatórios,Ajustes' },
    },
    { block: 'lib:stat-grid', hero: true, props: { columns: 4 } },
    { block: 'lib:chart-card', props: { title: 'Novos cadastros', summary: '1.284 nesta semana' } },
    {
      block: 'lib:data-table',
      props: { title: 'Pedidos recentes', columns: 'Cliente,Plano,Status,MRR' },
    },
    { block: 'lib:crm-pipeline', props: {} },
  ],
};

/** Every model template, in display order. */
export const TEMPLATE_BLUEPRINTS: TemplateBlueprint[] = [
  saas,
  landing,
  waitlist,
  portfolio,
  agency,
  store,
  app,
];

/**
 * What an unmatched request falls back to.
 *
 * A landing page is the safest default: it is the shortest blueprint that
 * still says something complete, so an over-broad request ("uma página para
 * meu produto") lands somewhere useful rather than on a dashboard shell.
 */
export const DEFAULT_BLUEPRINT_ID = 'tpl:landing';

export function getBlueprint(id: string): TemplateBlueprint | undefined {
  return TEMPLATE_BLUEPRINTS.find((blueprint) => blueprint.id === id);
}

export { saas, landing, waitlist, portfolio, agency, store, app };
