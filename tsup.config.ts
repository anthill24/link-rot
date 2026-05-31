import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    index: 'src/index.ts',
  },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  // Bundle all dependencies into dist so the published package and the
  // GitHub Action can run without a node_modules install at runtime.
  noExternal: [/.*/],
  dts: { entry: { index: 'src/index.ts' } },
  clean: true,
  sourcemap: false,
  minify: false,
  splitting: false,
  shims: false,
});
