import type { UsageUpdateMessage } from '#shared/types/ws'
import { parse } from '#shared/utils/parse'
import { fetchAnalysisLiveState } from '~/lib/analysis-repository'

const usageLiveUpdateDebounceMs = 300
const usageLiveUpdatePollMs = 2000

export function useUsageLiveUpdate(onUpdate: (update: UsageUpdateMessage['payload']) => Promise<unknown> | unknown) {
    let isPolling = false
    let lastSeenUpdatedAt = ''
    let latestQueuedUpdate: UsageUpdateMessage['payload'] | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    let refreshPromise: Promise<void> | null = null

    const wsUrl = computed(() => {
        if (!import.meta.client) {
            return ''
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

        return `${protocol}//${window.location.host}/ws`
    })

    const { open } = useWebSocket(wsUrl, {
        immediate: false,
        autoReconnect: {
            delay: 1000,
            retries: 3,
        },
        onMessage(_ws, event) {
            const update = parseUsageUpdateMessage(event.data)

            if (!update) {
                return
            }

            rememberUpdatedAt(update.payload.updatedAt)
            scheduleRefresh(update.payload)
        },
    })

    onMounted(() => {
        open()
        void syncLiveState()
        pollTimer = setInterval(() => {
            void syncLiveState()
        }, usageLiveUpdatePollMs)
    })

    onScopeDispose(() => {
        if (pollTimer) {
            clearInterval(pollTimer)
            pollTimer = null
        }

        if (refreshTimer) {
            clearTimeout(refreshTimer)
            refreshTimer = null
        }
    })

    function scheduleRefresh(update: UsageUpdateMessage['payload']) {
        if (refreshTimer) {
            clearTimeout(refreshTimer)
        }

        refreshTimer = setTimeout(() => {
            refreshTimer = null
            void refresh(update)
        }, usageLiveUpdateDebounceMs)
    }

    async function refresh(update: UsageUpdateMessage['payload']) {
        if (refreshPromise) {
            latestQueuedUpdate = update
            return
        }

        refreshPromise = Promise.resolve(onUpdate(update))
            .then(() => undefined)
            .catch((error) => {
                console.error('[usage-live-update] failed to refresh dashboard', error)
            })
            .finally(() => {
                refreshPromise = null
            })

        await refreshPromise

        if (!latestQueuedUpdate) {
            return
        }

        const nextUpdate = latestQueuedUpdate
        latestQueuedUpdate = null
        await refresh(nextUpdate)
    }

    async function syncLiveState() {
        if (!import.meta.client || document.hidden || isPolling) {
            return
        }

        isPolling = true

        try {
            const liveState = await fetchAnalysisLiveState()

            if (!liveState.updatedAt) {
                return
            }

            if (!lastSeenUpdatedAt) {
                rememberUpdatedAt(liveState.updatedAt)
                return
            }

            if (liveState.updatedAt === lastSeenUpdatedAt) {
                return
            }

            rememberUpdatedAt(liveState.updatedAt)
            scheduleRefresh({
                affectedProjects: [],
                updatedAt: liveState.updatedAt,
                updatedPlatforms: [],
                updatedSessions: [],
            })
        }
        catch (error) {
            console.error('[usage-live-update] failed to fetch live state', error)
        }
        finally {
            isPolling = false
        }
    }

    function rememberUpdatedAt(updatedAt: string) {
        if (!updatedAt || updatedAt <= lastSeenUpdatedAt) {
            return
        }

        lastSeenUpdatedAt = updatedAt
    }
}

function parseUsageUpdateMessage(data: unknown) {
    if (typeof data !== 'string') {
        return null
    }

    const parsed = parse(data) as UsageUpdateMessage | null

    return isUsageUpdateMessage(parsed)
        ? parsed
        : null
}

function isUsageUpdateMessage(value: unknown): value is UsageUpdateMessage {
    if (!value || typeof value !== 'object') {
        return false
    }

    const record = value as Record<string, unknown>

    return record.type === 'usage_update'
        && typeof record.payload === 'object'
        && record.payload !== null
}
