import type { DailyTokenUsage, MonthlyModelUsage, ProjectUsageItem } from '~/composables/useUsageDashboard'
import { computed } from 'vue'
import { formatCompactNumber, formatCurrency } from '~/composables/useUsageDashboard'

interface CodexSessionSourceItem {
    sessionId: string
    threadName: string
    project: string
    repository: string
    model: string
    startedAt: string
    durationMinutes: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    costUSD: number
}

export interface CodexSessionUsageItem {
    id: string
    sessionId: string
    threadName: string
    project: string
    repository: string
    model: string
    startedAt: string
    date: string
    month: string
    week: string
    duration: string
    durationMinutes: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    tokenTotal: number
    costUSD: number
}

export interface CodexTokenUsageRow {
    id: string
    label: string
    period: string
    models: string[]
    projects: string[]
    sessionCount: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    totalTokens: number
    costUSD: number
}

const todayDateKey = '2026-04-15'

const codexSessionSourceItems: CodexSessionSourceItem[] = [
    {
        sessionId: 'rollout-2026-03-19T16-57-39-019d0550-9081-7793-9685-0eac2397579e',
        threadName: '了解项目架构目录概览.features',
        project: 'web-jetbrains-git',
        repository: 'lonewolfyx/web-jetbrains-git',
        model: 'gpt-5.4',
        startedAt: '2026-03-19T16:57:39+08:00',
        durationMinutes: 61,
        inputTokens: 5274379,
        cachedInputTokens: 4317312,
        outputTokens: 33443,
        reasoningOutputTokens: 9011,
        costUSD: 3.9736405,
    },
    {
        sessionId: 'rollout-2026-03-20T22-10-23-019d0b95-4069-7df0-a703-6f1e44fc9fc9',
        threadName: 'Document VitePress architecture',
        project: 'vitepress-lab',
        repository: 'lonewolfyx/vitepress-lab',
        model: 'gpt-5.4',
        startedAt: '2026-03-20T22:10:23+08:00',
        durationMinutes: 44,
        inputTokens: 2972768,
        cachedInputTokens: 2191872,
        outputTokens: 30106,
        reasoningOutputTokens: 3500,
        costUSD: 2.951798,
    },
    {
        sessionId: 'rollout-2026-03-27T13-58-16-019d2ddf-353e-7532-af34-2a95fd2ab6bc',
        threadName: '先审查项目并详细列出所有错误内容板块',
        project: 'uni-deps-fix',
        repository: 'lonewolfyx/uni-deps-fix',
        model: 'gpt-5.3-codex',
        startedAt: '2026-03-27T13:58:16+08:00',
        durationMinutes: 35,
        inputTokens: 277230,
        cachedInputTokens: 258816,
        outputTokens: 7404,
        reasoningOutputTokens: 5062,
        costUSD: 0.1811733,
    },
    {
        sessionId: 'rollout-2026-03-28T13-48-09-019d32fc-4db8-7d90-8f6e-6965b3e9cde1',
        threadName: '审核 packages 错误文案描述',
        project: 'uni-deps-fix',
        repository: 'lonewolfyx/uni-deps-fix',
        model: 'gpt-5.3-codex',
        startedAt: '2026-03-28T13:48:09+08:00',
        durationMinutes: 53,
        inputTokens: 2369917,
        cachedInputTokens: 1904896,
        outputTokens: 18591,
        reasoningOutputTokens: 10599,
        costUSD: 1.40741755,
    },
    {
        sessionId: 'rollout-2026-03-30T21-55-59-019d3f07-a62c-77b2-afa7-d3ab363f8c36',
        threadName: '修复 monorepo 构建和类型问题',
        project: 'dnmp',
        repository: 'lonewolfyx/dnmp',
        model: 'gpt-5.3-codex',
        startedAt: '2026-03-30T21:55:59+08:00',
        durationMinutes: 58,
        inputTokens: 3308750,
        cachedInputTokens: 3204096,
        outputTokens: 40618,
        reasoningOutputTokens: 20878,
        costUSD: 1.3125133,
    },
    {
        sessionId: 'rollout-2026-04-01T13-38-09-019d478c-9916-7393-8f49-cd657256a5fe',
        threadName: '调整 Codex Desktop 侧栏交互',
        project: 'codex-desktop',
        repository: 'lonewolfyx/codex-desktop',
        model: 'gpt-5.3-codex',
        startedAt: '2026-04-01T13:38:09+08:00',
        durationMinutes: 74,
        inputTokens: 8241200,
        cachedInputTokens: 7580800,
        outputTokens: 53190,
        reasoningOutputTokens: 25530,
        costUSD: 3.271,
    },
    {
        sessionId: 'rollout-2026-04-01T22-07-10-019d495e-9c02-7b40-bacc-dcb1f491a22d',
        threadName: '实现消息列表滚动状态保持',
        project: 'codex-desktop',
        repository: 'lonewolfyx/codex-desktop',
        model: 'gpt-5.3-codex',
        startedAt: '2026-04-01T22:07:10+08:00',
        durationMinutes: 58,
        inputTokens: 14542596,
        cachedInputTokens: 13461632,
        outputTokens: 56847,
        reasoningOutputTokens: 25861,
        costUSD: 4.9993306,
    },
    {
        sessionId: 'rollout-2026-04-02T14-46-49-019d4cf1-d34c-7ce3-a6f3-0cfd3c275853',
        threadName: '增加 usage board 首页数据模块',
        project: 'usage-board',
        repository: 'lonewolfyx/usage-board',
        model: 'gpt-5.3-codex',
        startedAt: '2026-04-02T14:46:49+08:00',
        durationMinutes: 68,
        inputTokens: 9183110,
        cachedInputTokens: 8466304,
        outputTokens: 59440,
        reasoningOutputTokens: 24450,
        costUSD: 3.318,
    },
    {
        sessionId: 'rollout-2026-04-02T21-35-46-019d4e68-39e1-7cc3-9844-763a8dd09b0a',
        threadName: '重构统计卡片和图表布局',
        project: 'usage-board',
        repository: 'lonewolfyx/usage-board',
        model: 'gpt-5.3-codex',
        startedAt: '2026-04-02T21:35:46+08:00',
        durationMinutes: 46,
        inputTokens: 5922100,
        cachedInputTokens: 5489400,
        outputTokens: 36820,
        reasoningOutputTokens: 15112,
        costUSD: 2.121,
    },
    {
        sessionId: 'rollout-2026-04-02T21-41-20-019d4e6d-504f-7331-9dae-f055f3c15bbb',
        threadName: '补齐项目排行交互细节',
        project: 'usage-board',
        repository: 'lonewolfyx/usage-board',
        model: 'gpt-5.3-codex',
        startedAt: '2026-04-02T21:41:20+08:00',
        durationMinutes: 39,
        inputTokens: 4112300,
        cachedInputTokens: 3821120,
        outputTokens: 28165,
        reasoningOutputTokens: 10171,
        costUSD: 1.472,
    },
    {
        sessionId: 'rollout-2026-04-02T22-50-41-019d4eac-cf47-7c43-82f8-5d59c1ee1525',
        threadName: '修复 dashboard 类型和 lint',
        project: 'usage-board',
        repository: 'lonewolfyx/usage-board',
        model: 'gpt-5.3-codex',
        startedAt: '2026-04-02T22:50:41+08:00',
        durationMinutes: 49,
        inputTokens: 3656599,
        cachedInputTokens: 3460296,
        outputTokens: 31806,
        reasoningOutputTokens: 13080,
        costUSD: 1.85746075,
    },
    {
        sessionId: 'rollout-2026-04-08T11-14-25-019d6b15-8616-7503-bab3-d3a229fb1681',
        threadName: '拆分发布脚本任务',
        project: 'codex-register',
        repository: 'lonewolfyx/codex-register',
        model: 'gpt-5.4',
        startedAt: '2026-04-08T11:14:25+08:00',
        durationMinutes: 52,
        inputTokens: 2730499,
        cachedInputTokens: 2246400,
        outputTokens: 29855,
        reasoningOutputTokens: 16411,
        costUSD: 2.2196725,
    },
    {
        sessionId: 'rollout-2026-04-09T09-43-14-019d6fe8-6547-7e31-875f-e4ca3fba12c0',
        threadName: '检查插件安装边界',
        project: 'codex-register',
        repository: 'lonewolfyx/codex-register',
        model: 'gpt-5.4',
        startedAt: '2026-04-09T09:43:14+08:00',
        durationMinutes: 26,
        inputTokens: 741020,
        cachedInputTokens: 558080,
        outputTokens: 16870,
        reasoningOutputTokens: 7021,
        costUSD: 0.804,
    },
    {
        sessionId: 'rollout-2026-04-09T16-36-34-019d7162-ce8e-7873-b3b2-e97eeae97d99',
        threadName: '迁移表格筛选状态',
        project: 'sixninenine',
        repository: 'lonewolfyx/sixninenine',
        model: 'gpt-5.4',
        startedAt: '2026-04-09T16:36:34+08:00',
        durationMinutes: 38,
        inputTokens: 1178440,
        cachedInputTokens: 955392,
        outputTokens: 20787,
        reasoningOutputTokens: 8056,
        costUSD: 1.154193,
    },
    {
        sessionId: 'rollout-2026-04-10T14-12-57-019d7605-afae-7960-8e2d-0fd60a083e08',
        threadName: '修复 Vue 页面数据分页',
        project: 'sixninenine',
        repository: 'lonewolfyx/sixninenine',
        model: 'gpt-5.4',
        startedAt: '2026-04-10T14:12:57+08:00',
        durationMinutes: 39,
        inputTokens: 4788095,
        cachedInputTokens: 4163840,
        outputTokens: 40936,
        reasoningOutputTokens: 18162,
        costUSD: 3.2156375,
    },
    {
        sessionId: 'rollout-2026-04-13T11-04-57-019d84cc-a6c9-7783-8616-f5cba9051337',
        threadName: '快速校准技能描述',
        project: 'talks',
        repository: 'lonewolfyx/talks',
        model: 'gpt-5.4',
        startedAt: '2026-04-13T11:04:57+08:00',
        durationMinutes: 11,
        inputTokens: 16031,
        cachedInputTokens: 4480,
        outputTokens: 196,
        reasoningOutputTokens: 153,
        costUSD: 0.0329375,
    },
    {
        sessionId: 'rollout-2026-04-14T16-36-04-019d8b22-28d7-7521-9244-608c6a09f0be',
        threadName: '补充统计页空状态',
        project: 'usage-board',
        repository: 'lonewolfyx/usage-board',
        model: 'gpt-5.4',
        startedAt: '2026-04-14T16:36:04+08:00',
        durationMinutes: 24,
        inputTokens: 211009,
        cachedInputTokens: 163840,
        outputTokens: 6200,
        reasoningOutputTokens: 2180,
        costUSD: 0.241,
    },
    {
        sessionId: 'rollout-2026-04-14T23-06-57-019d8c88-05e4-7413-8f43-aecbc7433e2d',
        threadName: '修复日期解析边界',
        project: 'usage-board',
        repository: 'lonewolfyx/usage-board',
        model: 'gpt-5.4',
        startedAt: '2026-04-14T23:06:57+08:00',
        durationMinutes: 31,
        inputTokens: 230310,
        cachedInputTokens: 179456,
        outputTokens: 5706,
        reasoningOutputTokens: 2158,
        costUSD: 0.2684715,
    },
    {
        sessionId: 'rollout-2026-04-15T09-14-18-019d8eb4-101e-7701-ab12-d5d2925f4d81',
        threadName: 'Codex 页面数据结构设计',
        project: 'usage-board',
        repository: 'lonewolfyx/usage-board',
        model: 'gpt-5.4',
        startedAt: '2026-04-15T09:14:18+08:00',
        durationMinutes: 47,
        inputTokens: 1268400,
        cachedInputTokens: 932864,
        outputTokens: 29480,
        reasoningOutputTokens: 11820,
        costUSD: 1.172,
    },
    {
        sessionId: 'rollout-2026-04-15T10-42-31-019d8f04-d3f8-7ee0-9017-b1949783decd',
        threadName: 'Codex 看板分页与 session 表格',
        project: 'usage-board',
        repository: 'lonewolfyx/usage-board',
        model: 'gpt-5.4',
        startedAt: '2026-04-15T10:42:31+08:00',
        durationMinutes: 55,
        inputTokens: 2480600,
        cachedInputTokens: 1814528,
        outputTokens: 49220,
        reasoningOutputTokens: 20164,
        costUSD: 2.084,
    },
]

