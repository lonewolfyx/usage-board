# Duplicate Configuration and Engineering Templates

## Applicability

Use this reference when changing `tsconfig`, ESLint, Vite, Vitest, Tailwind, tsup, tsdown, `package.json` scripts, dependencies, monorepo shared configuration, build workflows, release workflows, test workflows, environment variables, or environment schemas.

## Best Practices

1. Use shared configuration packages or presets.
2. Use workspace-level dependency version management.
3. Use unified scripts for equivalent tasks.
4. Use unified lint, test, and build presets.
5. Manage environment variables through a schema.
6. Maintain each engineering rule in one place and have packages inherit or reference it.

## Do Not

1. Do not copy the same `tsconfig` across multiple packages.
2. Do not copy the same ESLint configuration across multiple packages.
3. Do not copy the same Vite configuration across multiple packages.
4. Do not copy the same Vitest configuration across multiple packages.
5. Do not copy the same Tailwind configuration across multiple packages.
6. Do not copy the same tsup or tsdown configuration across multiple packages.
7. Do not copy the same `package.json` scripts across multiple packages.
8. Do not duplicate dependency rules with inconsistent versions across packages.
9. Do not leave monorepo shared configuration decentralized.
10. Do not keep multiple equivalent build, release, or test workflows.
11. Do not duplicate configuration items across files.
12. Do not define environment variables in scattered places without schema validation.
13. Do not let lint, format, test, or build rules behave inconsistently across packages.

