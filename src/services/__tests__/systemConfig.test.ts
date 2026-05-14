import { Effect, Exit } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../http", () => ({
	fetchText: vi.fn(),
	readStorage: vi.fn(),
	writeStorage: vi.fn(),
}));

import { fetchText, readStorage, writeStorage } from "../http";
import { normalizeCommands, parseExtensions, parseXml, getSystemConfig } from "../systemConfig";

const NES_SYSTEM_XML = `<?xml version="1.0"?>
<systemList>
  <system>
    <name>nes</name>
    <fullname>Nintendo Entertainment System</fullname>
    <extension>.nes .NES .zip .ZIP</extension>
    <command label="RetroArch">%EMULATOR_RETROARCH% %ROM%</command>
  </system>
</systemList>`;

const TWO_SYSTEM_XML = `<?xml version="1.0"?>
<systemList>
  <system>
    <name>nes</name>
    <fullname>Nintendo Entertainment System</fullname>
    <extension>.nes .NES .zip .ZIP</extension>
    <command label="RetroArch">%EMULATOR_RETROARCH% %ROM%</command>
  </system>
  <system>
    <name>gb</name>
    <fullname>Nintendo Game Boy</fullname>
    <extension>.gb .GB .gbc .GBC .zip .ZIP</extension>
    <command label="RetroArch">%EMULATOR_RETROARCH% %ROM%</command>
    <command label="Lemuroid">%EMULATOR_LEMUROID% %ROM%</command>
  </system>
</systemList>`;

describe("parseExtensions", () => {
	it("deduplicates and lowercases extensions", () => {
		expect(parseExtensions(".nes .NES .zip .ZIP")).toEqual([".nes", ".zip"]);
	});

	it("deduplicates case-insensitively", () => {
		expect(parseExtensions(".gb .GB .gbc .GBC .zip .ZIP .7z")).toEqual([".gb", ".gbc", ".zip", ".7z"]);
	});

	it("returns empty array for empty string", () => {
		expect(parseExtensions("")).toEqual([]);
	});

	it("trims leading and trailing whitespace", () => {
		expect(parseExtensions("  .iso  ")).toEqual([".iso"]);
	});

	it("deduplicates exact same extension listed multiple times", () => {
		expect(parseExtensions(".rom .ROM .rom")).toEqual([".rom"]);
	});
});

describe("normalizeCommands", () => {
	it("returns empty array for null", () => {
		expect(normalizeCommands(null)).toEqual([]);
	});

	it("returns empty array for undefined", () => {
		expect(normalizeCommands(undefined)).toEqual([]);
	});

	it("wraps a plain string with empty label", () => {
		expect(normalizeCommands("single string command")).toEqual([
			{ label: "", command: "single string command" },
		]);
	});

	it("maps array of strings to label/command pairs", () => {
		expect(normalizeCommands(["cmd1", "cmd2"])).toEqual([
			{ label: "", command: "cmd1" },
			{ label: "", command: "cmd2" },
		]);
	});

	it("extracts label and command from object with @_label and #text", () => {
		expect(
			normalizeCommands({ "@_label": "RetroArch", "#text": "%EMULATOR_RETROARCH% %ROM%" }),
		).toEqual([{ label: "RetroArch", command: "%EMULATOR_RETROARCH% %ROM%" }]);
	});

	it("maps array of objects to label/command pairs", () => {
		const result = normalizeCommands([
			{ "@_label": "PPSSPP", "#text": "%EMULATOR_PPSSPP% %ROMSAF%" },
			{ "@_label": "AetherSX2", "#text": "%EMULATOR_AETHERSX2% %ROM%" },
		]);
		expect(result).toEqual([
			{ label: "PPSSPP", command: "%EMULATOR_PPSSPP% %ROMSAF%" },
			{ label: "AetherSX2", command: "%EMULATOR_AETHERSX2% %ROM%" },
		]);
	});
});