export function useCodexDashboard() {
    const sessionUsage = computed<CodexSessionUsageItem[]>(() => codexSessionSourceItems
        .map(toCodexSessionUsageItem)
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)))

    const sessionUsageAscending = computed(() => [...sessionUsage.value].reverse())

    const dailyTokenUsage = computed<DailyTokenUsage[]>(() => buildDailyTokenUsage(sessionUsageAscending.value))

    const dailyRows = computed<CodexTokenUsageRow[]>(() => dailyTokenUsage.value
        .map(day => ({
            id: getDateKey(parseDateLabel(day.date)),
            label: day.date,
            period: day.date,
            models: Object.keys(day.models),
            projects: uniqueItems(sessionUsage.value.filter(session => session.date === day.date).map(session => session.project)),
            sessionCount: sessionUsage.value.filter(session => session.date === day.date).length,
            inputTokens: day.inputTokens,
            cachedInputTokens: day.cachedInputTokens,
            outputTokens: day.outputTokens,
            reasoningOutputTokens: day.reasoningOutputTokens,
            totalTokens: day.totalTokens,
            costUSD: day.costUSD,
        }))
        .reverse())

    const weeklyRows = computed<CodexTokenUsageRow[]>(() => buildPeriodRows(sessionUsage.value, 'week'))

    const monthlyRows = computed<CodexTokenUsageRow[]>(() => buildPeriodRows(sessionUsage.value, 'month'))

    const sessionRows = computed<CodexTokenUsageRow[]>(() => sessionUsage.value.map(session => ({
        id: session.sessionId,
        label: session.sessionId,
        period: session.date,
        models: [session.model],
        projects: [session.project],
        sessionCount: 1,
        inputTokens: session.inputTokens,
        cachedInputTokens: session.cachedInputTokens,
        outputTokens: session.outputTokens,
        reasoningOutputTokens: session.reasoningOutputTokens,
        totalTokens: session.tokenTotal,
        costUSD: session.costUSD,
    })))

    const monthlyModelUsage = computed<MonthlyModelUsage[]>(() => {
        const groups = aggregateSessions(sessionUsage.value, session => `${session.month}__${session.model}`)

        return Array.from(groups.values())
            .map(group => ({
                model: group.models[0] ?? 'unknown',
                month: group.month,
                tokenTotal: group.totalTokens,
            }))
            .sort((a, b) => a.month.localeCompare(b.month) || a.model.localeCompare(b.model))
    })

    const projectUsage = computed<ProjectUsageItem[]>(() => {
        const projects = new Map<string, {
            costUSD: number
            repository: string
            sessions: number
            tokenTotal: number
        }>()

        for (const session of sessionUsage.value) {
            const project = projects.get(session.project) ?? {
                costUSD: 0,
                repository: session.repository,
                sessions: 0,
                tokenTotal: 0,
            }
            project.costUSD += session.costUSD
            project.sessions += 1
            project.tokenTotal += session.tokenTotal
            projects.set(session.project, project)
        }

        const maxCost = Math.max(...Array.from(projects.values()).map(project => project.costUSD), 0)

        return Array.from(projects.entries())
            .map(([label, project]) => ({
                label,
                repository: project.repository,
                sessions: project.sessions,
                tokenTotal: project.tokenTotal,
                costUSD: project.costUSD,
                value: formatCurrency(project.costUSD),
                detail: `${project.sessions} sessions / ${formatCompactNumber(project.tokenTotal)} tokens`,
                percent: maxCost > 0 ? (project.costUSD / maxCost) * 100 : 0,
                tone: 'amber' as const,
            }))
            .sort((a, b) => b.costUSD - a.costUSD)
    })

    const todaySessions = computed(() => sessionUsage.value.filter(session => getDateKey(new Date(session.startedAt)) === todayDateKey))
    const todayTotalTokens = computed(() => todaySessions.value.reduce((sum, session) => sum + session.tokenTotal, 0))
    const todayTotalCost = computed(() => todaySessions.value.reduce((sum, session) => sum + session.costUSD, 0))
    const todayTopProject = computed(() => getTopSessionProject(todaySessions.value))
    const todayTopModel = computed(() => getTopModel(todaySessions.value))

    const overviewCards = computed(() => [
        {
            icon: 'solar:cpu-line-duotone',
            name: '今日消耗 Tokens',
            trend: `${todaySessions.value.length} sessions`,
            trendTone: 'neutral' as const,
            value: formatCompactNumber(todayTotalTokens.value),
        },
        {
            icon: 'lucide:wallet',
            name: '今日消耗费用',
            trend: `${formatCompactNumber(todaySessions.value.reduce((sum, session) => sum + session.cachedInputTokens, 0))} cached`,
            trendTone: 'neutral' as const,
            value: formatCurrency(todayTotalCost.value),
        },
        {
            icon: 'lucide:folder-git-2',
            name: '今日最高会话项目',
            trend: todayTopProject.value ? `${todayTopProject.value.sessionCount} sessions` : 'No sessions',
            trendTone: 'up' as const,
            value: todayTopProject.value?.project ?? 'No data',
        },
        {
            icon: 'lucide:bot',
            name: '今日调用最高模型',
            trend: todayTopModel.value ? `${formatCompactNumber(todayTopModel.value.totalTokens)} tokens` : 'No usage',
            trendTone: 'up' as const,
            value: todayTopModel.value?.model ?? 'No data',
        },
    ])

    return {
        dailyRows,
        dailyTokenUsage,
        monthlyModelUsage,
        monthlyRows,
        overviewCards,
        projectUsage,
        sessionRows,
        sessionUsage,
        todayTopModel,
        todayTopProject,
        todayTotalCost,
        todayTotalTokens,
        weeklyRows,
    }
}

