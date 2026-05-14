import { Effect } from "effect";
import { XMLParser } from "fast-xml-parser";

import { STORAGE_KEYS } from "@/constants/storageKeys";
import { ParseError, type AsyncStorageError } from "./errors";
import { fetchBothAndMerge } from "./configLoader";
import { readStorage, writeStorage } from "./http";

const CACHE_KEY = STORAGE_KEYS.ES_FIND_RULES;
const OFFICIAL_URL =
	"https://gitlab.com/es-de/emulationstation-de/-/raw/master/resources/systems/android/es_find_rules.xml";
const CUSTOM_URL =
	"https://github.com/GlazedBelmont/es-de-android-custom-systems/releases/download/v1.49/es_find_rules.xml";

// Maps emulator name (uppercase) → ordered list of "pkg/activity" strings.
export type FindRules = Record<string, string[]>;

export function parseXml(xml: string): FindRules {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "@_",
		isArray: (name) => name === "emulator" || name === "entry",
	});
	const parsed = parser.parse(xml);
	const emulators: unknown[] = parsed?.ruleList?.emulator ?? [];
	const result: FindRules = {};
	for (const emu of emulators as Record<string, unknown>[]) {
		const name = String(emu["@_name"] ?? "").toUpperCase();
		if (!name) continue;
		const rule = emu.rule as Record<string, unknown> | undefined;
		if (!rule) continue;
		const raw = rule.entry;
		const entries: string[] = Array.isArray(raw)
			? raw.map(String)
			: raw
				? [String(raw)]
				: [];
		if (entries.length) result[name] = entries;
	}
	return result;
}

const parseCached = (raw: string): Effect.Effect<FindRules, ParseError> =>
	Effect.try({
		try: () => JSON.parse(raw) as FindRules,
		catch: (e) => new ParseError({ source: "json", cause: e }),
	});

export const getFindRules = (
	forceRefresh = false,
): Effect.Effect<FindRules, AsyncStorageError | ParseError> =>
	Effect.gen(function* () {
		const cached = yield* readStorage(CACHE_KEY);
		if (!forceRefresh && cached) return yield* parseCached(cached);

		const merged = yield* fetchBothAndMerge(
			OFFICIAL_URL,
			CUSTOM_URL,
			parseXml,
			(official, custom) => ({ ...official, ...custom }),
			{} as FindRules,
		);

		if (Object.keys(merged).length > 0) {
			yield* writeStorage(CACHE_KEY, JSON.stringify(merged)).pipe(
				Effect.orElse(() => Effect.void),
			);
			return merged;
		}

		if (!cached) return {};
		return yield* parseCached(cached);
	});
