import { Data } from "effect";

export class AsyncStorageError extends Data.TaggedError("AsyncStorageError")<{
	readonly op: "get" | "set";
	readonly key: string;
	readonly cause: unknown;
}> {}

export class NetworkFetchError extends Data.TaggedError("NetworkFetchError")<{
	readonly url: string;
	readonly cause: unknown;
}> {}

export class ParseError extends Data.TaggedError("ParseError")<{
	readonly source: "xml" | "json";
	readonly cause: unknown;
}> {}

export class ConfigUnavailableError extends Data.TaggedError(
	"ConfigUnavailableError",
)<{
	readonly resource: "systemConfig" | "findRules";
}> {}

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
	readonly op: string;
	readonly cause: unknown;
}> {}

export class FilesystemError extends Data.TaggedError("FilesystemError")<{
	readonly path: string;
	readonly cause: unknown;
}> {}

export class LaunchError extends Data.TaggedError("LaunchError")<{
	readonly pkg: string;
	readonly activity: string;
	readonly cause: unknown;
}> {}

export class AllCandidatesFailedError extends Data.TaggedError(
	"AllCandidatesFailedError",
)<{
	readonly candidates: ReadonlyArray<{ pkg: string; activity: string }>;
}> {}
