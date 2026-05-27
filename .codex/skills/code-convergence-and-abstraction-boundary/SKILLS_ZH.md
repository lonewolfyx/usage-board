---
name: code-convergence-and-abstraction-boundary
description: 在本项目中编写、重构、评审或清理代码时使用，用于执行代码收敛与抽象边界规则。适用于重复逻辑、伪抽象、薄包装、重复类型、重复 UI / 状态 / API / 样式 / 配置 / 测试 / 文档结构、伪架构、复杂度失控、镜像常量、镜像变量、镜像函数体、派生镜像和中间镜像常量。
---

# 代码收敛与抽象边界

当在本仓库中进行任何代码实现、重构、清理或评审，并且涉及重复、抽象边界、命名收敛、共享逻辑或架构形态时，使用这个 skill。

## Reference Map

始终先阅读 [references/00-goals-principles.md](references/00-goals-principles.md)、[references/01-convergence-triggers.md](references/01-convergence-triggers.md) 和 [references/02-non-convergence-exceptions.md](references/02-non-convergence-exceptions.md)。然后阅读所有与当前修改文件或行为匹配的 reference 文件。

对于大范围重构、清理、代码评审或跨模块修改，阅读所有 reference 文件。

核心决策文件：

- [references/00-goals-principles.md](references/00-goals-principles.md)：目标、原则、抽象价值和单一可信入口要求。
- [references/01-convergence-triggers.md](references/01-convergence-triggers.md)：必须进行收敛的触发条件。
- [references/02-non-convergence-exceptions.md](references/02-non-convergence-exceptions.md)：允许保留重复的场景。

详细禁止规则文件：

- [references/10-duplicate-functions-logic.md](references/10-duplicate-functions-logic.md)：重复函数、回调、业务逻辑、数据处理、转换、格式化、校验、错误处理、异步状态和兜底逻辑。
- [references/11-thin-wrappers-pseudo-encapsulation.md](references/11-thin-wrappers-pseudo-encapsulation.md)：薄包装、伪封装、无意义 helper、伪 composable、过早 interface 和无价值第三方封装。
- [references/12-types-pseudo-types.md](references/12-types-pseudo-types.md)：重复类型、伪类型、DTO / VO / Form / Model 重复、重复 enum、重复 const map、运行时值与类型值域漂移。
- [references/13-components-composables.md](references/13-components-composables.md)：重复组件、props、emits、slots、composable、hook、UI 行为和 `useXxx` 命名。
- [references/14-api-requests.md](references/14-api-requests.md)：重复 API 入口、请求构造、响应规范化、请求边界、缓存、重试、超时和取消。
- [references/15-state-store.md](references/15-state-store.md)：重复状态、store、筛选、分页、排序、缓存、刷新、派生状态、本地 / store / query 边界和 server state。
- [references/16-events-side-effects.md](references/16-events-side-effects.md)：事件监听、订阅、定时器、快捷键、resize、scroll、visibilitychange、watch 和副作用清理。
- [references/17-style-ui-variants.md](references/17-style-ui-variants.md)：重复 Tailwind class、基础组件样式、UI 状态样式、variant、暗黑模式、响应式布局和 design token。
- [references/18-magic-values-constants.md](references/18-magic-values-constants.md)：magic string、magic number、路由、key、正则、时间间隔、分页大小、默认值和重复常量。
- [references/19-naming-concept-drift.md](references/19-naming-concept-drift.md)：命名漂移、概念漂移、模糊工具目录、公共导入路径、导出名称和领域术语。
- [references/20-config-templates.md](references/20-config-templates.md)：重复 tsconfig、eslint、vite、vitest、tailwind、打包配置、scripts、依赖规则、env 和构建 / 测试流程。
- [references/21-dependencies.md](references/21-dependencies.md)：重复依赖能力和新增依赖前检查。
- [references/22-tests.md](references/22-tests.md)：重复测试、无意义测试、只测 mock 的测试、helper、fixture 和行为覆盖。
- [references/23-docs-comments.md](references/23-docs-comments.md)：重复文档、注释、示例、TODO、FIXME 和注释价值。
- [references/24-files-directories.md](references/24-files-directories.md)：重复文件、目录、shared / common / utils / helpers 边界、barrel export 和公共 API 路径。
- [references/25-pseudo-architecture.md](references/25-pseudo-architecture.md)：伪架构、过度分层、设计模式、provider / adapter / driver、registry / factory 和有效抽象条件。
- [references/26-complexity.md](references/26-complexity.md)：嵌套、深层分支、God Function / Class、职责混杂、复杂条件和复杂度降低。
- [references/27-mirrors.md](references/27-mirrors.md)：镜像常量、镜像变量、镜像函数体、派生镜像和中间镜像常量。

收敛实践文件：

- [references/30-function-convergence.md](references/30-function-convergence.md)：函数级收敛模式。
- [references/31-type-convergence.md](references/31-type-convergence.md)：类型收敛模式。
- [references/32-component-convergence.md](references/32-component-convergence.md)：组件收敛模式。
- [references/33-request-convergence.md](references/33-request-convergence.md)：请求收敛模式。
- [references/34-state-convergence.md](references/34-state-convergence.md)：状态收敛模式。
- [references/35-style-convergence.md](references/35-style-convergence.md)：样式收敛模式。

reference 文件是这个 skill 的完整事实来源。必须严格应用。

## Operating Rules

- 将 reference 规则作为强制项目约束执行。
- 判断代码是否可接受时，不要把规则转述成更弱的指导意见。
- 不要创建镜像常量、镜像变量、镜像函数体、派生镜像或中间镜像常量。
- 对每个稳定能力、业务规则、类型、API 调用、样式 variant、状态模式和共享行为，优先保留一个可信入口。
- 只有 reference 明确允许时，才保留局部重复。
- 拒绝无法提供语义价值、类型统一、行为统一、稳定入口、隔离变化点、降低维护成本、降低测试成本或降低调用方认知成本的抽象。

## Review Checklist

修改代码时检查：

- 重复逻辑、数据转换、格式化、校验、错误处理、异步状态和兜底行为；
- 薄包装、伪封装、无意义层级和过早抽象；
- 重复或语义等价的类型、enum、const map、DTO、VO、Form 和 Model；
- 重复组件、props、emits、slots、composable、hook、UI 交互逻辑和 UI variant；
- 重复 API 入口、请求路径、query 构造、响应规范化、headers、缓存、重试、超时和取消逻辑；
- 重复 store state、local state、URL query state、缓存逻辑、刷新逻辑、订阅、定时器和副作用；
- magic string、magic number、重复常量、散落的 key、散落的路由和镜像值；
- 命名漂移、概念漂移、多个公共导入路径、模糊工具目录和掩盖边界问题的 barrel export；
- 重复配置、依赖、测试、文档、注释、文件、目录和伪架构；
- 函数、模块、条件和职责复杂度失控。

## Output Requirements

- 当实现受到收敛或边界判断影响时，说明主要判断。
- 如果保留重复，说明命中了 reference 中哪个允许例外。
- 如果拒绝或删除抽象，说明该抽象缺少哪种具体价值。
