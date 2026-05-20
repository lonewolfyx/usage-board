# usage-board Agent Guide

## 项目定位

`usage-board` 是一个本地 AI 使用量分析面板，读取 Claude Code、Codex、Gemini 的本地日志文件，聚合出 token、成本、会话、模型和项目维度的数据，再通过 Nuxt 页面展示出来。

这个仓库不是一个典型的后端 API 服务，更像是：

1. 一套本地日志解析与聚合逻辑。
2. 一个 Nuxt 前端面板。
3. 一个打包后的本地 CLI 启动器。

如果要改功能，优先先判断你改的是：

- 平台日志解析
- 聚合/统计口径
- 页面展示
- 项目维度的 WebSocket 按模块加载

## 技术栈

- Nuxt 4
- Vue 3 + `<script setup lang="ts">`
- TypeScript
- Nitro `node` preset
- Tailwind CSS 4
- `shadcn-nuxt` + `reka-ui`
- Vitest
- `tsdown` 打包 CLI

关键配置见：

- `nuxt.config.ts`
- `vitest.config.ts`
- `tsdown.config.ts`
- `package.json`

## 常用命令

```bash
pnpm dev
pnpm build
pnpm preview
pnpm typecheck
pnpm lint
pnpm test --run
```

补充说明：

- `pnpm build` 会先跑 `nuxt build`，再跑 `tsdown`，最后删除 `dist/nitro.json`。
- CLI 入口在 `bin/cli.js`，实际逻辑入口在 `src/index.ts`。
- 测试配置里 `vitest.config.ts` 开了 `test.update = true`，所以运行测试时快照可能会被自动刷新，提交前务必确认快照变化是否真的是你想要的。

## 先看哪些文件

如果你是第一次接手这个仓库，建议按这个顺序读：

1. `nuxt.config.ts`
2. `server/api/payload.json.ts`
3. `app/composables/useUsageDashboard.ts`
4. `app/composables/useProjectDashboard.ts`
5. `shared/platform/claude_code.ts`
6. `shared/platform/codex.ts`
7. `shared/platform/gemini.ts`
8. `shared/platform/project.ts`
9. `shared/utils/usage-dashboard.ts`
10. `shared/utils/project-dashboard.ts`

这样能最快看懂“数据从哪里来，怎么被聚合，最后怎么显示”。

## 目录职责

### `app/`

前端页面、页面容器组件、组合式函数、样式都在这里。

- `app/app.vue`
  - 应用根节点，注入 `PayloadProvider`、`PayloadStatusBoundary`、`NuxtLayout`。
- `app/pages/index.vue`
  - 总览页，聚合所有产品的数据。
- `app/pages/[product].vue`
  - 产品页，根据 slug 渲染 Claude Code / Codex / Gemini 单产品面板。
- `app/pages/project.vue`
  - 项目维度面板，走 WebSocket 按模块加载。
- `app/composables/usePayloadDashboard.ts`
  - 从统一 payload 中抽出单产品 dashboard 数据。
- `app/composables/useUsageDashboard.ts`
  - 把三个产品的数据合并为首页总览数据。
- `app/composables/useProjectDashboard.ts`
  - 项目面板的核心 orchestration，包含项目列表加载、模块串行请求、WebSocket 生命周期、tab 视图计算。
- `app/components/ui/`
  - 通用 UI 封装，主要是 shadcn/reka 组件，不要把业务聚合逻辑塞进这里。

### `server/`

Nuxt/Nitro 服务端入口。

- `server/api/payload.json.ts`
  - 首页与产品页的数据入口。
  - 会调用 `loadClaudeCodeUsage`、`loadCodexUsage`、`loadGeminiUsage`。
- `server/routes/ws.ts`
  - 项目页 WebSocket 路由。
  - 支持 `project` 和 `project_data` 两种消息。

### `shared/`

仓库真正的业务核心在这里。

- `shared/platform/*.ts`
  - 各平台日志读取、解析、成本估算、会话归并。
- `shared/platform/project.ts`
  - 把平台级数据进一步组装成项目级数据和模块化响应。
