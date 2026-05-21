export const PROJECT_USAGE_PLATFORMS = ['claudeCode', 'codex', 'gemini'] as const

export type ProjectUsagePlatform = typeof PROJECT_USAGE_PLATFORMS[number]

export type ProjectUsagePlatformRecord<T> = Record<ProjectUsagePlatform, T>
