import { Effect } from "effect";
import { XMLParser } from "fast-xml-parser";

import { STORAGE_KEYS } from "@/constants/storageKeys";
import {
	type AsyncStorageError,
	ConfigUnavailableError,
	ParseError,
} from "./errors";
import { fetchBothAndMerge } from "./configLoader";
import { readStorage, writeStorage } from "./http";

const OFFICIAL_URL =
	"https://gitlab.com/es-de/emulationstation-de/-/raw/v3.4.1/resources/systems/android/es_systems.xml";
const CUSTOM_URL =
	"https://github.com/GlazedBelmont/es-de-android-custom-systems/releases/download/v1.49/es_systems.xml";
const CACHE_KEY = STORAGE_KEYS.ES_SYSTEM_CONFIG;

export interface EsSystem {
	name: string;
	fullname: string;
	extensions: string[];
	commands: { label: string; command: string }[];
}

export function parseExtensions(raw: string): string[] {
	return [
		...new Set(
			raw
				.trim()
				.split(/\s+/)
				.filter(Boolean)
				.map((ext) => ext.toLowerCase()),
		),
	];
}

export function normalizeCommands(cmd: unknown): { label: string; command: string }[] {
	if (cmd == null) return [];
	const arr = Array.isArray(cmd) ? cmd : [cmd];
	return arr.map((c) => {
		if (typeof c === "string") return { label: "", command: c };
		const obj = c as Record<string, unknown>;
		return {
			label: (obj["@_label"] as string) ?? "",
			command: (obj["#text"] as string) ?? "",
		};
	});
}

export function parseXml(xml: string): EsSystem[] {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "@_",
		isArray: (name) => name === "system" || name === "command",
	});
	const parsed = parser.parse(xml);
	const systems: unknown[] = parsed?.systemList?.system ?? [];
	return (systems as Record<string, unknown>[]).map((s) => ({
		name: String(s.name ?? ""),
		fullname: String(s.fullname ?? ""),
		extensions: parseExtensions(String(s.extension ?? "")),
		commands: normalizeCommands(s.command),
	}));
}

const fetchMergeAndCache: Effect.Effect<
	EsSystem[],
	AsyncStorageError | ConfigUnavailableError | ParseError
> = Effect.gen(function* () {
	const merged = yield* fetchBothAndMerge(
		OFFICIAL_URL,
		CUSTOM_URL,
		parseXml,
		(official, custom) => {
			const map = new Map(official.map((s) => [s.name, s]));
			for (const s of custom) map.set(s.name, s);
			return [...map.values()];
		},
		[],
	);

	if (merged.length === 0) {
		yield* Effect.fail(new ConfigUnavailableError({ resource: "systemConfig" }));
	}

	yield* writeStorage(CACHE_KEY, JSON.stringify(merged)).pipe(
		Effect.orElse(() => Effect.void),
	);
	return merged;
});

export const getSystemConfig = (
	forceRefresh = false,
): Effect.Effect<EsSystem[], AsyncStorageError | ConfigUnavailableError | ParseError> =>
	Effect.gen(function* () {
		const cached = yield* readStorage(CACHE_KEY);

		if (!forceRefresh && cached) {
			return yield* Effect.try({
				try: () => JSON.parse(cached) as EsSystem[],
				catch: (e) => new ParseError({ source: "json", cause: e }),
			});
		}

		return yield* fetchMergeAndCache.pipe(
			Effect.catchTag(
				"ConfigUnavailableError",
				(): Effect.Effect<EsSystem[], ConfigUnavailableError | ParseError> => {
					if (!cached)
						return Effect.fail(
							new ConfigUnavailableError({ resource: "systemConfig" }),
						);
					return Effect.try({
						try: () => JSON.parse(cached) as EsSystem[],
						catch: (e) => new ParseError({ source: "json", cause: e }),
					});
				},
			),
		);
	});
