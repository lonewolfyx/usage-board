import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { isDirectorySync } from 'path-type'

const CODEX_HOME_ENV = 'CODEX_HOME'

const CLAUDE_CONFIG_DIR_ENV = 'CLAUDE_CONFIG_DIR'

const USER_HOME_DIR = homedir()

const DEFAULT_CODEX_DIR = join(USER_HOME_DIR, '.codex')

const DEFAULT_CLAUDE_CODE_PATH = '.claude'

const DEFAULT_CLAUDE_CONFIG_PATH = join(process.env.XDG_CONFIG_HOME?.trim() || join(USER_HOME_DIR, '.config'), 'claude')

const CLAUDE_PROJECTS_DIR_NAME = 'projects'

export function getCodexPath(): string {
    const codexHomeEnv = process.env[CODEX_HOME_ENV]?.trim()
    return codexHomeEnv != null && codexHomeEnv !== '' ? resolve(codexHomeEnv) : DEFAULT_CODEX_DIR
}

export function getClaudeCodePaths(): string[] {
    const paths: string[] = []
    const normalizedPaths = new Set<string>()
    const envPaths = (process.env[CLAUDE_CONFIG_DIR_ENV] ?? '').trim()

    if (envPaths !== '') {
        for (const envPath of envPaths.split(',').map(path => path.trim()).filter(Boolean)) {
            const normalizedPath = resolve(envPath)
            const projectsPath = join(normalizedPath, CLAUDE_PROJECTS_DIR_NAME)

            if (isDirectorySync(normalizedPath) && isDirectorySync(projectsPath) && !normalizedPaths.has(normalizedPath)) {
                normalizedPaths.add(normalizedPath)
                paths.push(normalizedPath)
            }
        }

        if (paths.length > 0) {
            return paths
        }

        throw new Error(
            `No valid Claude data directories found in ${CLAUDE_CONFIG_DIR_ENV}. Please ensure the configured path contains a '${CLAUDE_PROJECTS_DIR_NAME}' directory.`,
        )
    }

    const defaultPaths = [
        DEFAULT_CLAUDE_CONFIG_PATH,
        join(USER_HOME_DIR, DEFAULT_CLAUDE_CODE_PATH),
    ]

    for (const defaultPath of defaultPaths) {
        const normalizedPath = resolve(defaultPath)
        const projectsPath = join(normalizedPath, CLAUDE_PROJECTS_DIR_NAME)

        if (isDirectorySync(normalizedPath) && isDirectorySync(projectsPath) && !normalizedPaths.has(normalizedPath)) {
            normalizedPaths.add(normalizedPath)
            paths.push(normalizedPath)
        }
    }

    if (paths.length > 0) {
        return paths
    }

    throw new Error(
        `No valid Claude data directories found. Please ensure one of '${join(DEFAULT_CLAUDE_CONFIG_PATH, CLAUDE_PROJECTS_DIR_NAME)}' or '${join(USER_HOME_DIR, DEFAULT_CLAUDE_CODE_PATH, CLAUDE_PROJECTS_DIR_NAME)}' exists, or set ${CLAUDE_CONFIG_DIR_ENV}.`,
    )
}

export function getGeminiPath(): string {
    return resolve(USER_HOME_DIR, '.gemini')
}
