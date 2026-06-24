type CopilotTimestampValue = [number, number] | number | string
export type CopilotAttributeValue = boolean | null | number | string

export interface CopilotRecordRaw {
    _body?: string
    _hrTime?: CopilotTimestampValue
    attributes?: Record<string, CopilotAttributeValue>
    body?: string
    duration?: unknown
    endTime?: CopilotTimestampValue
    hrTime?: CopilotTimestampValue
    kind?: unknown
    name?: string
    observedTimestamp?: CopilotTimestampValue
    spanContext?: { spanId?: string, traceId?: string }
    spanId?: string
    startTime?: CopilotTimestampValue
    time?: CopilotTimestampValue
    timestamp?: CopilotTimestampValue
    timeUnixNano?: CopilotTimestampValue
    traceId?: string
    type?: 'span' | (string & {})
}

export type CopilotUsageSource = 'agentSummarySpan' | 'agentTurnLog' | 'chatSpan' | 'inferenceLog'
