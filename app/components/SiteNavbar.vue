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
            <div
                v-for="item in navItems"
                :key="item.label"
                :class="getNavItemClass(item)"
            >
                <Icon v-if="item.iconType === 'icon'" :name="item.icon" class="size-5" mode="svg" />
                <IconAi v-else :name="item.icon" />
                <span class="capitalize text-xs font-medium font-mono">{{ item.label }}</span>
            </div>
        </div>
    </header>
</template>

<script lang="ts" setup>
import ModeSwitcher from '~/components/ModeSwitcher.vue'
import SiteLogo from '~/components/SiteLogo.vue'
import { cn } from '~/lib/utils'

type AiIconName
    = | 'amp'
        | 'antigravity'
        | 'claude_code'
        | 'codex'
        | 'copilot'
        | 'cursor'
        | 'gemini'
        | 'kimi_code'
        | 'open_code'

type NavItem
    = | {
        icon: string
        iconType: 'icon'
        isActive: true
        label: string
    }
    | {
        icon: AiIconName
        iconFillClass: string
        iconType: 'ai'
        isActive?: false
        label: string
    }

defineOptions({
    name: 'SiteNavbar',
})

const navItems = [
    {
        icon: 'solar:home-bold-duotone',
        iconType: 'icon',
        isActive: true,
        label: 'home',
    },
    {
        icon: 'claude_code',
        iconFillClass: '[&_svg]:fill-foreground/50',
        iconType: 'ai',
        label: 'Claude Code',
    },
    {
        icon: 'codex',
        iconFillClass: '[&_svg]:fill-foreground/50',
        iconType: 'ai',
        label: 'Codex',
    },
    {
        icon: 'cursor',
        iconFillClass: '[&_svg]:fill-foreground/50',
        iconType: 'ai',
        label: 'Cursor',
    },
    {
        icon: 'open_code',
        iconFillClass: '[&_svg]:fill-foreground/50',
        iconType: 'ai',
        label: 'open code',
    },
    {
        icon: 'copilot',
        iconFillClass: '[&_svg]:fill-foreground/50',
        iconType: 'ai',
        label: 'copilot',
    },
    {
        icon: 'gemini',
        iconFillClass: '[&_svg]:fill-foreground/50',
        iconType: 'ai',
        label: 'gemini',
    },
    {
        icon: 'kimi_code',
        iconFillClass: '[&_svg]:fill-foreground/50',
        iconType: 'ai',
        label: 'Kimi',
    },
    {
        icon: 'antigravity',
        iconFillClass: '[&_svg]:fill-foreground/50',
        iconType: 'ai',
        label: 'antigravity',
    },
    {
        icon: 'amp',
        iconFillClass: '[&_path]:fill-current!',
        iconType: 'ai',
        label: 'amp',
    },
] satisfies NavItem[]

function getNavItemClass(item: NavItem) {
    return cn(
        'relative flex flex-col items-center gap-1.5',
        item.isActive
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
