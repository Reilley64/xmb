import * as SQLite from "expo-sqlite";
import { Effect, Option, Ref } from "effect";

import { DatabaseError } from "./errors";

const dbRef = Effect.runSync(Ref.make(Option.none<SQLite.SQLiteDatabase>()));

const openAndInit: Effect.Effect<SQLite.SQLiteDatabase, DatabaseError> =
	Effect.gen(function* () {
		const db = yield* Effect.tryPromise({
			try: () => SQLite.openDatabaseAsync("roms.db"),
			catch: (e) => new DatabaseError({ op: "open", cause: e }),
		});
		yield* Effect.tryPromise({
			try: () =>
				db.execAsync(`
          CREATE TABLE IF NOT EXISTS games (
            id          TEXT PRIMARY KEY,
            system_id   TEXT NOT NULL,
            title       TEXT NOT NULL,
            file_path   TEXT NOT NULL,
            last_played INTEGER,
            play_count  INTEGER NOT NULL DEFAULT 0
          );
          CREATE INDEX IF NOT EXISTS games_system_id ON games (system_id);
        `),
			catch: (e) => new DatabaseError({ op: "exec", cause: e }),
		});
		yield* Ref.set(dbRef, Option.some(db));
		return db;
	});

export const getDb: Effect.Effect<SQLite.SQLiteDatabase, DatabaseError> =
	Effect.suspend(() => Ref.get(dbRef)).pipe(
		Effect.flatMap(
			Option.match({
				onNone: () => openAndInit,
				onSome: Effect.succeed,
			}),
		),
	);

export const resetDb: Effect.Effect<void, DatabaseError> = Ref.getAndSet(
	dbRef,
	Option.none(),
).pipe(
	Effect.flatMap(
		Option.match({
			onNone: () => Effect.void,
			onSome: (db) =>
				Effect.tryPromise({
					try: () => db.closeAsync(),
					catch: (e) => new DatabaseError({ op: "close", cause: e }),
				}),
		}),
	),
);
