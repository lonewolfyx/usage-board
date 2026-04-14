<template>
    <header class="flex flex-col border-b z-10 mb-5">
        <div class="container mx-auto flex items-center justify-between gap-3">
            <div class="flex flex-col h-14">
                <div class="flex items-center gap-4 h-full">
                    <img alt="" class="size-8" src="/logo.svg">
                    <SiteLogo class="w-48 dark:fill-white" />
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
                :class="cn(
                    'relative flex flex-col items-center gap-1.5',
                    'after:content-[\'\'] after:absolute after:w-full after:h-px after:bg-amber-500',
                    'after:-bottom-1 after:rounded-2xl',
                )"
            >
                <Icon class="size-5" mode="svg" name="solar:home-bold-duotone" />
                <span class="capitalize text-xs font-medium font-mono">home</span>
            </div>
            <div
                :class="cn(
                    'relative flex flex-col items-center gap-1.5',
                    'text-foreground/50 [&_svg]:fill-foreground/50',
                )"
            >
                <IconAi name="claude_code" />
                <span class="capitalize text-xs font-medium font-mono">Claude Code</span>
            </div>
            <div
                :class="cn(
                    'relative flex flex-col items-center gap-1.5',
                    'text-foreground/50 [&_svg]:fill-foreground/50',
                )"
            >
                <IconAi name="codex" />
                <span class="capitalize text-xs font-medium font-mono">Codex</span>
            </div>
            <div
                :class="cn(
                    'relative flex flex-col items-center gap-1.5',
                    'text-foreground/50 [&_svg]:fill-foreground/50',
                )"
            >
                <IconAi name="cursor" />
                <span class="capitalize text-xs font-medium font-mono">Cursor</span>
            </div>
            <div
                :class="cn(
                    'relative flex flex-col items-center gap-1.5',
                    'text-foreground/50 [&_svg]:fill-foreground/50',
                )"
            >
                <IconAi name="open_code" />
                <span class="capitalize text-xs font-medium font-mono">open code</span>
            </div>
            <div
                :class="cn(
                    'relative flex flex-col items-center gap-1.5',
                    'text-foreground/50 [&_svg]:fill-foreground/50',
                )"
            >
                <IconAi name="copilot" />
                <span class="capitalize text-xs font-medium font-mono">copilot</span>
            </div>
            <div
                :class="cn(
                    'relative flex flex-col items-center gap-1.5',
                    'text-foreground/50 [&_svg]:fill-foreground/50',
                )"
            >
                <IconAi name="gemini" />
                <span class="capitalize text-xs font-medium font-mono">gemini</span>
            </div>
            <div
                :class="cn(
                    'relative flex flex-col items-center gap-1.5',
                    'text-foreground/50 [&_svg]:fill-foreground/50',
                )"
            >
                <IconAi name="kimi_code" />
                <span class="capitalize text-xs font-medium font-mono">Kimi</span>
            </div>
            <div
                :class="cn(
                    'relative flex flex-col items-center gap-1.5',
                    'text-foreground/50 [&_svg]:fill-foreground/50',
                )"
            >
                <IconAi name="antigravity" />
                <span class="capitalize text-xs font-medium font-mono">antigravity</span>
            </div>
            <div
                :class="cn(
                    'relative flex flex-col items-center gap-1.5',
                    'text-foreground/50 [&_path]:fill-current!',
                )"
            >
                <IconAi name="amp" />
                <span class="capitalize text-xs font-medium font-mono">amp</span>
            </div>
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
</script>

<style scoped>

</style>
