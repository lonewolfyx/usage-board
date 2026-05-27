# Naming Duplication and Concept Drift

## Applicability

Use this reference when domain concepts, file names, function names, type names, export names, directory names, public APIs, import paths, `utils`, `common`, `shared`, `helpers`, `base`, or suffixes such as `handler`, `processor`, `resolver`, and `service` are mixed without clear semantic differences.

## Best Practices

1. Use one name for one concept.
2. Require different names to represent different semantics.
3. Use suffixes only when they express responsibility differences.
4. Keep one recommended public API entry point.
5. Establish or follow a domain glossary to prevent synonym drift.

## Do Not

1. Do not use multiple synonyms for the same business concept.
2. Do not mix `user`, `member`, and `account` unless they represent distinct domain concepts.
3. Do not mix `repo`, `repository`, and `project` unless they represent distinct domain concepts.
4. Do not mix `handler`, `processor`, `resolver`, and `service` unless responsibilities differ.
5. Do not overuse vague names such as `Helper`, `Utils`, `Manager`, `Common`, or `Base`.
6. Do not invent synonyms only to avoid a naming conflict.
7. Do not expose multiple public import paths for the same capability.
8. Do not let exported names conflict with internal responsibility.
9. Do not name code as if it does one thing when its logic does another.
10. Do not use different file, function, or type names for the same responsibility.
11. Do not let `common`, `shared`, or `utils` become dumping-ground directories.
12. Do not leave business concepts without a shared glossary.

