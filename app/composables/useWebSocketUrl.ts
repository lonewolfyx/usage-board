export function useWebSocketUrl() {
    return computed(() => {
        if (!import.meta.client) {
            return ''
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

        return `${protocol}//${window.location.host}/ws`
    })
}
