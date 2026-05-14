# Spec: Gamepad Input

## Overview

The app is controlled entirely by a physical gamepad (or device d-pad). Gamepad events are captured in native Kotlin, emitted to React Native as a custom event, and distributed to UI components via the `useControllerInput` hook.

## Key Codes

```ts
KC = {
  DPAD_UP:      19,
  DPAD_DOWN:    20,
  DPAD_LEFT:    21,
  DPAD_RIGHT:   22,
  DPAD_CENTER:  23,
  ENTER:        66,
  BACK:         4,
  BUTTON_A:     96,
  BUTTON_B:     97,
  BUTTON_X:     99,
  BUTTON_Y:     100,
  BUTTON_L1:    102,
  BUTTON_R1:    103,
  BUTTON_START: 108,
  BUTTON_SELECT:109,
}
```

## Action Mapping

| Callback | Triggered by |
|----------|-------------|
| `onLeft` | `DPAD_LEFT` |
| `onRight` | `DPAD_RIGHT` |
| `onUp` | `DPAD_UP` |
| `onDown` | `DPAD_DOWN` |
| `onConfirm` | `DPAD_CENTER`, `BUTTON_A`, `ENTER` |
| `onBack` | `BUTTON_B`, `BACK` |
| `onRawKey` | Any key (receives raw keyCode) |

## Hook: `useControllerInput`

File: `src/hooks/useControllerInput.ts`

```ts
useControllerInput(callbacks: ControllerCallbacks): void
```

- Android-only (`Platform.OS === 'android'` guard)
- Subscribes to `GamepadKeyDown` events emitted by native MainActivity
- Also registers an `BackPress` handler (maps Back button to `onBack`)
- Cleans up both listeners on unmount; uses an `active` flag to prevent stale calls in React Strict Mode

### Debouncing

The hook tracks the last fire time per keyCode. If the same key fires within 60ms, the second event is ignored. This is a React-layer guard on top of the native 100ms debounce (see below).

## Native Plugin: `withGamepadKeyEvents`

File: `plugins/withGamepadKeyEvents.js`

Modifies `MainActivity.kt` at prebuild time to override two methods:

### `dispatchKeyEvent(event: KeyEvent)`

- Intercepts all `ACTION_DOWN` events
- Debounces at **100ms per keyCode** using a `LongArray` of last-fire timestamps
- Emits `GamepadKeyDown` event to React Native with payload `{ keyCode: Int }`
- Falls through to `super.dispatchKeyEvent(event)` for default OS handling

### `onGenericMotionEvent(event: MotionEvent)`

Handles analog stick and hat switch inputs:

| Axis | Threshold | Emits |
|------|-----------|-------|
| Hat X (or left stick X) | < −0.5 | keyCode 21 (LEFT) |
| Hat X (or left stick X) | > +0.5 | keyCode 22 (RIGHT) |
| Hat Y (or left stick Y) | < −0.5 | keyCode 19 (UP) |
| Hat Y (or left stick Y) | > +0.5 | keyCode 20 (DOWN) |

- Detects threshold **crossings**, not continuous movement (avoids repeat-fire while stick is held)
- Same 100ms debounce applies

### Debounce layers summary

| Layer | Debounce | Where |
|-------|----------|-------|
| Native | 100ms per keyCode | `MainActivity.kt` (injected) |
| React | 60ms per keyCode | `useControllerInput.ts` |

Both layers use per-key tracking so fast switching between different buttons is unaffected.

## Plugin Integration

`withGamepadKeyEvents` uses `@expo/config-plugins` `withMainActivity` to patch `MainActivity.kt` at prebuild. The plugin:

1. Detects that MainActivity is Kotlin (skips if Java)
2. Appends the overriding methods before the closing brace
3. Skips patching if already applied (idempotent check)

## React Context

The native code accesses `ReactContext` via `ReactApplication`:
- Expo prebuild path: `reactHost.currentReactContext`
- Expo Go path: `reactInstanceManager.currentReactContext`
Both are tried; first non-null wins.

## Gamepad Input in Components

`MenuItem` (atom) calls `useControllerInput` and only fires `onConfirm` when `isSelected` is true — prevents off-screen items from responding to confirm.

`MenuList` (organism) calls `useControllerInput` for Up/Down navigation within the list. Navigation is disabled when the list is not selected (`isSelected = false`) or when `isNavigable = false`.

`Xmb` (page) calls `useControllerInput` for Left/Right column switching and handles the Back button at the top level.
