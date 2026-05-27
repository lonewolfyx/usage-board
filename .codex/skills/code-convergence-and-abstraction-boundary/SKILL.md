---
name: code-convergence-and-abstraction-boundary
description: Use when writing, refactoring, reviewing, or cleaning code in this project to enforce the repository's code convergence and abstraction boundary rules. Applies to duplicate logic, fake abstractions, thin wrappers, repeated types, repeated UI/state/API/style/config/test/docs structures, pseudo-architecture, uncontrolled complexity, mirror constants, mirror variables, mirror function bodies, derived mirrors, and intermediate mirror constants.
---

# Code Convergence and Abstraction Boundary

Use this skill for any code implementation, refactor, cleanup, or review in this repository where duplication, abstraction boundaries, naming convergence, shared logic, or architectural shape are involved.

## Reference Map

Always read [references/00-goals-principles.md](references/00-goals-principles.md), [references/01-convergence-triggers.md](references/01-convergence-triggers.md), and [references/02-non-convergence-exceptions.md](references/02-non-convergence-exceptions.md) first. Then read every reference file that matches the files or behavior being changed.

Read all reference files for broad refactors, cleanup work, code reviews, or changes that cross module boundaries.

Core decision files:

- [references/00-goals-principles.md](references/00-goals-principles.md): goals, principles, abstraction value, and one-trusted-entry expectations.
- [references/01-convergence-triggers.md](references/01-convergence-triggers.md): conditions that require convergence.
- [references/02-non-convergence-exceptions.md](references/02-non-convergence-exceptions.md): allowed cases for leaving repetition in place.

Detailed prohibition files:

- [references/10-duplicate-functions-logic.md](references/10-duplicate-functions-logic.md): duplicate functions, callbacks, business logic, data processing, conversion, formatting, validation, error handling, async state, and fallbacks.
- [references/11-thin-wrappers-pseudo-encapsulation.md](references/11-thin-wrappers-pseudo-encapsulation.md): thin wrappers, fake encapsulation, meaningless helpers, pseudo-composables, premature interfaces, and no-value third-party wrappers.
- [references/12-types-pseudo-types.md](references/12-types-pseudo-types.md): duplicate types, pseudo-types, DTO/VO/Form/Model duplication, repeated enums, repeated const maps, and runtime/type value drift.
- [references/13-components-composables.md](references/13-components-composables.md): duplicate components, props, emits, slots, composables, hooks, UI behavior, and `useXxx` naming.
- [references/14-api-requests.md](references/14-api-requests.md): duplicate API entry points, request construction, response normalization, request boundaries, cache, retry, timeout, and cancellation.
- [references/15-state-store.md](references/15-state-store.md): duplicate state, stores, filters, pagination, sorting, cache, refresh, derived state, local/store/query boundaries, and server state.
- [references/16-events-side-effects.md](references/16-events-side-effects.md): event listeners, subscriptions, timers, keyboard shortcuts, resize, scroll, visibilitychange, watch, and side-effect cleanup.
- [references/17-style-ui-variants.md](references/17-style-ui-variants.md): repeated Tailwind classes, base component styles, UI state styles, variants, dark mode, responsive layout, and design tokens.
- [references/18-magic-values-constants.md](references/18-magic-values-constants.md): magic strings, magic numbers, routes, keys, regexes, intervals, page sizes, defaults, and repeated constants.
- [references/19-naming-concept-drift.md](references/19-naming-concept-drift.md): naming drift, concept drift, vague utility buckets, public import paths, export names, and terminology.
- [references/20-config-templates.md](references/20-config-templates.md): repeated tsconfig, eslint, vite, vitest, tailwind, bundler configs, scripts, dependency rules, env, and build/test flows.
- [references/21-dependencies.md](references/21-dependencies.md): duplicate dependency capabilities and dependency introduction checks.
- [references/22-tests.md](references/22-tests.md): duplicate tests, meaningless tests, mock-only tests, helpers, fixtures, and behavior coverage.
- [references/23-docs-comments.md](references/23-docs-comments.md): duplicate docs, comments, examples, TODOs, FIXME, and comment value.
- [references/24-files-directories.md](references/24-files-directories.md): duplicate files, directories, shared/common/utils/helpers boundaries, barrel exports, and public API paths.
- [references/25-pseudo-architecture.md](references/25-pseudo-architecture.md): pseudo-architecture, over-layering, design patterns, provider/adapter/driver, registry/factory, and valid abstraction conditions.
- [references/26-complexity.md](references/26-complexity.md): nesting, deep branches, God functions/classes, mixed responsibilities, complex conditions, and complexity reduction.
- [references/27-mirrors.md](references/27-mirrors.md): mirror constants, mirror variables, mirror function bodies, derived mirrors, and intermediate mirror constants.

Convergence practice files:

- [references/30-function-convergence.md](references/30-function-convergence.md): function-level convergence patterns.
- [references/31-type-convergence.md](references/31-type-convergence.md): type convergence patterns.
- [references/32-component-convergence.md](references/32-component-convergence.md): component convergence patterns.
- [references/33-request-convergence.md](references/33-request-convergence.md): request convergence patterns.
- [references/34-state-convergence.md](references/34-state-convergence.md): state convergence patterns.
- [references/35-style-convergence.md](references/35-style-convergence.md): style convergence patterns.

The reference files are the complete source of truth for this skill. Apply them exactly.

## Operating Rules

- Enforce the reference rules as mandatory project constraints.
- Do not paraphrase the rules into weaker guidance when deciding whether code is acceptable.
- Do not create mirror constants, mirror variables, mirror function bodies, derived mirrors, or intermediate mirror constants.
- Prefer one trusted entry point for each stable capability, business rule, type, API call, style variant, state pattern, and shared behavior.
- Allow local repetition only when the reference explicitly allows it.
- Reject abstractions that do not add semantic value, type unification, behavioral unification, a stable entry point, an isolated variation point, lower maintenance cost, lower test cost, or lower caller cognitive load.

## Review Checklist

When touching code, check for:

- duplicated logic, data conversion, formatting, validation, error handling, async state, and fallback behavior;
- thin wrappers, fake encapsulation, meaningless layers, and premature abstractions;
- duplicated or semantically identical types, enums, const maps, DTOs, VOs, Forms, and Models;
- duplicated components, props, emits, slots, composables, hooks, UI interaction logic, and UI variants;
- duplicated API entry points, request paths, query construction, response normalization, headers, caching, retry, timeout, and cancellation logic;
- duplicated store state, local state, URL query state, cache logic, refresh logic, subscriptions, timers, and side effects;
- magic strings, magic numbers, repeated constants, scattered keys, scattered routes, and mirror values;
- naming drift, concept drift, multiple public import paths, vague utility buckets, and barrel exports that hide unclear boundaries;
- duplicated configs, dependencies, tests, docs, comments, files, directories, and pseudo-architecture;
- uncontrolled function, module, condition, and responsibility complexity.

## Output Requirements

- Mention the main convergence or boundary decision when it affects the implementation.
- If leaving repetition in place, state which allowed exception from the reference applies.
- If rejecting or removing an abstraction, state the concrete missing value.
