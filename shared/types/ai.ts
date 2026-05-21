export const PROJECT_USAGE_PLATFORMS = [
    'claudeCode',
    'codex',
    'gemini',
    'opencode',
    'amp',
    'droid',
    'codebuff',
    'hermes',
    'pi',
    'goose',
    'openclaw',
    'kilo',
    'copilot',
    'kimi',
    'qwen',
] as const

export type ProjectUsagePlatform = typeof PROJECT_USAGE_PLATFORMS[number]

export type ProjectUsagePlatformRecord<T> = Record<ProjectUsagePlatform, T>
