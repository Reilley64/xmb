import AsyncStorage from "@react-native-async-storage/async-storage";
import { Effect } from "effect";

import { AsyncStorageError, NetworkFetchError } from "./errors";

export const fetchText = (
	url: string,
): Effect.Effect<string, NetworkFetchError> =>
	Effect.tryPromise({
		try: () => fetch(url).then((r) => r.text()),
		catch: (e) => new NetworkFetchError({ url, cause: e }),
	});

export const readStorage = (
	key: string,
): Effect.Effect<string | null, AsyncStorageError> =>
	Effect.tryPromise({
		try: () => AsyncStorage.getItem(key),
		catch: (e) => new AsyncStorageError({ op: "get", key, cause: e }),
	});

export const writeStorage = (
	key: string,
	value: string,
): Effect.Effect<void, AsyncStorageError> =>
	Effect.tryPromise({
		try: () => AsyncStorage.setItem(key, value),
		catch: (e) => new AsyncStorageError({ op: "set", key, cause: e }),
	});
