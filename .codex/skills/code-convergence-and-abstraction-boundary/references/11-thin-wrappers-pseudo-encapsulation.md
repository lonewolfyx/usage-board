# Thin Wrappers and Fake Encapsulation

## Applicability

Use this reference before adding a wrapper, service, manager, helper, composable, hook, interface, abstract class, adapter, configuration object, or third-party API facade.

## Best Practices

1. Keep a wrapper only when it adds business semantics, isolates change, unifies an entry point, stabilizes a public API, protects against third-party churn, supports runtime adaptation, or enables testing and dependency injection.
2. Call the original function directly when the proposed wrapper only forwards parameters or renames a call.
3. Avoid complex abstractions for a single call site unless the abstraction is a public API, an external dependency boundary, or a known variation point.
4. Define interfaces or abstract classes only when there are real multiple implementations, test substitutes, plugins, or runtime adapters.
5. Reuse standard library and existing project utilities instead of reimplementing generic utilities.

## Do Not

1. Do not create thin wrapper functions with no business value.
2. Do not create wrappers that only forward parameters without adding semantics or isolating change.
3. Do not rename a function through a second wrapper without changing responsibility.
4. Do not build meaningless chains of pass-through calls.
5. Do not create `service`, `manager`, or `helper` modules only to look layered.
6. Do not wrap third-party APIs without semantic value.
7. Do not create pointless parameter wrappers or configuration-object wrappers.
8. Do not force two or three simple parameters into a configuration object with no extension value.
9. Do not create complex abstractions for a single call site.
10. Do not introduce premature abstractions without real variation points.
11. Do not create abstraction layers without actual multiple implementations.
12. Do not define an interface or abstract class when there is only one implementation and no substitution need.
13. Do not disguise a plain pure function as a composable or hook.
14. Do not reimplement standard or existing utility capabilities such as `deepClone`, `debounce`, `isEmpty`, `pick`, or `omit`.

## Allowed Exceptions

1. Stable public API wrappers are allowed.
2. Third-party dependency isolation wrappers are allowed.
3. Cross-platform, cross-runtime, or cross-framework adapters are allowed.
4. Interfaces for testing, dependency injection, or plugin systems are allowed.

