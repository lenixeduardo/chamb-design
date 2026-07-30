import { defineConfig } from 'tsup';

export default defineConfig({
  // The renderer entry is Node-only (it drives a headless browser), so it is a
  // separate bundle — a web build must never trace @remotion/renderer.
  entry: ['src/index.ts', 'src/render.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'remotion', '@remotion/renderer', '@remotion/bundler'],
});
