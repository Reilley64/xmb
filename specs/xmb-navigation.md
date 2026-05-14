# Spec: XMB Navigation

## Overview

The main UI is modeled after the PlayStation XMB (XrossMediaBar). Columns represent retro gaming systems arranged horizontally. Navigating into a column reveals that system's game list vertically. Selection state is communicated via size and brightness — no highlight boxes.

## User-Facing Behavior

### Column row (horizontal)
- A row of system icons sits roughly 1/3 from the left of the screen
- The active column icon is full-size with its label below it
- Non-active icons are scaled down and have no label
- Left/Right input moves between columns with a smooth slide animation
- A background video plays behind everything

### Game list (vertical)
- The selected item is larger and fully opaque; all others are dimmed
- Items above the selection scroll up past the icon row and remain visible
- Items below the selection are visible beneath, dimmed
- Up/Down input moves selection within the current column's list
- Confirm (A / Enter) fires the item's action

### Settings column
- Always present as the first column (index 0)
- Contains settings actions: "Choose ROMs folder", "Refresh system config"

### Recent column
- Appears at index 1 when any game has been played at least once
- Shows games sorted by `last_played` DESC

### System columns
- One column per system that has at least one game in the database
- Sorted alphabetically by system name

## Components

| Component | Level | File |
|-----------|-------|------|
| `XmbLayout` | Template | `src/components/templates/xmb-layout.tsx` |
| `Xmb` | Page | `src/components/pages/xmb.tsx` |
| `MenuList` | Organism | `src/components/organisms/menu-list.tsx` |
| `EmulatorPicker` | Organism | `src/components/organisms/emulator-picker.tsx` |
| `ColumnIcon` | Molecule | `src/components/molecules/column-icon.tsx` |
| `GameItem` | Molecule | `src/components/molecules/game-item.tsx` |
| `SettingsItem` | Molecule | `src/components/molecules/settings-item.tsx` |
| `MenuItem` | Atom | `src/components/atoms/menu-item.tsx` |

## Layout Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `COL_W` | 120px | Width of each column |
| `ITEM_H` | 36px | Height of a non-selected list item |
| `ICON_W_MIN` | 52px | Icon width when not selected |
| `ICON_W_MAX` | 110px | Icon width when selected |
| `ABOVE_H` | 20% screen | Height of the above-fold item region |
| Left pad | 20vw | Visual breathing room before first column |

## Animation

All transitions use `react-native-reanimated` shared values animated with `withTiming`:

| Animation | Duration | Easing |
|-----------|----------|--------|
| Column slide (XmbLayout) | 200ms | `Easing.out(Easing.cubic)` |
| List item size/opacity | 200ms | `Easing.out(Easing.cubic)` |
| EmulatorPicker slide-in | 180ms | `Easing.out(Easing.cubic)` |

## EmulatorPicker Overlay

Shown when a game has more than one launch command option:
- Slides in from the right, occupying roughly 32% of the screen
- Left side has a linear gradient (transparent → 55% black) to dim the game list
- Up/Down navigates; Confirm selects an emulator; Back cancels

## State (in `Xmb` page)

| State | Type | Purpose |
|-------|------|---------|
| `colIdx` | `number` | Currently selected column |
| `pendingLaunch` | `{ game, intents[] } \| null` | Game waiting for emulator selection |
| `systems` | `System[]` | Loaded from `useRomLibrary` |
| `recentGames` | `Game[]` | Loaded from `useRomLibrary` |

## Background Video

- Source: `assets/background.webm`
- Played via `expo-video`, looped and muted
- Pauses when app goes to background (AppState listener), resumes on foreground

## Reference

See `reference/1.png` – `reference/8.png` for visual ground truth.
