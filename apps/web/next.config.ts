import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The dev indicator's default corner sits exactly on top of the first item in
  // the editor's mobile bottom nav, so at 390px that tab cannot be tapped in
  // `pnpm dev` at all. It is a development-only overlay, but it makes the
  // mobile layout untestable in the one place people test it.
  devIndicators: { position: 'bottom-right' },
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
