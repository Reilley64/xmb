import { Effect, Either } from "effect";
import { XMLParser } from "fast-xml-parser";

import {
	type AsyncStorageError,
	type NetworkFetchError,
	ParseError,
} from "./errors";
import { fetchText, readStorage, writeStorage } from "./http";

const CACHE_KEY = "esFindRules_v1";
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

const parseXmlEffect = (xml: string): Effect.Effect<FindRules, ParseError> =>
	Effect.try({
		try: () => parseXml(xml),
		catch: (e) => new ParseError({ source: "xml", cause: e }),
	});

const fetchAndParse = (
	url: string,
): Effect.Effect<FindRules, NetworkFetchError | ParseError> =>
	fetchText(url).pipe(Effect.flatMap(parseXmlEffect));

export const getFindRules = (
	forceRefresh = false,
): Effect.Effect<FindRules, AsyncStorageError> =>
	Effect.gen(function* () {
		const cached = yield* readStorage(CACHE_KEY);
		if (!forceRefresh && cached) return JSON.parse(cached) as FindRules;

		const [officialResult, customResult] = yield* Effect.all(
			[fetchAndParse(OFFICIAL_URL), fetchAndParse(CUSTOM_URL)],
			{ mode: "either" },
		);

		const official = Either.isRight(officialResult) ? officialResult.right : {};
		const custom = Either.isRight(customResult) ? customResult.right : {};
		const merged = { ...official, ...custom };

		if (Object.keys(merged).length > 0) {
			yield* writeStorage(CACHE_KEY, JSON.stringify(merged)).pipe(
				Effect.orElse(() => Effect.void),
			);
			return merged;
		}

		return cached ? (JSON.parse(cached) as FindRules) : {};
	});
