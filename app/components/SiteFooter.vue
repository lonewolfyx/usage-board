<template>
    <footer class="mt-8 border-t">
        <div class="container mx-auto flex flex-col items-center justify-between gap-2 py-4 text-center text-xs text-muted-foreground sm:flex-row sm:text-left">
            <p>
                Copyright © 2026
                <NuxtLink
                    class="font-medium text-foreground underline-offset-4 transition-colors hover:text-amber-600 hover:underline"
                    rel="noreferrer"
                    target="_blank"
                    to="https://github.com/lonewolfyx"
                >
                    lonewolfyx
                </NuxtLink>.
            </p>
            <p>
                Built with Nuxt, extended from ccusage, and released under the MIT License.
                Version {{ appVersion }}.
            </p>
        </div>
    </footer>
</template>

<script lang="ts" setup>
defineOptions({
    name: 'SiteFooter',
})

const { public: { appVersion } } = useRuntimeConfig()
</script>
