# Spec: ROM Library

## Overview

The ROM library manages discovery, storage, and retrieval of games. It combines a background disk scanner with a SQLite cache and exposes everything to the UI through a single hook.

## Data Models

```ts
interface Game {
  id: string           // 16-char hex FNV-1a hash of file path
  system_id?: string   // ES-DE folder name, e.g. "psp"
  title: string        // derived from filename
  file_path: string    // absolute path on device
  last_played?: number // ms since epoch; null if never played
  play_count: number
}

interface System {
  id: string
  name: string         // ES-DE fullname, e.g. "Sony PlayStation Portable"
  shortName: string    // 4-char abbreviation, e.g. "PSP "
  games: Game[]
  commands: { label: string; command: string }[]
}
```

## SQLite Schema

Database name: `roms.db`

```sql
CREATE TABLE games (
  id          TEXT PRIMARY KEY,
  system_id   TEXT NOT NULL,
  title       TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  last_played INTEGER,           -- ms since epoch; null = never played
  play_count  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX games_system_id ON games (system_id);
```

## Hook: `useRomLibrary`

File: `src/hooks/useRomLibrary.ts`

```ts
{
  systems: System[]
  recentGames: Game[]
  setRomBasePath: (path: string) => Promise<void>
  refresh: () => Promise<void>
}
```

### Lifecycle

1. On mount, `loadEffect` and `scanAndLoadEffect` run in parallel as Effect Fibers
2. `loadEffect`: reads the database and builds `System[]` and `Game[]` immediately
3. `scanAndLoadEffect`: runs the ROM scanner, then calls `loadEffect` again to reflect changes
4. On unmount, both Fibers are interrupted via `Fiber.interrupt`

### Load logic

- Fetches all games and recent games (where `last_played IS NOT NULL`) from SQLite
- Groups games by `system_id`, cross-references system config for metadata
- Builds `shortName` as the first 4 characters of `system.name` (uppercased)
- Games within each system sorted by `title`; recent games sorted by `last_played DESC`

### `setRomBasePath(path)`

1. Writes path to AsyncStorage under `romBasePath`
2. Calls `scanRoms(path)` to perform an immediate scan with the new path
3. Calls `loadEffect` to refresh UI

### `refresh()`

Reloads library from SQLite without scanning disk — used after config refresh.

## ROM Scanner

File: `src/services/romScanner.ts`

### Scan flow

1. Reads ROM base path from AsyncStorage (or uses provided `basePath`)
2. Fetches system config (extensions per system)
3. Lists top-level subdirectories of the base path
4. For each subdirectory whose name matches a known system:
   - Lists files and filters by registered extensions (case-insensitive)
   - Generates a unique ID per file via `pathId(filePath)`
   - Derives a title via `titleFromFilename(filename)`
5. Diffs against DB: inserts new games, deletes orphaned ones — all in a transaction

### ID generation (`pathId`)

Two-pass FNV-1a 32-bit hash of the file path → 16-character lowercase hex string. Stable across app restarts; no UUID library required.

### Title generation (`titleFromFilename`)

1. Remove file extension
2. Replace `_` and `-` with spaces
3. Trim whitespace

### Idempotency

Uses `INSERT OR IGNORE` so repeated scans do not create duplicate rows.

### AsyncStorage keys

| Key | Value |
|-----|-------|
| `romBasePath` | Absolute file path to ROM base directory |
| `romSafTreeUri` | Android content:// URI for SAF persistent permission |

## Database Service

File: `src/services/db.ts`

- Lazy singleton: opened once on first access via Effect + Ref
- `getDb`: Effect returning the open `SQLiteDatabase` instance
- `resetDb`: Closes and clears the singleton (used on config reset)

## Dependencies

- `expo-sqlite` — SQLite driver
- `expo-file-system` — directory listing
- `@react-native-async-storage/async-storage` — persisting the ROM base path
- `effect` — async composition, error handling, Fiber lifecycle
- `src/services/systemConfig.ts` — extension lists per system
