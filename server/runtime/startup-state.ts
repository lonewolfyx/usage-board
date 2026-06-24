interface UsageStartupState {
    ready?: Promise<void>
    reject?: (error: unknown) => void
    resolve?: () => void
}

const USAGE_STARTUP_STATE_KEY = Symbol.for('usage-board.startup-state')

function getUsageStartupState() {
    const globalWithUsageState = globalThis as typeof globalThis & {
        [USAGE_STARTUP_STATE_KEY]?: UsageStartupState
    }

    globalWithUsageState[USAGE_STARTUP_STATE_KEY] ??= {}

    return globalWithUsageState[USAGE_STARTUP_STATE_KEY]
}

export function prepareUsageStartupReady() {
    const state = getUsageStartupState()

    state.ready ??= new Promise<void>((resolve, reject) => {
        state.resolve = resolve
        state.reject = reject
    })

    return state.ready
}

export function settleUsageStartupReady(ready: Promise<void>) {
    const state = getUsageStartupState()

    if (!state.ready) {
        state.ready = ready
        return ready
    }

    void ready.then(
        () => state.resolve?.(),
        error => state.reject?.(error),
    )

    return state.ready
}