describe("parseXml", () => {
	it("parses a single system", () => {
		const result = parseXml(NES_SYSTEM_XML);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("nes");
		expect(result[0].fullname).toBe("Nintendo Entertainment System");
	});

	it("deduplicates and lowercases extensions", () => {
		const result = parseXml(NES_SYSTEM_XML);
		expect(result[0].extensions).toEqual([".nes", ".zip"]);
	});

	it("parses single command element", () => {
		const result = parseXml(NES_SYSTEM_XML);
		expect(result[0].commands).toEqual([
			{ label: "RetroArch", command: "%EMULATOR_RETROARCH% %ROM%" },
		]);
	});

	it("parses multiple command elements", () => {
		const result = parseXml(TWO_SYSTEM_XML);
		expect(result[1].commands).toHaveLength(2);
	});

	it("parses multiple systems", () => {
		const result = parseXml(TWO_SYSTEM_XML);
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe("nes");
		expect(result[1].name).toBe("gb");
	});

	it("returns empty array for empty systemList", () => {
		expect(parseXml("<systemList></systemList>")).toEqual([]);
	});
});

describe("getSystemConfig Effect", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns cached result without fetching when cache hit", async () => {
		const cached = JSON.stringify([{ name: "nes", fullname: "NES", extensions: [".nes"], commands: [] }]);
		vi.mocked(readStorage).mockReturnValue(Effect.succeed(cached));

		const result = await Effect.runPromise(getSystemConfig());
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("nes");
		expect(vi.mocked(fetchText)).not.toHaveBeenCalled();
	});

	it("fetches when cache is null", async () => {
		vi.mocked(readStorage).mockReturnValue(Effect.succeed(null));
		vi.mocked(fetchText).mockReturnValue(Effect.succeed(NES_SYSTEM_XML));
		vi.mocked(writeStorage).mockReturnValue(Effect.succeed(undefined as unknown as void));

		const result = await Effect.runPromise(getSystemConfig());
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("nes");
		expect(vi.mocked(fetchText)).toHaveBeenCalledTimes(2);
	});

	it("custom overrides official for same system name", async () => {
		const officialXml = `<systemList><system><name>nes</name><fullname>Official NES</fullname><extension>.nes</extension></system></systemList>`;
		const customXml = `<systemList><system><name>nes</name><fullname>Custom NES</fullname><extension>.nes .zip</extension></system></systemList>`;

		vi.mocked(readStorage).mockReturnValue(Effect.succeed(null));
		vi.mocked(fetchText)
			.mockReturnValueOnce(Effect.succeed(officialXml))
			.mockReturnValueOnce(Effect.succeed(customXml));
		vi.mocked(writeStorage).mockReturnValue(Effect.succeed(undefined as unknown as void));

		const result = await Effect.runPromise(getSystemConfig());
		expect(result).toHaveLength(1);
		expect(result[0].fullname).toBe("Custom NES");
	});

	it("fails with ConfigUnavailableError when both fetches fail and no cache", async () => {
		vi.mocked(readStorage).mockReturnValue(Effect.succeed(null));
		vi.mocked(fetchText).mockReturnValue(
			Effect.fail({ _tag: "NetworkFetchError", url: "http://x", cause: new Error() }),
		);

		const exit = await Effect.runPromiseExit(getSystemConfig());
		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const cause = exit.cause;
			// unwrap the Cause to get the error
			expect(JSON.stringify(cause)).toContain("ConfigUnavailableError");
		}
	});

	it("falls back to stale cache when both fetches fail", async () => {
		const stale = JSON.stringify([{ name: "gb", fullname: "Game Boy", extensions: [".gb"], commands: [] }]);
		vi.mocked(readStorage).mockReturnValue(Effect.succeed(stale));
		vi.mocked(fetchText).mockReturnValue(
			Effect.fail({ _tag: "NetworkFetchError", url: "http://x", cause: new Error() }),
		);

		const result = await Effect.runPromise(getSystemConfig(true));
		expect(result[0].name).toBe("gb");
	});

	it("ignores cache and fetches when forceRefresh=true", async () => {
		const cached = JSON.stringify([{ name: "old", fullname: "Old", extensions: [], commands: [] }]);
		vi.mocked(readStorage).mockReturnValue(Effect.succeed(cached));
		vi.mocked(fetchText).mockReturnValue(Effect.succeed(NES_SYSTEM_XML));
		vi.mocked(writeStorage).mockReturnValue(Effect.succeed(undefined as unknown as void));

		const result = await Effect.runPromise(getSystemConfig(true));
		expect(result[0].name).toBe("nes");
		expect(vi.mocked(fetchText)).toHaveBeenCalled();
	});
});