function toCodexSessionUsageItem(item: CodexSessionSourceItem): CodexSessionUsageItem {
    const startedAt = new Date(item.startedAt)
    const tokenTotal = item.inputTokens + item.outputTokens

    return {
        ...item,
        id: item.sessionId,
        date: formatDateLabel(startedAt),
        duration: formatDuration(item.durationMinutes),
        month: getMonthKey(startedAt),
        tokenTotal,
        week: getWeekLabel(startedAt),
    }
}

function buildDailyTokenUsage(sessions: CodexSessionUsageItem[]) {
    const groups = aggregateSessions(sessions, session => session.date)

    return Array.from(groups.values())
        .map(group => ({
            date: group.label,
            inputTokens: group.inputTokens,
            cachedInputTokens: group.cachedInputTokens,
            outputTokens: group.outputTokens,
            reasoningOutputTokens: group.reasoningOutputTokens,
            totalTokens: group.totalTokens,
            costUSD: group.costUSD,
            models: Object.fromEntries(group.models.map((model) => {
                const modelSessions = group.sessions.filter(session => session.model === model)

                return [model, {
                    inputTokens: modelSessions.reduce((sum, session) => sum + session.inputTokens, 0),
                    cachedInputTokens: modelSessions.reduce((sum, session) => sum + session.cachedInputTokens, 0),
                    outputTokens: modelSessions.reduce((sum, session) => sum + session.outputTokens, 0),
                    reasoningOutputTokens: modelSessions.reduce((sum, session) => sum + session.reasoningOutputTokens, 0),
                    totalTokens: modelSessions.reduce((sum, session) => sum + session.tokenTotal, 0),
                    isFallback: false,
                }]
            })),
        }))
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
}

