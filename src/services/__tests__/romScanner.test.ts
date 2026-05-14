import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
	default: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock("expo-file-system", () => ({
	Directory: vi.fn(),
	File: vi.fn(),
}));
vi.mock("expo-sqlite", () => ({
	openDatabaseAsync: vi.fn(),
}));

import { nameFromUri, pathId, titleFromFilename } from "../romScanner";

describe("nameFromUri", () => {
	it("decodes percent-encoded spaces", () => {
		expect(nameFromUri("file:///storage/emulated/0/ROMs/nes/Super%20Mario%20Bros.nes")).toBe(
			"Super Mario Bros.nes",
		);
	});

	it("strips trailing slash before taking last segment", () => {
		expect(nameFromUri("file:///roms/nes/")).toBe("nes");
	});

	it("returns last path segment without trailing slash", () => {
		expect(nameFromUri("file:///storage/emulated/0/ROMs/nes")).toBe("nes");
	});

	it("decodes percent-encoded colon", () => {
		expect(
			nameFromUri(
				"content://com.android.externalstorage.documents/tree/primary%3AROMs",
			),
		).toBe("primary:ROMs");
	});

	it("handles deeply nested path", () => {
		expect(nameFromUri("file:///storage/emulated/0/ROMs/ps2/Crash%20Bandicoot.iso")).toBe(
			"Crash Bandicoot.iso",
		);
	});
});

describe("titleFromFilename", () => {
	it("strips extension and replaces underscores with spaces", () => {
		expect(titleFromFilename("Super_Mario_Bros.nes")).toBe("Super Mario Bros");
	});

	it("replaces dashes and underscores with spaces", () => {
		expect(titleFromFilename("Zelda-A_Link_to_the_Past.sfc")).toBe("Zelda A Link to the Past");
	});

	it("strips only the last extension for multiple dots", () => {
		expect(titleFromFilename("multiple.dots.rom")).toBe("multiple.dots");
	});

	it("strips single extension", () => {
		expect(titleFromFilename("game.rom")).toBe("game");
	});

	it("handles filename with dashes only", () => {
		expect(titleFromFilename("fire-red.gba")).toBe("fire red");
	});

	it("trims leading/trailing spaces after replacement", () => {
		expect(titleFromFilename("__leading.nes")).toBe("leading");
	});
});

describe("pathId", () => {
	it("is deterministic — same input gives same output", () => {
		const path = "/storage/emulated/0/ROMs/nes/mario.nes";
		expect(pathId(path)).toBe(pathId(path));
	});

	it("different paths produce different IDs", () => {
		expect(pathId("/storage/emulated/0/ROMs/nes/mario.nes")).not.toBe(
			pathId("/storage/emulated/0/ROMs/snes/zelda.sfc"),
		);
	});

	it("returns a 16-character lowercase hex string", () => {
		const id = pathId("/storage/emulated/0/ROMs/gba/pokemon.gba");
		expect(id).toMatch(/^[0-9a-f]{16}$/);
	});

	it("empty string returns FNV offset basis concatenated", () => {
		expect(pathId("")).toBe("811c9dc584222325");
	});

	it("single character produces consistent hash", () => {
		const id = pathId("a");
		expect(id).toHaveLength(16);
		expect(id).toMatch(/^[0-9a-f]{16}$/);
		expect(id).toBe(pathId("a"));
	});
});
