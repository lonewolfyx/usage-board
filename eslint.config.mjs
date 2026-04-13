import antfu from '@antfu/eslint-config'
import withNuxt from './.nuxt/eslint.config.mjs'

export default antfu({
    vue: {
        overrides: {
            'vue/block-order': [
                'error',
                {
                    order: ['template', 'script', 'style'],
                },
            ],
        },
    },
    stylistic: {
        indent: 4,
        quotes: 'single',
    },
    yaml: {
        overrides: {
            'yaml/indent': ['error', 2],
        },
    },
    rules: {
        'no-console': 'off',
        'regexp/no-unused-capturing-group': 'off',
        'node/prefer-global/process': 'off',
    },
}).append(withNuxt)
