import type { Ref } from 'vue'
import { shallowRef } from 'vue'

interface ChartHoverBounds {
    bottom: number
    left: number
    right: number
    top: number
}

export function useChartHoverGuide(options: {
    chartRoot: Readonly<Ref<HTMLElement | null | undefined>>
    isEnabled?: () => boolean
    resolveSelection: (pointerX: number) => number | null
    resolveBounds: () => ChartHoverBounds
}) {
    const hoverPointerY = shallowRef<number | null>(null)
    const hoverSelection = shallowRef<number | null>(null)

    function clearHoverGuide() {
        hoverSelection.value = null
        hoverPointerY.value = null
    }

    function handlePointerMove(event: PointerEvent) {
        const rect = options.chartRoot.value?.getBoundingClientRect()

        if (!rect || options.isEnabled?.() === false) {
            clearHoverGuide()
            return
        }

        const pointerX = event.clientX - rect.left
        const pointerY = event.clientY - rect.top
        const bounds = options.resolveBounds()

        if (
            pointerX < bounds.left
            || pointerX > bounds.right
            || pointerY < bounds.top
            || pointerY > bounds.bottom
        ) {
            clearHoverGuide()
            return
        }

        const selection = options.resolveSelection(pointerX)

        if (selection === null) {
            clearHoverGuide()
            return
        }

        hoverSelection.value = selection
        hoverPointerY.value = pointerY
    }

    return {
        clearHoverGuide,
        handlePointerMove,
        hoverPointerY,
        hoverSelection,
    }
}
