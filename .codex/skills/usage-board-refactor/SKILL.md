---
name: usage-board-refactor
description: Use when refactoring or cleaning the usage-board project, especially to remove unused functions/constants including unused exports, reduce repeated logic without adding trivial wrapper functions, improve readability, and preserve token/cost/session data accuracy. Applies to Vue, Nuxt, shared analytics utilities, websocket module loading, and dashboard aggregation code in this repository.
---

# Usage Board Refactor

Use this skill when working inside the `usage-board` repository on cleanup, refactor, or readability improvements.

## Goals

- Remove unused functions, constants, and exports.
- Reduce repeated logic only when the new shape is meaningfully clearer.
- Keep token, cost, session, cache, and date aggregation behavior unchanged unless the task explicitly asks for behavior changes.
- Prefer smaller diffs that improve readability over large architectural rewrites.

## Non-goals

- Do not add wrapper helpers that only rename or forward an existing call.
- Do not extract functions like `const a = () => c()` or `const b = () => c()` just to make code “look reusable”.
- Do not introduce abstraction layers that hide where data comes from.
- Do not rewrite stable calculations unless there is a correctness bug or a very clear readability win.

## Working Rules

### 1. Delete unused code aggressively

- Treat unused exported functions/constants as removable, not protected.
- Check both static diagnostics and repository-wide references.
- After deleting one export, rescan for newly exposed unused helpers nearby.

### 2. Collapse repeated patterns, not meaningful differences

Good targets:

- repeated module-to-state branching
- repeated payload selection logic
- repeated card-building structures with the same domain fields
- repeated “same shape, different module key” control flow

Avoid collapsing:

- calculations that differ in business meaning
- formatting that is only coincidentally similar
- small call sites that become harder to trace after extraction

### 3. Prefer data-shaped refactors

Prefer these patterns over long `if`/`switch` ladders when they improve clarity:

- keyed maps for module state or payload defaults
- builder tables for module-specific return payloads
- shared card constructors when the cards use the same domain summary

Do not use them if they make types or control flow harder to follow.

### 4. Preserve analytics accuracy

When touching analytics code, preserve:

- date label and date key behavior
- token totals and cache token totals
- cost rounding rules
- session counting rules
- platform scoping (`all`, `claudeCode`, `codex`, `gemini`)

Any refactor around these areas must keep the same data source and formula unless the user asked for a behavior change.

## Repository-specific hotspots

Bias refactors toward these patterns in this repo:

- `app/composables/useProjectDashboard.ts`
  Reduce repeated module lookup and loading logic with typed module maps.
- `shared/utils/project-dashboard.ts`
  Merge repeated overview-card structures only when they share the same summary model.
- `shared/platform/project.ts`
  Replace repeated module payload branching with explicit module payload builders when clearer.
- `shared/utils/*`
  Remove dead exports and keep shared helpers close to actual business concepts.

## Validation

After cleanup or refactor, run the smallest relevant checks:

- `./node_modules/.bin/tsc --noEmit --noUnusedLocals --noUnusedParameters -p tsconfig.cli.json`
- `pnpm lint`
- targeted `pnpm test ...` commands for analytics or project dashboard behavior when affected

If full test coverage is too expensive or flaky, say so explicitly and run the narrowest useful subset.

## Output Style

- Keep explanations short and concrete.
- Call out deleted unused exports explicitly.
- When reducing duplication, explain the pattern you collapsed in one sentence.
- Mention validation results and any known remaining test gaps.
