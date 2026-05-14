import AsyncStorage from "@react-native-async-storage/async-storage";
import { Effect } from "effect";
import { startActivityAsync } from "expo-intent-launcher";

import type { Game } from "@/data/systems";
import { getDb } from "./db";
import {
	AllCandidatesFailedError,
	AsyncStorageError,
	LaunchError,
} from "./errors";
import type { FindRules } from "./findRules";
import { getFindRules } from "./findRules";

// Android Intent flags
const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;
const FLAG_ACTIVITY_CLEAR_TASK = 0x00008000;
const FLAG_ACTIVITY_CLEAR_TOP = 0x04000000;

const launchSemaphore = Effect.runSync(Effect.makeSemaphore(1));

export interface LaunchIntent {
	label: string;
	candidates: { pkg: string; activity: string }[];
	action: string | null;
	dataUri: string | null;
	extras: Record<string, string>;
	clearTask: boolean;
	clearTop: boolean;
}

// Builds a SAF document URI from the stored tree URI and a file path.
// e.g. /storage/emulated/0/ROMs/psp/game.iso
//   → content://com.android.externalstorage.documents/tree/primary%3AROMs/document/primary%3AROMs%2Fpsp%2Fgame.iso
export function buildSafDocUri(treeUri: string, romPath: string): string | null {
	if (!romPath.startsWith("/storage/")) return null;
	const rest = romPath.slice("/storage/".length); // emulated/0/ROMs/psp/game.iso
	const firstSlash = rest.indexOf("/");
	if (firstSlash === -1) return null;
	const vol = rest.slice(0, firstSlash); // emulated
	const afterVol = rest.slice(firstSlash + 1); // 0/ROMs/psp/game.iso

	let docId: string;
	if (vol === "emulated") {
		const secondSlash = afterVol.indexOf("/");
		if (secondSlash === -1) return null;
		docId = `primary:${afterVol.slice(secondSlash + 1)}`; // primary:ROMs/psp/game.iso
	} else {
		docId = `${vol}:${afterVol}`;
	}

	return `${treeUri}/document/${encodeURIComponent(docId)}`;
}

export function parseEsCommand(
	command: string,
	label: string,
	romPath: string,
	findRules: FindRules,
	safDocUri: string | null,
): LaunchIntent | null {
	const tokens = command.trim().split(/\s+/);
	if (!tokens[0]) return null;

	const emulatorMatch = tokens[0].match(/^%EMULATOR_([A-Z0-9_-]+)%$/i);
	if (!emulatorMatch) return null;

	const emulatorName = emulatorMatch[1].toUpperCase();
	const entries = findRules[emulatorName];
	if (!entries?.length) return null;

	const candidates = entries
		.map((entry) => {
			const slashIdx = entry.indexOf("/");
			if (slashIdx === -1) return null;
			const pkg = entry.slice(0, slashIdx);
			const activityRaw = entry.slice(slashIdx + 1);
			const activity = activityRaw.startsWith(".")
				? pkg + activityRaw
				: activityRaw;
			return { pkg, activity };
		})
		.filter((c): c is { pkg: string; activity: string } => c !== null);

	if (candidates.length === 0) return null;

	const pkg = candidates[0].pkg;
	const fileUri = `file://${romPath}`;
	// %ROMSAF% must be a content:// URI so PPSSPP and other SAF-aware emulators can access it
	const safUri = safDocUri ?? fileUri;

	function resolveVal(val: string): string {
		return val
			.replace(/%ANDROIDPACKAGE%/g, pkg)
			.replace(/%ROM%/g, romPath)
			.replace(/%ROMSAF%/g, safUri)
			.replace(/%ROMPROVIDER%/g, fileUri);
	}

	const intent: LaunchIntent = {
		label: label || emulatorName,
		candidates,
		action: null,
		dataUri: null,
		extras: {},
		clearTask: false,
		clearTop: false,
	};

	for (const token of tokens.slice(1)) {
		if (token === "%ACTIVITY_CLEAR_TASK%") {
			intent.clearTask = true;
		} else if (token === "%ACTIVITY_CLEAR_TOP%") {
			intent.clearTop = true;
		} else if (token.startsWith("%ACTION%=")) {
			intent.action = resolveVal(token.slice(9));
		} else if (token.startsWith("%DATA%=")) {
			intent.dataUri = resolveVal(token.slice(7));
		} else if (token.startsWith("%EXTRA_")) {
			const eqIdx = token.indexOf("=");
			if (eqIdx !== -1) {
				const rawKey = token.slice(7, eqIdx);
				const key = rawKey.endsWith("%") ? rawKey.slice(0, -1) : rawKey;
				intent.extras[key] = resolveVal(token.slice(eqIdx + 1));
			}
		}
	}

	return intent;
}

