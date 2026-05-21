import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { AiIconName } from '#shared/types/navigation'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'

export interface ProjectUsagePlatformMeta {
    aiIcon: AiIconName
    color: string
    label: string
    slug: string
}

export const PROJECT_USAGE_PLATFORM_META: Record<ProjectUsagePlatform, ProjectUsagePlatformMeta> = {
    amp: {
        aiIcon: 'amp',
        color: '#f34e3f',
        label: 'Amp',
        slug: 'amp',
    },
    claudeCode: {
        aiIcon: 'claude_code',
        color: '#d97757',
        label: 'Claude Code',
        slug: 'claude_code',
    },
    codebuff: {
        aiIcon: 'codebuff',
        color: '#14b8a6',
        label: 'Codebuff',
        slug: 'codebuff',
    },
    codex: {
        aiIcon: 'codex',
        color: '#111827',
        label: 'Codex',
        slug: 'codex',
    },
    copilot: {
        aiIcon: 'copilot',
        color: '#0f766e',
        label: 'GitHub Copilot',
        slug: 'copilot',
    },
    droid: {
        aiIcon: 'droid',
        color: '#06b6d4',
        label: 'Droid',
        slug: 'droid',
    },
    gemini: {
        aiIcon: 'gemini',
        color: '#0ea5e9',
        label: 'Gemini',
        slug: 'gemini',
    },
    goose: {
        aiIcon: 'goose',
        color: '#22c55e',
        label: 'Goose',
        slug: 'goose',
    },
    hermes: {
        aiIcon: 'hermes',
        color: '#8b5cf6',
        label: 'Hermes',
        slug: 'hermes',
    },
    kilo: {
        aiIcon: 'kilo',
        color: '#f97316',
        label: 'Kilo',
        slug: 'kilo',
    },
    kimi: {
        aiIcon: 'kimi_code',
        color: '#2563eb',
        label: 'Kimi',
        slug: 'kimi',
    },
    openclaw: {
        aiIcon: 'openclaw',
        color: '#ec4899',
        label: 'OpenClaw',
        slug: 'openclaw',
    },
    opencode: {
        aiIcon: 'open_code',
        color: '#4f46e5',
        label: 'OpenCode',
        slug: 'opencode',
    },
    pi: {
        aiIcon: 'pi',
        color: '#a855f7',
        label: 'Pi',
        slug: 'pi',
    },
    qwen: {
        aiIcon: 'qwen_code',
        color: '#623ae7',
        label: 'Qwen',
        slug: 'qwen',
    },
} as const

const platformSlugEntries = PROJECT_USAGE_PLATFORMS.map(platform => [
    PROJECT_USAGE_PLATFORM_META[platform].slug,
    platform,
] as const)

const platformBySlug = new Map<string, ProjectUsagePlatform>(platformSlugEntries)

export function getProjectUsagePlatformSlug(platform: ProjectUsagePlatform) {
    return PROJECT_USAGE_PLATFORM_META[platform].slug
}

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
