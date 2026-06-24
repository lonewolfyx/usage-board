import type { ProjectUsagePlatform } from '#shared/types/ai'

export interface IRuntimeConfig {
    appVersion: string
    home: string
}

export interface IConfig {
    version: string
    home: string
    ampPaths: string[]
    claudeCodePath: string
    claudeCodePaths: string[]
    codebuffPaths: string[]
    copilotPaths: string[]
    codexPath: string
    droidPaths: string[]
    geminiPath: string
    goosePaths: string[]
    hermesPaths: string[]
    kiloPaths: string[]
    kimiPaths: string[]
    openClawPaths: string[]
    openCodePaths: string[]
    piPaths: string[]
    qwenPaths: string[]
    activePlatforms: ProjectUsagePlatform[]
}
