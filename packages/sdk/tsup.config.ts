import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'next/index': 'src/next/index.ts',
    'express/index': 'src/express/index.ts',
    'react/index': 'src/react/index.tsx',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['next', 'express'],
});