export const resolveCommands = (
	commands: { label: string; command: string }[],
	romPath: string,
): Effect.Effect<LaunchIntent[], AsyncStorageError> =>
	Effect.gen(function* () {
		const [findRules, safTreeUri] = yield* Effect.all(
			[
				getFindRules().pipe(Effect.orElseSucceed(() => ({}) as FindRules)),
				Effect.tryPromise({
					try: () => AsyncStorage.getItem("romSafTreeUri"),
					catch: (e) =>
						new AsyncStorageError({
							op: "get",
							key: "romSafTreeUri",
							cause: e,
						}),
				}).pipe(Effect.orElseSucceed(() => null)),
			],
			{ concurrency: "unbounded" },
		);

		const safDocUri = safTreeUri ? buildSafDocUri(safTreeUri, romPath) : null;
		return commands
			.map((c) =>
				parseEsCommand(c.command, c.label, romPath, findRules, safDocUri),
			)
			.filter((i): i is LaunchIntent => i !== null);
	});

const tryCandidate = (
	intent: LaunchIntent,
	candidate: { pkg: string; activity: string },
): Effect.Effect<void, LaunchError> => {
	let flags = FLAG_GRANT_READ_URI_PERMISSION;
	if (intent.clearTask) flags |= FLAG_ACTIVITY_CLEAR_TASK;
	if (intent.clearTop) flags |= FLAG_ACTIVITY_CLEAR_TOP;

	return Effect.tryPromise({
		try: () =>
			startActivityAsync(intent.action ?? "android.intent.action.VIEW", {
				packageName: candidate.pkg,
				className: candidate.activity,
				...(intent.dataUri != null ? { data: intent.dataUri } : {}),
				...(Object.keys(intent.extras).length > 0
					? { extra: intent.extras }
					: {}),
				flags,
			}),
		catch: (e) =>
			new LaunchError({
				pkg: candidate.pkg,
				activity: candidate.activity,
				cause: e,
			}),
	});
};

export const launchRom = (
	game: Game,
	intent: LaunchIntent,
): Effect.Effect<void, AllCandidatesFailedError> => {
	const sentinel = Effect.fail(
		new LaunchError({
			pkg: "",
			activity: "",
			cause: new Error("no candidates"),
		}),
	) as Effect.Effect<void, LaunchError>;

	const attemptLaunch = intent.candidates
		.reduce(
			(acc, candidate) =>
				acc.pipe(Effect.orElse(() => tryCandidate(intent, candidate))),
			sentinel,
		)
		.pipe(
			Effect.mapError(
				() => new AllCandidatesFailedError({ candidates: intent.candidates }),
			),
		);

	const updatePlayCount = getDb.pipe(
		Effect.flatMap((db) =>
			Effect.tryPromise({
				try: () =>
					db.runAsync(
						"UPDATE games SET play_count = play_count + 1, last_played = ? WHERE id = ?",
						[Date.now(), game.id],
					),
				catch: () => null,
			}),
		),
		Effect.orElse(() => Effect.void),
	);

	return attemptLaunch.pipe(
		Effect.flatMap(() => updatePlayCount),
		launchSemaphore.withPermits(1),
	);
};
