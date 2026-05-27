# Duplicate Files and Directory Structure

## Applicability

Use this reference when adding or changing directories, files, barrel exports, `shared`, `core`, `common`, `utils`, `helpers`, module boundaries, public exports, or cross-module reuse paths.

## Best Practices

1. Give each directory one primary responsibility.
2. Assign every shared capability a clear owner.
3. Prevent domain modules from depending on other domain modules' internals.
4. Move cross-module reuse into an explicit `shared`, `core`, or package boundary.
5. Use barrel exports to define public APIs, not to hide unclear structure.

## Do Not

1. Do not keep multiple directories that own files with the same responsibility.
2. Do not let `utils`, `shared`, `common`, and `helpers` carry the same capability at the same time.
3. Do not keep both `core` and `shared` in the same module without clear boundaries.
4. Do not create empty directories for the appearance of layering.
5. Do not create empty modules for the appearance of layering.
6. Do not create empty barrel files for the appearance of layering.
7. Do not duplicate exports of the same capability across multiple barrel files.
8. Do not keep files with different names but highly similar contents.
9. Do not copy an old module and only change the business name without revisiting responsibility boundaries.
10. Do not expose the same capability through both deep paths and root entries without a recommendation.
11. Do not let directory structure express boundaries that code dependencies violate.