function buildPeriodRows(sessions: CodexSessionUsageItem[], periodType: 'month' | 'week') {
    const groups = aggregateSessions(sessions, session => periodType === 'month' ? session.month : session.week)

    return Array.from(groups.values())
        .map(group => ({
            id: group.label,
            label: group.label,
            period: group.label,
            models: group.models,
            projects: group.projects,
            sessionCount: group.sessions.length,
            inputTokens: group.inputTokens,
            cachedInputTokens: group.cachedInputTokens,
            outputTokens: group.outputTokens,
            reasoningOutputTokens: group.reasoningOutputTokens,
            totalTokens: group.totalTokens,
            costUSD: group.costUSD,
        }))
        .sort((a, b) => b.id.localeCompare(a.id))
}

function aggregateSessions(
    sessions: CodexSessionUsageItem[],
    getKey: (session: CodexSessionUsageItem) => string,
) {
    const groups = new Map<string, {
        cachedInputTokens: number
        costUSD: number
        inputTokens: number
        label: string
        models: string[]
        month: string
        outputTokens: number
        projects: string[]
        reasoningOutputTokens: number
        sessions: CodexSessionUsageItem[]
        totalTokens: number
    }>()

    for (const session of sessions) {
        const key = getKey(session)
        const group = groups.get(key) ?? {
            cachedInputTokens: 0,
            costUSD: 0,
            inputTokens: 0,
            label: key,
            models: [],
            month: session.month,
            outputTokens: 0,
            projects: [],
            reasoningOutputTokens: 0,
            sessions: [],
            totalTokens: 0,
        }

        group.cachedInputTokens += session.cachedInputTokens
        group.costUSD += session.costUSD
        group.inputTokens += session.inputTokens
        group.models = uniqueItems([...group.models, session.model])
        group.outputTokens += session.outputTokens
        group.projects = uniqueItems([...group.projects, session.project])
        group.reasoningOutputTokens += session.reasoningOutputTokens
        group.sessions.push(session)
        group.totalTokens += session.tokenTotal
        groups.set(key, group)
    }

    return groups
}

