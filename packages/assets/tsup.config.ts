import { defineConfig } from 'tsup';

export default defineConfig({
  // `node.ts` is a separate entry so a browser bundle never traces node:fs.
  entry: ['src/index.ts', 'src/node.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
