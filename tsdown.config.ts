import { defineConfig } from 'tsdown'

export default defineConfig({
    clean: false,
    deps: {
        onlyBundle: false,
        neverBundle: ['esbuild'],
    },
    target: 'node18',
    platform: 'node',
    format: 'esm',
    shims: true,
})