function getTopSessionProject(sessions: CodexSessionUsageItem[]) {
    const projects = new Map<string, number>()

    for (const session of sessions) {
        projects.set(session.project, (projects.get(session.project) ?? 0) + 1)
    }

    const topProject = Array.from(projects.entries()).sort((a, b) => b[1] - a[1])[0]

    return topProject
        ? {
                project: topProject[0],
                sessionCount: topProject[1],
            }
        : null
}

function getTopModel(sessions: CodexSessionUsageItem[]) {
    const models = new Map<string, number>()

    for (const session of sessions) {
        models.set(session.model, (models.get(session.model) ?? 0) + session.tokenTotal)
    }

    const topModel = Array.from(models.entries()).sort((a, b) => b[1] - a[1])[0]

    return topModel
        ? {
                model: topModel[0],
                totalTokens: topModel[1],
            }
        : null
}

function parseDateLabel(label: string) {
    return new Date(label)
}

function getDateKey(date: Date) {
    return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
}

function getMonthKey(date: Date) {
    return getDateKey(date).slice(0, 7)
}

function getWeekLabel(date: Date) {
    const weekStart = cloneDate(date)
    const day = weekStart.getDay()
    const diff = day === 0 ? -6 : 1 - day
    weekStart.setDate(weekStart.getDate() + diff)

    const weekEnd = cloneDate(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    return `${getDateKey(weekStart)} - ${getDateKey(weekEnd)}`
}

function cloneDate(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatDateLabel(date: Date) {
    return new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date)
}

function formatDuration(minutes: number) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60

    if (hours === 0) {
        return `${remainingMinutes}m`
    }

    if (remainingMinutes === 0) {
        return `${hours}h`
    }

    return `${hours}h ${remainingMinutes}m`
}

function uniqueItems(items: string[]) {
    return Array.from(new Set(items))
}
