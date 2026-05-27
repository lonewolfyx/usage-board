# Duplicate Types and Pseudo Types

## Applicability

Use this reference when adding or changing interfaces, type aliases, enums, const maps, DTOs, VOs, Forms, Models, union types, runtime constants, or type-level value domains.

## Best Practices

1. Use one domain type when structures and semantics match.
2. Derive type-level value domains from the same runtime `as const` source.
3. Split DTO, VO, Form, and Model shapes only when fields, lifecycle, validation, or semantics differ.
4. Prefer `Pick`, `Omit`, `Partial`, `Required`, generics, or branded types to express real structural differences.
5. Merge enum or const-object members when their semantics are identical.

## Do Not

1. Do not duplicate type definitions.
2. Do not create fully equivalent type aliases.
3. Do not rename the same type under a new alias without a new constraint.
4. Do not duplicate interfaces or types when fields and semantics are identical.
5. Do not create child interfaces with no new members and no new semantics.
6. Do not duplicate DTO, VO, Form, or Model declarations when fields, lifecycle, and validation do not differ.
7. Do not duplicate the same union type.
8. Do not duplicate the same enum.
9. Do not duplicate the same const map.
10. Do not define semantically identical members in different enums or const objects.
11. Do not hand-maintain runtime constants and type value domains separately.
12. Do not copy identical data structures only to express naming layers.
13. Do not wrap `string`, `number`, or `boolean` in aliases that add no constraint.
14. Do not define the same business entity type separately in multiple modules.
15. Do not name a type as if it is a new concept when its structure and semantics are unchanged.
16. Do not use excessive type gymnastics, conditional-type chains, `infer` chains, or recursive types unless they are necessary.

## Recommended Pattern

```ts
const userRoles = ['admin', 'member', 'guest'] as const

type UserRole = typeof userRoles[number]
```

