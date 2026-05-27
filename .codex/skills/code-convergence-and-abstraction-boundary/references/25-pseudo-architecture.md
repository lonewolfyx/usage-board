# Pseudo Architecture and Over-Layering

## Applicability

Use this reference when adding controllers, services, repositories, models, Strategy, Factory, Observer, Chain, providers, adapters, drivers, registries, plugin systems, global frameworks, or architectural layers.

## Best Practices

An abstraction is valid only when it satisfies at least one condition:

1. Multiple real implementations exist.
2. A clear variation point exists.
3. Cross-module reuse exists.
4. External dependency isolation is required.
5. Test substitution is required.
6. Runtime adaptation is required.
7. Public API stability is required.

Use design patterns only when real variation points and real complexity exist.

## Do Not

1. Do not add meaningless layers only to look architectural.
2. Do not create controller, service, repository, and model layers that only pass data through.
3. Do not create abstractions without reuse, variation isolation, or boundary meaning.
4. Do not use design patterns for their own sake.
5. Do not force Strategy, Factory, Observer, Chain, or similar patterns without real variation points.
6. Do not make simple logic complex.
7. Do not turn a local problem into a global framework.
8. Do not create higher maintenance cost just to eliminate small repetition.
9. Do not design a plugin system before a business variation point exists.
10. Do not design providers, adapters, or drivers before multiple implementations are needed.
11. Do not design registries or factories before extension scenarios exist.
12. Do not sacrifice current readability for hypothetical extensibility.

