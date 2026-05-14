---
name: new-component
description: Scaffold a new React Native component at the correct Atomic Design level with NativeWind dataSet patterns and correct import aliases. Invoke as /new-component <level>/<name> e.g. /new-component atoms/icon-label
---

The user has passed a component path as the argument, e.g. `atoms/icon-label` or `molecules/game-row`.

Create the file at `src/components/<argument>.tsx` following these rules exactly:

**Atomic Design levels** — choose the right one:
- `atoms/` — single-purpose UI units (icon, label, button, badge). No sub-components.
- `molecules/` — one focused group of atoms (a list row = icon atom + label atom).
- `organisms/` — complex sections composed of molecules (the icon row, the game list panel).
- `templates/` — layout shells with slots; no real data, no styling logic.
- `pages/` — templates wired to real state; no direct style logic.

**NativeWind styling rules:**
- Define styles as a plain `const styles` object with string values — never use `StyleSheet.create`.
  ```tsx
  const styles = {
    container: "flex-1 items-center bg-black",
  };
  <View className={styles.container} />
  ```
- For state-driven styles, use `dataSet` + `data-*` Tailwind variants — never conditional className strings.
  ```tsx
  // Correct
  <View
    className="opacity-50 data-selected:opacity-100"
    {...{ dataSet: { selected: isSelected } }}
  />
  // Wrong
  <View className={isSelected ? "opacity-100" : "opacity-50"} />
  ```
- `dataSet` keys are camelCase; the Tailwind variant is `data-<kebab-case>:`.

**Imports:**
- Use `@/components/...` for importing other components, never relative paths that cross component levels.
- Import React only if JSX transform requires it (Expo 54 / React 19 — you do NOT need `import React`).

**Exports:**
- Export the component and its Props type as named exports (no default exports).
  ```tsx
  export interface IconLabelProps { ... }
  export function IconLabel({ ... }: IconLabelProps) { ... }
  ```

After creating the file, show the full file content and confirm the Atomic Design level choice with a one-sentence reason.
