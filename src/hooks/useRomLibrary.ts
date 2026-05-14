import AsyncStorage from "@react-native-async-storage/async-storage";
import { Effect, Fiber } from "effect";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Game, System } from "@/data/systems";
import { getDb } from "@/services/db";
import { AsyncStorageError, DatabaseError } from "@/services/errors";
import { ROM_BASE_PATH_KEY, scanRoms } from "@/services/romScanner";
import type { EsSystem } from "@/services/systemConfig";
import { getSystemConfig } from "@/services/systemConfig";

type GameRow = {
	id: string;
	system_id: string;
	title: string;
	file_path: string;
	last_played: number | null;
	play_count: number;
};

function gameRowToGame(g: GameRow): Game {
	return {
		id: g.id,
		system_id: g.system_id,
		title: g.title,
		file_path: g.file_path,
		last_played: g.last_played ?? undefined,
		play_count: g.play_count,
	};
}

export function useRomLibrary() {
	const [systems, setSystems] = useState<System[]>([]);
	const [recentGames, setRecentGames] = useState<Game[]>([]);

	// State setters are stable across renders (React guarantee), so this Effect is safe to memoize once.
	const loadEffect = useMemo(
		() =>
			Effect.gen(function* () {
				const [db, esSystems] = yield* Effect.all(
					[
						getDb,
						getSystemConfig().pipe(
							Effect.orElseSucceed(() => [] as EsSystem[]),
						),
					],
					{ concurrency: "unbounded" },
				);

				const [allGames, recent] = yield* Effect.all(
					[
						Effect.tryPromise({
							try: () =>
								db.getAllAsync<GameRow>(
									"SELECT id, system_id, title, file_path, last_played, play_count FROM games ORDER BY title",
								),
							catch: (e) => new DatabaseError({ op: "query", cause: e }),
						}),
						Effect.tryPromise({
							try: () =>
								db.getAllAsync<GameRow>(
									"SELECT id, system_id, title, file_path, last_played, play_count FROM games WHERE last_played IS NOT NULL ORDER BY last_played DESC",
								),
							catch: (e) => new DatabaseError({ op: "query", cause: e }),
						}),
					],
					{ concurrency: "unbounded" },
				);

				const gamesBySystem = new Map<string, GameRow[]>();
				for (const g of allGames) {
					let bucket = gamesBySystem.get(g.system_id);
					if (!bucket) {
						bucket = [];
						gamesBySystem.set(g.system_id, bucket);
					}
					bucket.push(g);
				}

				const loaded: System[] = [];
				for (const esSystem of esSystems) {
					const games = gamesBySystem.get(esSystem.name);
					if (games && games.length > 0) {
						loaded.push({
							id: esSystem.name,
							name: esSystem.fullname,
							shortName: esSystem.name.toUpperCase().slice(0, 4),
							games: games.map(gameRowToGame),
							commands: esSystem.commands,
						});
					}
				}

				yield* Effect.sync(() => {
					setSystems(loaded);
					setRecentGames(recent.map(gameRowToGame));
				});
			}),
		[],
	);

	const scanAndLoadEffect = useMemo(
		() =>
			scanRoms().pipe(
				Effect.flatMap(() => loadEffect),
				Effect.catchAll(() => Effect.void),
			),
		[loadEffect],
	);

	const setBasePathEffect = useCallback(
		(path: string) =>
			Effect.gen(function* () {
				yield* Effect.tryPromise({
					try: () => AsyncStorage.setItem(ROM_BASE_PATH_KEY, path),
					catch: (e) =>
						new AsyncStorageError({
							op: "set",
							key: ROM_BASE_PATH_KEY,
							cause: e,
						}),
				});
				yield* scanRoms(path).pipe(Effect.catchAll(() => Effect.void));
				yield* loadEffect.pipe(Effect.catchAll(() => Effect.void));
			}),
		[loadEffect],
	);

	useEffect(() => {
		const loadFiber = Effect.runFork(
			loadEffect.pipe(
				Effect.catchAll((e) =>
					Effect.sync(() => console.error("[useRomLibrary] loadFromDb", e)),
				),
			),
		);
		const scanFiber = Effect.runFork(scanAndLoadEffect);

		return () => {
			Effect.runFork(Fiber.interrupt(loadFiber));
			Effect.runFork(Fiber.interrupt(scanFiber));
		};
	}, [loadEffect, scanAndLoadEffect]);

	const setRomBasePath = useCallback(
		(path: string) => Effect.runPromise(setBasePathEffect(path)),
		[setBasePathEffect],
	);

	const refresh = useCallback(
		() =>
			Effect.runPromise(
				loadEffect.pipe(
					Effect.catchAll((e) =>
						Effect.sync(() => console.error("[useRomLibrary] refresh", e)),
					),
				),
			),
		[loadEffect],
	);

	return { systems, recentGames, setRomBasePath, refresh };
}
