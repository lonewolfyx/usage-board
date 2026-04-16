import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config'
import { loadGeminiUsage } from '../src/platform'

const config = resolveConfig({
    'host': '127.0.0.1',
    'port': 8888,
    'open': false,
    '--': '',
})

describe('test gemini', () => {
    it('should ', async () => {
        const data = await loadGeminiUsage(config)
        await expect(data).toMatchFileSnapshot('./gemini.json')
    })
})
