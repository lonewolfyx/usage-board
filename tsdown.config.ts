import { defineConfig } from 'tsdown'

export default defineConfig({
    clean: false,
    deps: {
        onlyBundle: false,
        neverBundle: ['esbuild'],
    },
    format: 'esm',
    shims: true,
})
