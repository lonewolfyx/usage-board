import type { Component } from 'vue'

export type ChartConfig = {
    [k in string]: {
        label?: string | Component
        icon?: string | Component
    } & (
        | { color?: string, theme?: never }
        | { color?: never, theme: Record<'light' | 'dark', string> }
    )
}
