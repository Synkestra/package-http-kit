import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    external: [
        'express',
        'cors',
        'jsonwebtoken',
        'zod',
        'prom-client',
    ],
    noExternal: [],
    platform: 'node',
});
