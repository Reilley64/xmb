# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Programming style — Extreme Programming (XP)

- **YAGNI** — build only what's needed now; no speculative abstractions or future-proofing
- **Simple design** — always choose the simplest solution that works; complexity is a cost
- **TDD** — write tests before code where practical; all new logic should have coverage
- **Small releases** — ship incrementally in small, working slices; avoid long-lived branches
- **Continuous refactoring** — improve the design continuously; don't let rot accumulate
- **Collective ownership** — any part of the code can and should be changed when needed
- **Sustainable pace** — no heroic over-engineering; clean and done beats clever and fragile

## Project purpose

This is an **emulator launcher frontend for Android**. The UI is modeled after the PSP/PS3 XMB (XrossMediaBar): a horizontal list of columns where each column represents a retro gaming system (e.g. NES, SNES, GBA, PS1), and navigating into a column reveals the game list for that system. The app launches games in the appropriate Android emulator.

## XMB reference images

Reference screenshots of the real PS3 XMB are in `reference/` (1.png–8.png). Use these as the visual ground truth when making UI decisions. Key observations from the references:

**Category icon row (horizontal)**
- Icons sit in a horizontal row roughly 1/3 from the left of the screen (not dead center)
- The selected icon is full-size with its label in small text directly below it
- Non-selected icons are noticeably smaller and have no visible label
- Icons fade out toward the edges of the screen

**Item list (vertical, below the icon row)**
- The selected item sits directly below the selected icon — icon on the left, bold white text to the right; this item is visually larger than all others
- Items above the selected one have already scrolled upward past the icon row and remain visible above it, dimmed
- Items below the selected one are visible below, also dimmed
- No background highlight or box on the selected item — selection is communicated purely through size and brightness
- Each item has a small icon on the left and the item name to the right of it

**Layout / spacing**
- A decorative diagonal wave/swoosh spans the middle of the screen
- There is a clear visual gap at the icon row — no list items overlap the category icons
- The background shifts to reflect the selected category (color or tone)
- Clock and status indicators sit in the top-right corner

## ROM scanning (implemented)

**ROM folder structure — ES-DE convention**
The user selects a base ROMs folder. Subfolders use ES-DE short names (`ps2`, `nds`, `gc`, `nes`, `snes`, `gba`, etc.). Unknown subfolders are silently skipped.

**Settings column**
A ⚙ Settings column is appended to the end of the XMB icon row.

**Recent column**
A "Recent" column appears between Settings and system columns when any game has a `last_played` value. It shows games ordered by most-recently played. It is dynamically hidden when empty. Its item list is a vertical settings menu. The first item is "Choose ROMs folder". No other columns are blocked while ROM path is unconfigured — the app just shows empty lists until a folder is set.

**Permission flow**
`MANAGE_EXTERNAL_STORAGE` is required. Permission is requested lazily: only when the user taps "Choose ROMs folder" in Settings. If not granted, fire an intent to system settings (`ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION`). When they return, open the folder picker.

**Folder picker**
Uses `pickDirectory()` from `@react-native-documents/picker`. The returned content URI (`content://com.android.externalstorage...`) is converted to a plain file path via `contentUriToPath()` in `xmb.tsx`. Two AsyncStorage keys are written: `romSafTreeUri` (SAF tree URI, used by launcher to build document URIs for emulators) and `romBasePath` (plain file path, used by scanner).

**System config — fetched from ES-DE XML**
On first boot, fetch `https://github.com/GlazedBelmont/es-de-android-custom-systems/releases/download/v1.49/es_systems.xml` (React Native `fetch()` follows the GitHub redirect automatically). Parse with `fast-xml-parser` (pure JS). Cache the parsed result in AsyncStorage as JSON indefinitely — re-fetch on demand via "Refresh system config" in Settings.

XML fields used:
- `name` → folder ID and system key (`gb`, `ps2`, `nds`)
- `fullname` → display name
- `extension` → deduplicated + lowercased at parse time (`.gb .GB .zip .ZIP` → `['.gb', '.zip', ...]`)
- `command` (multiple, each with `label`) → stored as `{ label, command }[]` for Phase 3 emulator launch

