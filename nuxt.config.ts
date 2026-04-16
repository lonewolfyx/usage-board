import tailwindcss from '@tailwindcss/vite'
import { version } from './package.json'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    modules: [
        // '@nuxt/content',
        '@nuxt/eslint',
        '@nuxt/icon',
        '@vueuse/nuxt',
        'shadcn-nuxt',
    ],

    ssr: false,

    devtools: {
        enabled: true,
    },

    app: {
        head: {
            title: 'Tokens Usage Analysis',
            viewport: 'width=device-width,initial-scale=1',
            link: [
                { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
                { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' },
            ],
            meta: [
                { name: 'viewport', content: 'width=device-width, initial-scale=1' },
                { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
            ],
        },
    },

    css: [
        '~/assets/css/main.css',
    ],
    compatibilityDate: '2026-04-13',

    runtimeConfig: {
        public: {
            appVersion: version,
        },
    },

    nitro: {
        preset: 'static',
        output: {
            dir: './dist',
        },
        routeRules: {
            '/': {
                prerender: true,
            },
            '/200.html': {
                prerender: true,
            },
            '/404.html': {
                prerender: true,
            },
            '/*': {
                prerender: false,
            },
        },
        sourceMap: false,
    },

    vite: {
        plugins: [
            tailwindcss(),
        ],
        optimizeDeps: {
            include: [
                '@unovis/vue',
                '@lonewolfyx/utils',
                'reka-ui',
                'clsx',
                'tailwind-merge',
            ],
        },
    },

    eslint: {
        config: {
            stylistic: {
                indent: 4, // 4, or 'tab'
                quotes: 'single', // or 'double'
            },
        },
    },

    shadcn: {
        prefix: '',
        componentDir: './app/components/ui',
    },
})
