<div align="center">
    <img src="https://cdn.jsdelivr.net/gh/lonewolfyx/usage-board@master/public/logo.svg" alt="usage-board logo" width="256" height="256">
    <h1>usage-board</h1>
</div>
<div align="center">
    <img src="https://cdn.jsdelivr.net/gh/lonewolfyx/usage-board@master/Snapshot.png" alt="usage-board">
</div>


An all-in-one dashboard to quickly analyze token usage from local json files

## Quick Start

```bash
npx usage-board@latest
```

After starting, follow the terminal prompts to open the local page and view the usage dashboard.

## Features

- Overview of core metrics: AI Coding token usage, costs, session counts
- Daily token consumption and cost trends by date
- Monthly statistics for model usage distribution and consumption changes
- Project-based analysis of token and cost distribution
- Session-level usage details including model, duration, input tokens, output tokens, cache tokens, and costs
- Codex usage data dashboard with multi-dimensional views (daily, weekly, monthly, by session)
- Token heatmap for quickly identifying high-frequency or high-consumption dates
- Cache hit and token efficiency metrics to help optimize usage costs
- Built with Nuxt, suitable for extending into team or personal AI usage analysis tools

## Development

Install dependencies:

```bash
pnpm install
```

Start the local development server:

```bash
pnpm dev
```

Default access URL:

```bash
http://localhost:3000
```

Common development commands:

```bash
# Type checking
pnpm typecheck

# Linting
pnpm lint

# Auto-fix code style
pnpm lint:fix

# Build for production
pnpm build

# Preview production build locally
pnpm preview
```

## License

This project is open-sourced under the MIT License.

This project is extended from [`ryoppippi/ccusage`](https://github.com/ryoppippi/ccusage). Thanks to the original project author and community contributors.
