import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { isDirectorySync, isFileSync } from 'path-type'

const CODEX_HOME_ENV = 'CODEX_HOME'

const CLAUDE_CONFIG_DIR_ENV = 'CLAUDE_CONFIG_DIR'

const USER_HOME_DIR = homedir()

const DEFAULT_CODEX_DIR = join(USER_HOME_DIR, '.codex')
const DEFAULT_AMP_DIR = join(USER_HOME_DIR, '.local', 'share', 'amp')
const DEFAULT_CODEBUFF_CHANNELS = ['manicode', 'manicode-dev', 'manicode-staging'] as const
const DEFAULT_COPILOT_OTEL_DIR = join(USER_HOME_DIR, '.copilot', 'otel')

const DEFAULT_CLAUDE_CODE_PATH = '.claude'

const DEFAULT_CLAUDE_CONFIG_PATH = join(process.env.XDG_CONFIG_HOME?.trim() || join(USER_HOME_DIR, '.config'), 'claude')
const DEFAULT_DROID_SESSIONS_DIR = join(USER_HOME_DIR, '.factory', 'sessions')
const DEFAULT_GOOSE_DB_CANDIDATES = [
    join(USER_HOME_DIR, '.local', 'share', 'goose', 'sessions', 'sessions.db'),
    join(USER_HOME_DIR, 'Library', 'Application Support', 'goose', 'sessions', 'sessions.db'),
    join(USER_HOME_DIR, '.local', 'share', 'Block', 'goose', 'sessions', 'sessions.db'),
] as const
const DEFAULT_KILO_DIR = join(USER_HOME_DIR, '.local', 'share', 'kilo')
const DEFAULT_KIMI_DIR = join(USER_HOME_DIR, '.kimi')
const DEFAULT_OPENCLAW_DIRS = [
    join(USER_HOME_DIR, '.openclaw'),
    join(USER_HOME_DIR, '.clawdbot'),
    join(USER_HOME_DIR, '.moltbot'),
    join(USER_HOME_DIR, '.moldbot'),
] as const
const DEFAULT_OPENCODE_DIR = join(USER_HOME_DIR, '.local', 'share', 'opencode')
const DEFAULT_PI_SESSIONS_DIR = join(USER_HOME_DIR, '.pi', 'agent', 'sessions')
const DEFAULT_QWEN_DIR = join(USER_HOME_DIR, '.qwen')

const CLAUDE_PROJECTS_DIR_NAME = 'projects'
const COPILOT_OTEL_FILE_EXPORTER_PATH_ENV = 'COPILOT_OTEL_FILE_EXPORTER_PATH'

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

export function getAmpPaths(): string[] {
    return getDirectoryPathsFromEnv('AMP_DATA_DIR', [DEFAULT_AMP_DIR])
}

export function getCodebuffPaths(): string[] {
    return getDirectoryPathsFromEnv(
        'CODEBUFF_DATA_DIR',
        DEFAULT_CODEBUFF_CHANNELS.map(channel => join(USER_HOME_DIR, '.config', channel, 'projects')),
        { mapDefaultPath: path => path },
    )
}

export function getCopilotPaths(): string[] {
    const files = new Set<string>()
    const exporterPath = process.env[COPILOT_OTEL_FILE_EXPORTER_PATH_ENV]?.trim()

    if (exporterPath) {
        const resolvedPath = resolve(exporterPath)

        if (isFileSync(resolvedPath)) {
            files.add(resolvedPath)
        }
    }

    if (isDirectorySync(DEFAULT_COPILOT_OTEL_DIR)) {
        files.add(resolve(DEFAULT_COPILOT_OTEL_DIR))
    }

    return Array.from(files)
}

export function getDroidPaths(): string[] {
    return getDirectoryPathsFromEnv('DROID_SESSIONS_DIR', [DEFAULT_DROID_SESSIONS_DIR])
}

export function getGoosePaths(): string[] {
    const root = process.env.GOOSE_PATH_ROOT?.trim()

    if (root) {
        const dbPath = resolve(root, 'data', 'sessions', 'sessions.db')
        return isFileSync(dbPath) ? [dbPath] : []
    }

    return DEFAULT_GOOSE_DB_CANDIDATES
        .map(path => resolve(path))
        .filter(isFileSync)
}

export function getHermesPaths(): string[] {
    const homes = getDirectoryPathsFromEnv('HERMES_HOME', [join(USER_HOME_DIR, '.hermes')])

    return homes
        .map(path => join(path, 'state.db'))
        .filter(isFileSync)
}

export function getKiloPaths(): string[] {
    return getDirectoryPathsFromEnv('KILO_DATA_DIR', [DEFAULT_KILO_DIR])
}

export function getKimiPaths(): string[] {
    return getDirectoryPathsFromEnv('KIMI_DATA_DIR', [DEFAULT_KIMI_DIR])
}

export function getOpenClawPaths(): string[] {
    return getDirectoryPathsFromEnv('OPENCLAW_DIR', DEFAULT_OPENCLAW_DIRS)
}

export function getOpenCodePaths(): string[] {
    return getDirectoryPathsFromEnv('OPENCODE_DATA_DIR', [DEFAULT_OPENCODE_DIR])
}

export function getPiPaths(): string[] {
    return getDirectoryPathsFromEnv('PI_AGENT_DIR', [DEFAULT_PI_SESSIONS_DIR])
}

export function getQwenPaths(): string[] {
    return getDirectoryPathsFromEnv('QWEN_DATA_DIR', [DEFAULT_QWEN_DIR])
}

function getDirectoryPathsFromEnv(
    envName: string,
    defaultPaths: readonly string[],
    options: {
        mapDefaultPath?: (path: string) => string
    } = {},
) {
    const envValue = process.env[envName]?.trim()
    const candidates = envValue
        ? splitEnvPathList(envValue)
        : defaultPaths.map(path => options.mapDefaultPath?.(path) ?? path)

    return dedupePaths(
        candidates
            .map(path => resolve(path))
            .filter(isDirectorySync),
    )
}

function splitEnvPathList(value: string) {
    return value
        .split(',')
        .map(path => path.trim())
        .filter(Boolean)
}

function dedupePaths(paths: string[]) {
    return Array.from(new Set(paths))
}
