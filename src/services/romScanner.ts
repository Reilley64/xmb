import { Effect } from "effect";
import { Directory, File } from "expo-file-system";

import { STORAGE_KEYS } from "@/constants/storageKeys";
import { getDb } from "./db";
import { AsyncStorageError, DatabaseError, FilesystemError } from "./errors";
import { readStorage } from "./http";
import { type EsSystem, getSystemConfig } from "./systemConfig";

export function nameFromUri(uri: string): string {
	return decodeURIComponent(uri.replace(/\/$/, "").split("/").pop() ?? "");
}

export function titleFromFilename(filename: string): string {
	return filename
		.replace(/\.[^.]+$/, "")
		.replace(/[_-]+/g, " ")
		.trim();
}

// FNV-1a 32-bit × 2 for a collision-resistant 16-hex ID
export function pathId(filePath: string): string {
	let h1 = 0x811c9dc5 >>> 0;
	let h2 = 0x84222325 >>> 0;
	for (let i = 0; i < filePath.length; i++) {
		const c = filePath.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
		h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
	}
	return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export const scanRoms = (
	basePath?: string | null,
): Effect.Effect<void, AsyncStorageError | DatabaseError | FilesystemError> =>
	Effect.gen(function* () {
		const resolvedPath =
			basePath !== undefined
				? basePath
				: yield* readStorage(STORAGE_KEYS.ROM_BASE_PATH);

		if (!resolvedPath) return;

		const systems = yield* getSystemConfig().pipe(
			Effect.catchAll((e) =>
				Effect.sync(() => {
					console.warn("[scanRoms] system config unavailable", e._tag);
					return [] as EsSystem[];
				}),
			),
		);
		const systemMap = new Map(systems.map((s) => [s.name, s]));

		const entries = yield* Effect.try({
			try: () => {
				const baseDir = new Directory(`file://${resolvedPath}`);
				if (!baseDir.exists) return null;
				return baseDir.list();
			},
			catch: (e) => new FilesystemError({ path: resolvedPath, cause: e }),
		});

		if (!entries) return;

		const db = yield* getDb;

		// One query for all existing games, grouped by system
		const allExisting = yield* Effect.tryPromise({
			try: () =>
				db.getAllAsync<{ id: string; system_id: string }>(
					"SELECT id, system_id FROM games",
				),
			catch: (e) => new DatabaseError({ op: "query", cause: e }),
		});

		const existingBySystem = new Map<string, Set<string>>();
		for (const row of allExisting) {
			let ids = existingBySystem.get(row.system_id);
			if (!ids) {
				ids = new Set();
				existingBySystem.set(row.system_id, ids);
			}
			ids.add(row.id);
		}

		const allToInsert: {
			systemId: string;
			id: string;
			title: string;
			filePath: string;
		}[] = [];
		const allToDelete: string[] = [];

		for (const entry of entries) {
			if (!(entry instanceof Directory)) continue;

			const subdirName = nameFromUri(entry.uri);
			const system = systemMap.get(subdirName);
			if (!system) continue;

			const extSet = new Set(system.extensions);
			const romFiles = yield* Effect.try({
				try: () =>
					entry.list().filter((item): item is File => {
						if (!(item instanceof File)) return false;
						const name = nameFromUri(item.uri);
						const dot = name.lastIndexOf(".");
						return dot !== -1 && extSet.has(name.slice(dot).toLowerCase());
					}),
				catch: (e) => new FilesystemError({ path: entry.uri, cause: e }),
			});

			const existingIds =
				existingBySystem.get(system.name) ?? new Set<string>();
			const scannedIds = new Set<string>();

			for (const file of romFiles) {
				const name = nameFromUri(file.uri);
				const filePath = decodeURIComponent(file.uri.replace("file://", ""));
				const id = pathId(filePath);
				scannedIds.add(id);
				if (!existingIds.has(id)) {
					allToInsert.push({
						systemId: system.name,
						id,
						title: titleFromFilename(name),
						filePath,
					});
				}
			}

			for (const existingId of existingIds) {
				if (!scannedIds.has(existingId)) allToDelete.push(existingId);
			}
		}

		if (allToInsert.length > 0 || allToDelete.length > 0) {
			yield* Effect.tryPromise({
				try: () =>
					db.withTransactionAsync(async () => {
						for (const { systemId, id, title, filePath } of allToInsert) {
							await db.runAsync(
								"INSERT OR IGNORE INTO games (id, system_id, title, file_path, play_count) VALUES (?, ?, ?, ?, 0)",
								[id, systemId, title, filePath],
							);
						}
						for (const id of allToDelete) {
							await db.runAsync("DELETE FROM games WHERE id = ?", [id]);
						}
					}),
				catch: (e) => new DatabaseError({ op: "transaction", cause: e }),
			});
		}
	});
