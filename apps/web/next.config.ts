import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript-authored ESM; Next compiles them in place
  // so `pnpm dev` picks up edits without a separate watch build.
  transpilePackages: [
    '@opendesign/core',
    '@opendesign/design-system',
    '@opendesign/renderer',
    '@opendesign/components',
    '@opendesign/exporters',
    '@opendesign/editor',
    '@opendesign/ai',
    '@opendesign/assets',
    '@opendesign/plugin-charts',
    '@opendesign/plugin-chamb-brand',
    '@opendesign/plugin-remotion',
  ],
};

export default config;