- `shared/utils/*.ts`
  - 解析 JSON/JSONL、时间格式化、usage 聚合、图表辅助函数。
- `shared/types/*.ts`
  - 前后端共享的类型定义。

### `src/` 与 `bin/`

CLI 启动相关。

- `src/index.ts`
  - 启动本地 HTTP 服务，挂上 Nitro listener 和 WebSocket upgrade。
- `bin/cli.js`
  - npm bin 入口，转发到构建产物。

## 运行时数据流

### 首页 / 产品页

数据链路如下：

1. `PayloadProvider.vue` 在非 `/project` 路由下请求 `/api/payload.json`
2. `server/api/payload.json.ts` 调用三个平台 loader
3. loader 返回统一结构 `LoadUsageResult`
4. 页面通过 `usePayloadDashboard()` 或 `useUsageDashboard()` 读取并做二次组合
5. 各种图表/表格组件只负责展示

这里的核心原则是：

- 产品级数据先在 `shared/platform/*` 做统一聚合
- 页面层只做轻量组合，不重新发明统计口径

### 项目页

`/project` 路由不走 `/api/payload.json`，而是单独走 WebSocket：

1. `PayloadProvider.vue` 识别 `/project`，不会发 payload 请求
2. `useProjectDashboard.ts` 建立到 `/ws` 的连接
3. 先请求项目目录 catalog
4. 选中项目后，按固定顺序加载模块：
   - `meta`
   - `daily_trend`
   - `model_usage`
   - `token_usage`
   - `session_list`
5. 前端把模块组合成项目页各 tab 的图表与表格

注意：

- 项目页请求是串行排队的，不是并发乱发。
- WebSocket 请求有超时控制。
- 项目页刻意做成“模块化返回”，减少一次返回过大的 payload。

## 统一数据模型

先理解这几个类型：

- `LoadUsageResult`
  - 产品级 dashboard 的标准返回结构。
- `TokensConsumptionResult`
  - `/api/payload.json` 返回的总 payload。
- `ProjectUsageDetail`
  - 项目级完整结构。
- `ProjectUsageDataModuleResponse`
  - 项目级模块化响应结构。

相关定义见：

- `shared/types/usage-dashboard.ts`
- `shared/types/project-dashboard.ts`
- `shared/types/ws.ts`

如果要加字段，尽量从类型层开始推，再让 platform -> utils -> composable -> component 依次跟上。

## 平台适配层怎么工作

### Claude Code

- 来源目录由 `getClaudeCodePaths()` 解析。
- 默认会找：
  - `~/.config/claude`
  - `~/.claude`
- 也支持环境变量 `CLAUDE_CONFIG_DIR`。
- 读取的是 `projects/**/*.jsonl`。

入口：

- `shared/platform/claude_code.ts`

### Codex

- 默认目录来自 `CODEX_HOME`，否则回落到 `~/.codex`。
- 读取 `sessions/**/*.jsonl` 和 `session_index.jsonl`。
- token 事件来自 `event_msg` 里的 `token_count`。
- 某些日志只给累计值，所以代码里会做 delta 还原。

入口：

- `shared/platform/codex.ts`

### Gemini

- 默认目录是 `~/.gemini`。
- 读取 `tmp/*/chats/session-*.json` 与 `sessions-*.json`。
- 使用消息级 token 快照拼出 usage 事件。

入口：

- `shared/platform/gemini.ts`

### 成本估算

- 统一在 `shared/platform/pricing.ts`
- 优先取 LiteLLM pricing 数据集
- 网络失败时自动回退到内置 pricing 表

这意味着：

- 不要把“获取价格失败”当成致命错误
- 成本估算逻辑应尽量继续工作，哪怕只用 fallback 数据

## 改动时的推荐落点

### 如果你要改统计口径

优先看：

- `shared/utils/usage-dashboard.ts`
- `shared/utils/project-dashboard.ts`
- `shared/platform/project.ts`

不要直接在页面组件里硬算。

### 如果你要改平台解析

优先看：

- `shared/platform/claude_code.ts`
- `shared/platform/codex.ts`
- `shared/platform/gemini.ts`
- `shared/utils/platform.ts`

