export type AiIconName
    = | 'amp'
        | 'antigravity'
        | 'claude_code'
        | 'codebuff'
        | 'codex'
        | 'copilot'
        | 'cursor'
        | 'droid'
        | 'gemini'
        | 'goose'
        | 'hermes'
        | 'kimi_code'
        | 'kilo'
        | 'openclaw'
        | 'open_code'
        | 'pi'
        | 'qwen_code'

export interface NavItem {
    icon: string | AiIconName
    iconFillClass?: string
    iconType: 'ai' | 'icon'
    label: string
    link: string
}
