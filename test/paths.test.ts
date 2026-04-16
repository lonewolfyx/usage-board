import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getClaudeCodePaths } from '../src/paths'

const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
const tempDirs: string[] = []

afterEach(() => {
    if (originalClaudeConfigDir == null) {
        delete process.env.CLAUDE_CONFIG_DIR
    }
    else {
        process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
    }

    for (const dir of tempDirs.splice(0)) {
        rmSync(dir, { force: true, recursive: true })
    }
})

describe('paths', () => {
    it('returns all valid Claude data paths from CLAUDE_CONFIG_DIR', () => {
        const firstPath = createClaudeDataPath()
        const secondPath = createClaudeDataPath()

        process.env.CLAUDE_CONFIG_DIR = `${firstPath}, ${secondPath}`

        expect(getClaudeCodePaths()).toEqual([firstPath, secondPath])
    })
})

function createClaudeDataPath() {
    const dir = mkdtempSync(join(tmpdir(), 'usage-board-claude-'))
    mkdirSync(join(dir, 'projects'))
    tempDirs.push(dir)

    return dir
}
