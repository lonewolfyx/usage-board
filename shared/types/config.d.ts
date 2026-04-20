export interface IRuntimeConfig {
    appVersion: string
    home: string
}

export interface IConfig {
    version: string
    home: string
    claudeCodePath: string
    claudeCodePaths: string[]
    openCodePath: string | null
    codexPath: string
    geminiPath: string
}
