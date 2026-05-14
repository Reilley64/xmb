---
name: spec-check
description: Checks an implemented feature against its spec in the specs/ directory. Invoke as /spec-check <spec-name> e.g. /spec-check game-launcher
---

The user has passed a spec name as the argument (e.g. `game-launcher`, `xmb-navigation`, `settings`).

1. Read `specs/<argument>.md` to understand the expected behavior.
2. Read the relevant implementation files in `src/` (components, hooks, services) that correspond to this feature. Use your judgment to identify which files are in scope.
3. Compare the spec against the implementation and list:
   - **Implemented**: behaviors that match the spec
   - **Missing**: spec requirements with no implementation
   - **Diverged**: implementation behavior that contradicts the spec
   - **Unspecified**: implementation details not mentioned in the spec (flag if they could be bugs)

Output as a concise markdown table. For each missing or diverged item, include the spec line and the relevant source file + line number.
