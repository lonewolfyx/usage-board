import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config'
import { loadCodexUsage } from '../src/platform'

const config = resolveConfig({
    'host': '127.0.0.1',
    'port': 8888,
    'open': false,
    '--': '',
})

describe('test codex', () => {
    it('should ', async () => {
        const data = await loadCodexUsage(config)
        await expect(data).toMatchFileSnapshot('./codex.json')
    })
})