### 如果你要改首页/产品页 UI

优先看：

- `app/pages/index.vue`
- `app/pages/[product].vue`
- `app/components/Dashboard/*`
- `app/components/StatisticalAnalysis/*`
- `app/components/UsageAnalytics/*`

### 如果你要改项目页

优先看：

- `app/pages/project.vue`
- `app/composables/useProjectDashboard.ts`
- `server/routes/ws.ts`
- `shared/platform/project.ts`

## 这个仓库的几个重要约定

### 1. 这是 SPA，不是 SSR 页面

`nuxt.config.ts` 里明确配置了：

- `ssr: false`

所以：

- 不要按 SSR 思路修 hydration 问题
- 浏览器端状态和 WebSocket 行为可以直接基于 client 环境处理

### 2. 页面层尽量保持薄，聚合逻辑放 shared/composables

当前仓库已经形成了比较清晰的分层：

- `shared/` 负责解析、聚合、格式化
- `app/composables/` 负责页面数据 orchestration
- `app/components/` 负责展示

继续沿这个方向改，成本最低。

### 3. `app/components/ui/` 主要是基础组件层

这里大部分是通用 UI 封装，不是业务逻辑层。除非你是在改设计系统，否则业务功能尽量别从这里切入。

### 4. 项目级统计要和产品级统计保持口径一致

`shared/platform/project.ts` 本质上是在复用平台数据做“按项目切片”。如果你改了产品级统计逻辑，通常也要检查项目级逻辑是否仍然对齐。

### 5. 日期相关逻辑有现成测试保护

仓库里特地测了一个关键行为：

- “历史上最近的一天”不能被误当成“今天”

相关测试见：

- `test/claude_code.test.ts`
- `test/codex.test.ts`
- `test/gemini.test.ts`
- `test/project_daily_rows.test.ts`

改日期逻辑时一定要跑测试。

### 6. 测试会自动刷新快照

再次强调：

- `vitest.config.ts` 配了 `update: true`

所以每次跑测试都要额外留意快照有没有被动更新。

### 7. 提交信息有 hook 限制

`scripts/verify-commit.js` 会校验 commit message，要求类似：

- `feat(scope): ...`
- `fix(scope): ...`

如果你要代为提交，别用随手写的提交信息。

## 新增平台时的最小改动清单

如果未来要支持新的 AI 产品，不要只改页面，至少要同步处理这些位置：

1. 在 `shared/platform/` 新增 loader，并在 `shared/platform/index.ts` 导出。
2. 扩展 `shared/types/usage-dashboard.ts` 中的 payload 类型。
3. 让 `server/api/payload.json.ts` 返回新平台数据。
4. 更新 `app/lib/dashboard-products.ts`，补导航和路由映射。
5. 更新 `app/composables/useUsageDashboard.ts` 的聚合 key 列表。
6. 更新 `shared/utils/project-dashboard.ts` 的平台 tab 和元信息。
7. 如果项目页也要支持，更新 `shared/platform/project.ts` 的平台常量与聚合逻辑。
8. 补测试。

## 样式与代码风格

从现有配置看，保持这些约定最稳妥：

- TypeScript
- Vue SFC 使用 `<script setup lang="ts">`
- 4 空格缩进
- 单引号
- 命名偏语义化，不追求极短变量名

样式入口：

- `app/assets/css/main.css`

这里已经定义了主题变量、暗色模式变量和一些全局滚动/过渡行为。做全局视觉改动时先看这里。

## 验证建议

本仓库适合的验证顺序通常是：

1. `pnpm typecheck`
2. `pnpm test --run`
3. `pnpm lint`

如果改了页面，再额外跑：

4. `pnpm dev`

## 当前状态备注

我在阅读仓库后实际执行过：

```bash
pnpm test --run
```

结果是：

- 8 个测试文件通过
- 19 个测试通过

## 给后续 agent 的一句话建议

这个仓库真正的复杂点不在 UI，而在“本地日志解析 + 统一聚合口径 + 项目级切片”。遇到问题时，先回到 `shared/platform/*` 和 `shared/utils/*` 找源头，再决定要不要改页面层。