Parsed type:
```ts
interface EsSystem {
  name: string;
  fullname: string;
  extensions: string[];
  commands: { label: string; command: string }[];
}
```

**Caching — SQLite**
Use `expo-sqlite` (`roms.db`). Schema:

```sql
CREATE TABLE games (
  id          TEXT PRIMARY KEY,  -- FNV-1a 32-bit × 2 (16-hex) of file path
  system_id   TEXT,              -- ES-DE folder name e.g. 'ps2'
  title       TEXT,              -- derived from filename
  file_path   TEXT,
  last_played INTEGER,
  play_count  INTEGER DEFAULT 0
);
CREATE INDEX games_system_id ON games (system_id);
```

System metadata comes from the fetched ES-DE XML (AsyncStorage), not a SQLite table.

**Scan flow**
On mount: read games from SQLite immediately (fast). In background: list subdirs of ROM base path, match against fetched ES-DE config, read each dir, diff against DB, upsert changes.

## Commands

> **Android build requirement:** `JAVA_HOME` must point to Java 17 (not Homebrew default). Check with `java -version`. Gradle 8.x is incompatible with Java 21+.

Use `bun` as the package manager (not npm or yarn).

```bash
bun install          # install dependencies
bun run start        # start Expo dev server
bun run ios          # run on iOS simulator
bun run android      # run on Android emulator
bun run web          # run in browser
bun run lint         # Biome lint
bun run format       # Biome format
bun run prebuild     # generate native iOS/Android projects
bun run test         # run unit tests (vitest, node env)
bun run test:watch   # vitest in watch mode
bun run test:e2e     # Maestro end-to-end tests (.maestro/*.yaml)
```

> `package.json` pins `lightningcss` to `1.30.1` via `overrides` — do not remove; it resolves a NativeWind/Tailwind v4 build incompatibility.

## Architecture

This is an **Expo (bare-ish) React Native** app using the classic `App.tsx` entry point (not Expo Router). The entry point is `node_modules/expo/AppEntry.js`, which loads `App.tsx`.

**Component structure — Atomic Design**

