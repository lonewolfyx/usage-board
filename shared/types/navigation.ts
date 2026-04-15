export type AiIconName
    = | 'amp'
        | 'antigravity'
        | 'claude_code'
        | 'codex'
        | 'copilot'
        | 'cursor'
        | 'gemini'
        | 'kimi_code'
        | 'open_code'

export interface NavItem {
    icon: string | AiIconName
    iconFillClass?: string
    iconType: 'ai' | 'icon'
    label: string
    link: string
}
