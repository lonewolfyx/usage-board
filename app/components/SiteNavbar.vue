<template>
    <header class="flex flex-col border-b z-10 mb-5">
        <div class="container mx-auto flex items-center justify-between gap-3">
            <div class="flex flex-col h-14">
                <div class="flex items-center gap-4 h-full">
                    <img alt="" class="size-8" src="/logo.svg">
                    <SiteLogo class="w-48 fill-foreground" />
                </div>
            </div>
            <div class="flex items-center">
                <GitHubLink />
                <ModeSwitcher />
            </div>
        </div>
        <Separator />
        <div class="container mx-auto flex items-center justify-between pt-3 pb-1">
            <NuxtLink
                v-for="item in navItems"
                :key="item.label"
                :class="getNavItemClass(item)"
                :to="item.link"
            >
                <Icon v-if="item.iconType === 'icon'" :name="item.icon" class="size-5" mode="svg" />
                <IconAi v-else :name="item.icon" />
                <span class="capitalize text-xs font-medium font-mono">{{ item.label }}</span>
            </nuxtlink>
        </div>
    </header>
</template>

<script lang="ts" setup>
import ModeSwitcher from '~/components/ModeSwitcher.vue'
import SiteLogo from '~/components/SiteLogo.vue'
import { cn } from '~/lib/utils'

defineOptions({
    name: 'SiteNavbar',
})

const navItems = [
    {
        icon: 'solar:home-bold-duotone',
        iconType: 'icon',
        label: 'home',
        link: '/',
    },
    {
        icon: 'claude_code',
        iconFillClass: '[&_svg]:fill-foreground/50',
        iconType: 'ai',
        label: 'Claude Code',
        link: '/claude_code',
    },
    {
        icon: 'codex',
        iconFillClass: '[&_svg]:fill-foreground/50',
        iconType: 'ai',
        label: 'Codex',
        link: '/codex',
    },
    // {
    //     icon: 'cursor',
    //     iconFillClass: '[&_svg]:fill-foreground/50',
    //     iconType: 'ai',
    //     label: 'Cursor',
    //     link: '/cursor',
    // },
    // {
    //     icon: 'open_code',
    //     iconFillClass: '[&_svg]:fill-foreground/50',
    //     iconType: 'ai',
    //     label: 'open code',
    //     link: '/open_code',
    // },
    // {
    //     icon: 'copilot',
    //     iconFillClass: '[&_svg]:fill-foreground/50',
    //     iconType: 'ai',
    //     label: 'copilot',
    //     link: '/copilot',
    // },
    {
        icon: 'gemini',
        iconFillClass: '[&_svg]:fill-foreground/50',
        iconType: 'ai',
        label: 'gemini',
        link: '/gemini',
    },
    // {
    //     icon: 'kimi_code',
    //     iconFillClass: '[&_svg]:fill-foreground/50',
    //     iconType: 'ai',
    //     label: 'Kimi',
    //     link: '/kimi',
    // },
    // {
    //     icon: 'antigravity',
    //     iconFillClass: '[&_svg]:fill-foreground/50',
    //     iconType: 'ai',
    //     label: 'antigravity',
    //     link: '/antigravity',
    // },
    // {
    //     icon: 'amp',
    //     iconFillClass: '[&_path]:fill-current!',
    //     iconType: 'ai',
    //     label: 'amp',
    //     link: '/amp',
    // },
] satisfies NavItem[]

const route = useRoute()

const path = computed(() => route.path)

function getNavItemClass(item: NavItem) {
    const isActive = path.value === item.link

    return cn(
        'relative flex flex-col items-center gap-1.5',
        isActive
            ? [
                    'after:content-[\'\'] after:absolute after:w-full after:h-px after:bg-amber-500',
                    'after:-bottom-1 after:rounded-2xl',
                ]
            : [
                    'text-foreground/50',
                    item.iconFillClass,
                ],
    )
}
</script>

<style scoped>

</style>
