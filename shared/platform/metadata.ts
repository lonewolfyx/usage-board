import type { ProjectUsagePlatform } from '#shared/types/ai'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'

export interface ProjectUsagePlatformMeta {
    aiIcon: string
    color: string
    label: string
    slug: string
}

export const PROJECT_USAGE_PLATFORM_META: Record<ProjectUsagePlatform, ProjectUsagePlatformMeta> = {
    amp: {
        aiIcon: 'ai:amp',
        color: '#f34e3f',
        label: 'Amp',
        slug: 'amp',
    },
    claudeCode: {
        aiIcon: 'ai:claude-code',
        color: '#d97757',
        label: 'Claude Code',
        slug: 'claude_code',
    },
    codebuff: {
        aiIcon: 'ai:codebuff',
        color: '#14b8a6',
        label: 'Codebuff',
        slug: 'codebuff',
    },
    codex: {
        aiIcon: 'ai:codex',
        color: '#3941FF',
        label: 'Codex',
        slug: 'codex',
    },
    copilot: {
        aiIcon: 'ai:copilot',
        color: '#0f766e',
        label: 'GitHub Copilot',
        slug: 'copilot',
    },
    droid: {
        aiIcon: 'ai:droid',
        color: '#06b6d4',
        label: 'Droid',
        slug: 'droid',
    },
    gemini: {
        aiIcon: 'ai:gemini',
        color: '#0ea5e9',
        label: 'Gemini',
        slug: 'gemini',
    },
    goose: {
        aiIcon: 'ai:goose',
        color: '#22c55e',
        label: 'Goose',
        slug: 'goose',
    },
    hermes: {
        aiIcon: 'ai:hermesagent',
        color: '#8b5cf6',
        label: 'Hermes',
        slug: 'hermes',
    },
    kilo: {
        aiIcon: 'ai:kilo',
        color: '#f97316',
        label: 'Kilo',
        slug: 'kilo',
    },
    kimi: {
        aiIcon: 'ai:kimi',
        color: '#2563eb',
        label: 'Kimi',
        slug: 'kimi',
    },
    openclaw: {
        aiIcon: 'ai:openclaw',
        color: '#ec4899',
        label: 'OpenClaw',
        slug: 'openclaw',
    },
    opencode: {
        aiIcon: 'ai:open-code',
        color: '#4f46e5',
        label: 'OpenCode',
        slug: 'opencode',
    },
    pi: {
        aiIcon: 'ai:pi',
        color: '#a855f7',
        label: 'Pi',
        slug: 'pi',
    },
    qwen: {
        aiIcon: 'ai:qwen',
        color: '#623ae7',
        label: 'Qwen',
        slug: 'qwen',
    },
} as const

const platformBySlug = new Map<string, ProjectUsagePlatform>(PROJECT_USAGE_PLATFORMS.map(platform => [
    PROJECT_USAGE_PLATFORM_META[platform].slug,
    platform,
] as const))

export function resolveProjectUsagePlatform(value: string | null | undefined) {
    const normalizedValue = value?.trim()

    if (!normalizedValue) {
        return null
    }

    if (PROJECT_USAGE_PLATFORMS.includes(normalizedValue as ProjectUsagePlatform)) {
        return normalizedValue as ProjectUsagePlatform
    }

    return platformBySlug.get(normalizedValue) ?? null
}
