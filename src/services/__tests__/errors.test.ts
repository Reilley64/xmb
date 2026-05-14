import { Equal } from "effect";
import { describe, expect, it } from "vitest";

import {
	AllCandidatesFailedError,
	AsyncStorageError,
	ConfigUnavailableError,
	DatabaseError,
	FilesystemError,
	LaunchError,
	NetworkFetchError,
	ParseError,
} from "../errors";

describe("AsyncStorageError", () => {
	it("has correct _tag and fields", () => {
		const err = new AsyncStorageError({ op: "get", key: "myKey", cause: new Error("boom") });
		expect(err._tag).toBe("AsyncStorageError");
		expect(err.op).toBe("get");
		expect(err.key).toBe("myKey");
		expect(err).toBeInstanceOf(AsyncStorageError);
	});

	it("works for op=set", () => {
		const err = new AsyncStorageError({ op: "set", key: "bar", cause: null });
		expect(err.op).toBe("set");
	});

	it("equal for same args", () => {
		const a = new AsyncStorageError({ op: "get", key: "x", cause: null });
		const b = new AsyncStorageError({ op: "get", key: "x", cause: null });
		expect(Equal.equals(a, b)).toBe(true);
	});

	it("not equal for different args", () => {
		const a = new AsyncStorageError({ op: "get", key: "x", cause: null });
		const b = new AsyncStorageError({ op: "set", key: "x", cause: null });
		expect(Equal.equals(a, b)).toBe(false);
	});
});

describe("NetworkFetchError", () => {
	it("has correct _tag and fields", () => {
		const err = new NetworkFetchError({ url: "https://example.com", cause: new Error("timeout") });
		expect(err._tag).toBe("NetworkFetchError");
		expect(err.url).toBe("https://example.com");
		expect(err).toBeInstanceOf(NetworkFetchError);
	});
});

describe("ParseError", () => {
	it("xml source", () => {
		const err = new ParseError({ source: "xml", cause: new Error("bad xml") });
		expect(err._tag).toBe("ParseError");
		expect(err.source).toBe("xml");
	});

	it("json source", () => {
		const err = new ParseError({ source: "json", cause: null });
		expect(err.source).toBe("json");
	});
});

describe("ConfigUnavailableError", () => {
	it("systemConfig resource", () => {
		const err = new ConfigUnavailableError({ resource: "systemConfig" });
		expect(err._tag).toBe("ConfigUnavailableError");
		expect(err.resource).toBe("systemConfig");
	});

	it("findRules resource", () => {
		const err = new ConfigUnavailableError({ resource: "findRules" });
		expect(err.resource).toBe("findRules");
	});
});

describe("DatabaseError", () => {
	it("has correct _tag and fields", () => {
		const err = new DatabaseError({ op: "query", cause: null });
		expect(err._tag).toBe("DatabaseError");
		expect(err.op).toBe("query");
		expect(err).toBeInstanceOf(DatabaseError);
	});
});

describe("FilesystemError", () => {
	it("has correct _tag and fields", () => {
		const err = new FilesystemError({ path: "/storage/roms", cause: null });
		expect(err._tag).toBe("FilesystemError");
		expect(err.path).toBe("/storage/roms");
		expect(err).toBeInstanceOf(FilesystemError);
	});
});

describe("LaunchError", () => {
	it("has correct _tag and fields", () => {
		const err = new LaunchError({ pkg: "com.foo", activity: "com.foo.Main", cause: null });
		expect(err._tag).toBe("LaunchError");
		expect(err.pkg).toBe("com.foo");
		expect(err.activity).toBe("com.foo.Main");
		expect(err).toBeInstanceOf(LaunchError);
	});
});

describe("AllCandidatesFailedError", () => {
	it("has correct _tag and fields", () => {
		const err = new AllCandidatesFailedError({ candidates: [{ pkg: "a", activity: "b" }] });
		expect(err._tag).toBe("AllCandidatesFailedError");
		expect(err.candidates).toHaveLength(1);
		expect(err.candidates[0]).toEqual({ pkg: "a", activity: "b" });
		expect(err).toBeInstanceOf(AllCandidatesFailedError);
	});
});
