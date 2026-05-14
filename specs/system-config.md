# Spec: System Config (ES-DE XML)

## Overview

System metadata (display names, file extensions, launch commands) is sourced from ES-DE's `es_systems.xml`. Emulator package/activity mappings come from ES-DE's find rules XML. Both are fetched on first boot, parsed, and cached in AsyncStorage indefinitely.

## EsSystem Type

```ts
interface EsSystem {
  name: string                                    // folder ID, e.g. "psp"
  fullname: string                               // display name, e.g. "Sony PlayStation Portable"
  extensions: string[]                           // deduplicated, lowercased, e.g. [".iso", ".cso"]
  commands: { label: string; command: string }[] // launch command variants
}
```

## System Config Sources

| Priority | URL |
|----------|-----|
| 1 (override) | `https://github.com/GlazedBelmont/es-de-android-custom-systems/releases/download/v1.49/es_systems.xml` |
| 2 (base) | Official ES-DE v3.4.1 `es_systems.xml` |

Custom systems override official ones by `name`. The merged array is the final config.

### XML shape expected

```xml
<systemList>
  <system>
    <name>psp</name>
    <fullname>Sony PlayStation Portable</fullname>
    <extension>.iso .cso .pbp .ISO .CSO</extension>
    <command label="PPSSPP">%EMULATOR_PPSSPP% %ROM%</command>
  </system>
</systemList>
```

### Parsing notes

- Extensions: split on whitespace, map to lowercase, deduplicate
- Commands: each `<command>` element may be a plain string or have a `label` attribute
- Parser: `fast-xml-parser` (`XMLParser`)

### Cache key: `esSystemConfig_v2`

Stored as a JSON array of `EsSystem` objects. Indefinite TTL — refreshed only on user demand via "Refresh system config" in Settings.

### Fallback strategy

1. Try custom source
2. Try official source
3. If both fail, return cached value
4. If no cache, return `ConfigUnavailableError`

## Find Rules Sources

| Priority | URL |
|----------|-----|
| 1 (override) | `https://github.com/GlazedBelmont/es-de-android-custom-systems/releases/download/v1.49/es_find_rules.xml` |
| 2 (base) | Official ES-DE v3.4.1 `es_find_rules.xml` |

### FindRules type

```ts
type FindRules = Record<string, string[]>
// key: emulator name in UPPER_CASE (e.g. "PPSSPP")
// value: ["pkg/activity", ...] ordered by preference
```

### XML shape expected

```xml
<ruleList>
  <emulator name="PPSSPP">
    <rule>
      <entry>org.ppsspp.ppsspp/org.ppsspp.ppsspp.PpssppActivity</entry>
      <entry>org.ppsspp.ppssppgold/org.ppsspp.ppsspp.PpssppActivity</entry>
    </rule>
  </emulator>
</ruleList>
```

### Cache key: `esFindRules_v1`

Same strategy as system config — indefinite TTL, user-triggered refresh.

## Refresh Flow (triggered by "Refresh system config" in Settings)

1. Fetch fresh system config (bypasses cache, writes new value)
2. Fetch fresh find rules (bypasses cache, writes new value)
3. Run ROM scanner to pick up any new extensions or systems
4. Reload UI via `useRomLibrary.refresh()`

## Services

| File | Responsibility |
|------|---------------|
| `src/services/systemConfig.ts` | Fetch, parse, cache `EsSystem[]` |
| `src/services/findRules.ts` | Fetch, parse, cache `FindRules` |
| `src/services/http.ts` | `fetchText(url)`, `readStorage(key)`, `writeStorage(key, val)` |
| `src/services/errors.ts` | `ConfigUnavailableError`, `ParseError`, `NetworkFetchError`, `AsyncStorageError` |

## Dependencies

- `fast-xml-parser` — pure-JS XML parser (no native module required)
- `@react-native-async-storage/async-storage` — config cache
- `effect` — async composition and typed error handling
