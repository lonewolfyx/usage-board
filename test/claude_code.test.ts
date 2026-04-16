import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config'
import { loadClaudeCodeUsage } from '../src/platform'

const config = resolveConfig({
    'host': '127.0.0.1',
    'port': 8888,
    'open': false,
    '--': '',
})

describe('test claude code', () => {
    it('should ', async () => {
        const data = await loadClaudeCodeUsage(config)
        await expect(data).toMatchFileSnapshot('./claude.json')
    })
})
