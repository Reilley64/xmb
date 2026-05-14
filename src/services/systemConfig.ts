import { Effect, Either } from "effect";
import { XMLParser } from "fast-xml-parser";

import {
	type AsyncStorageError,
	ConfigUnavailableError,
	type NetworkFetchError,
	ParseError,
} from "./errors";
import { fetchText, readStorage, writeStorage } from "./http";

const OFFICIAL_URL =
	"https://gitlab.com/es-de/emulationstation-de/-/raw/v3.4.1/resources/systems/android/es_systems.xml";
const CUSTOM_URL =
	"https://github.com/GlazedBelmont/es-de-android-custom-systems/releases/download/v1.49/es_systems.xml";
const CACHE_KEY = "esSystemConfig_v2";

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
				.map((e) => e.toLowerCase()),
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

const parseXmlEffect = (xml: string): Effect.Effect<EsSystem[], ParseError> =>
	Effect.try({
		try: () => parseXml(xml),
		catch: (e) => new ParseError({ source: "xml", cause: e }),
	});

const fetchAndParse = (
	url: string,
): Effect.Effect<EsSystem[], NetworkFetchError | ParseError> =>
	fetchText(url).pipe(Effect.flatMap(parseXmlEffect));

const fetchMergeAndCache: Effect.Effect<
	EsSystem[],
	AsyncStorageError | ConfigUnavailableError
> = Effect.gen(function* () {
	const [officialResult, customResult] = yield* Effect.all(
		[fetchAndParse(OFFICIAL_URL), fetchAndParse(CUSTOM_URL)],
		{ mode: "either" },
	);

	const official = Either.isRight(officialResult) ? officialResult.right : [];
	const custom = Either.isRight(customResult) ? customResult.right : [];

	// Custom entries override official ones by system name
	const merged = new Map(official.map((s) => [s.name, s]));
	for (const s of custom) merged.set(s.name, s);

	if (merged.size === 0) {
		yield* Effect.fail(
			new ConfigUnavailableError({ resource: "systemConfig" }),
		);
	}

	const systems = [...merged.values()];
	yield* writeStorage(CACHE_KEY, JSON.stringify(systems)).pipe(
		Effect.orElse(() => Effect.void),
	);
	return systems;
});

export const getSystemConfig = (
	forceRefresh = false,
): Effect.Effect<EsSystem[], AsyncStorageError | ConfigUnavailableError> =>
	Effect.gen(function* () {
		const cached = yield* readStorage(CACHE_KEY);

		if (!forceRefresh && cached) {
			return JSON.parse(cached) as EsSystem[];
		}

		return yield* fetchMergeAndCache.pipe(
			Effect.catchTag("ConfigUnavailableError", () =>
				cached
					? Effect.succeed(JSON.parse(cached) as EsSystem[])
					: Effect.fail(
							new ConfigUnavailableError({ resource: "systemConfig" }),
						),
			),
		);
	});