Components follow [Atomic Design](https://atomicdesign.bradfrost.com/chapter-2/) and live under `src/components/` (imported via `@/components/...`):

| Level | Folder | Status | Description |
|-------|--------|--------|-------------|
| Atoms | `src/components/atoms/` | **exists** | Smallest indivisible UI units — buttons, icons, labels, inputs |
| Molecules | `src/components/molecules/` | **exists** | Simple groups of atoms with a single purpose — a game list item, a settings row |
| Organisms | `src/components/organisms/` | **exists** | Complex UI sections — the XMB icon row, the game list panel |
| Templates | `src/components/templates/` | **exists** | Page-level layouts with slots for organisms — no data, just structure and spacing |
| Pages | `src/components/pages/` | **exists** | Templates filled with real data — wired to state/navigation, no direct styling logic |

The goal is strict Atomic Design: organisms composed of molecules, molecules composed of atoms, pages composed of templates. New components should follow correct layering; refactoring existing code to conform is not required unless a component is being significantly reworked.

**Styling — NativeWind + Tailwind CSS v4**

Styling is done exclusively with NativeWind (Tailwind for React Native). Components use `className` props with Tailwind utility strings. Styles are defined as plain string objects (not `StyleSheet.create`) and composed via template literals when needed:

```tsx
const styles = {
  container: `flex flex-1 items-center justify-center bg-white`,
};
<View className={styles.container} />
```

- `global.css` imports Tailwind theme/preflight/utilities + `nativewind/theme` — it is imported once at the top of `App.tsx`
- `metro.config.js` wraps the default config with `withNativewind`
- `postcss.config.mjs` uses `@tailwindcss/postcss`
- Tailwind class sorting is enforced via Biome's `useSortedClasses` rule (configured as `"error"` in `biome.json`)

**State-driven styling — `dataSet`**

Use React Native's `dataSet` prop to drive state-based styles, not conditional class strings. NativeWind reads `dataSet` keys as `data-*` attributes and exposes them as Tailwind variants:

```tsx
// Preferred: state set via dataSet, styled via data-* variants in className
<View
  className="opacity-75 transition-opacity data-selected:opacity-100"
  {...{ dataSet: { selected: isSelected } }}
/>

// Avoid: conditional class concatenation
<View className={isSelected ? 'opacity-100' : 'opacity-75'} />
```

`dataSet` keys are plain camelCase (`selected`, `focused`, `disabled`). The corresponding Tailwind variant is `data-selected:`, `data-focused:`, etc. Keep all visual state in `dataSet`; keep all layout/structure in regular props.

**Path aliases**

`tsconfig.json` maps `@/*` → `src/*`. All components are under `src/components/` and imported via the alias, e.g. `import { MenuItem } from '@/components/atoms/menu-item'`.

**Services layer**

`src/services/` — side-effectful logic, all implemented with the `effect` library:

- `db.ts` — SQLite access via `expo-sqlite`
- `romScanner.ts` — ROM directory scan + DB diff/upsert
- `systemConfig.ts` — ES-DE XML fetch, parse, AsyncStorage cache
- `launcher.ts` — builds and fires Android intents via `expo-intent-launcher`
- `findRules.ts` — maps ES-DE commands to emulator package/activity candidates
- `errors.ts` — typed error union for service failures
- `http.ts` — thin fetch wrapper

`src/data/systems.ts` — shared `Game` and `System` TypeScript interfaces (imported by components and services alike).

`src/hooks/` — React hooks:
- `useControllerInput.ts` — subscribes to `GamepadKeyDown` native events; calls `onLeft/onRight/onUp/onDown/onConfirm/onBack` callbacks; only the active navigation layer passes callbacks (others pass `undefined` to ignore events)
- `useRomLibrary.ts` — loads games from SQLite on mount, runs background scan, exposes `setRomBasePath` and `refresh`

**E2E tests — Maestro**

Integration flows live in `.maestro/`. Run with `bun run test:e2e`. Files: `smoke.yaml`, `column-navigation.yaml`, `settings-flow.yaml`.

**Key dependencies**

- `effect` — functional effect system used throughout `src/services/`; wrap side effects in `Effect`, call `Effect.runPromise` at use sites
- `react-native-reanimated` + `react-native-worklets` — animation/worklet support; the worklets Babel plugin is always included in `babel.config.js`
- `react-native-safe-area-context` — `SafeAreaProvider` wraps the app root
- `nativewind` (preview channel) — requires NativeWind-compatible versions of RN/Expo
- `expo-video` — background video playback (`assets/background.webm` on the XMB screen)
- `expo-linear-gradient` — gradient overlays in the XMB UI
- `expo-file-system` — ROM directory scanning; uses **v2 class API** (`new Directory(uri)`, `new File(uri)`, `.list()`), not the legacy `FileSystem.readDirectoryAsync()`
- `expo-intent-launcher` — fires Android intents for emulator launch
- `@react-native-documents/picker` — native folder picker for selecting the ROMs base directory
- `@react-native-async-storage/async-storage` — persists the ES-DE system config cache
- `fast-xml-parser` — parses the ES-DE `es_systems.xml` system config (pure JS, no native module)

## Claude Code automations

**Custom agent — `xmb-visual-reviewer`**

After any UI change to the XMB layout, icon row, game list, or animated elements, run `/agent xmb-visual-reviewer`. It checks NativeWind patterns, Atomic Design placement, and XMB visual-fidelity rules against the reference screenshots.

**Custom skill — `/new-component`**

Scaffold a new component with `/new-component <level>/<name>` (e.g. `/new-component atoms/icon-label`). The skill creates the file at the correct Atomic Design level with proper NativeWind `dataSet` patterns and import aliases pre-wired.

**Biome auto-format hook**

A `PostToolUse` hook runs `biome check --write` on every file after an Edit or Write. You will see Biome output after edits — this is expected and requires no action unless it reports an unfixable error.
