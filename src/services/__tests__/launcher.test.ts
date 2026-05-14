import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
	default: { getItem: vi.fn(), setItem: vi.fn() },
}));
vi.mock("expo-intent-launcher", () => ({
	startActivityAsync: vi.fn(),
}));
vi.mock("expo-sqlite", () => ({
	openDatabaseAsync: vi.fn(),
}));
vi.mock("../findRules", async (importOriginal) => {
	const original = await importOriginal<typeof import("../findRules")>();
	return { ...original, getFindRules: vi.fn() };
});

import { buildSafDocUri, parseEsCommand } from "../launcher";
import type { FindRules } from "../findRules";

const TREE_URI =
	"content://com.android.externalstorage.documents/tree/primary%3AROMs";

const FIND_RULES: FindRules = {
	RETROARCH: ["com.retroarch/com.retroarch.browser.retroactivity.RetroActivityFuture"],
	PPSSPP: ["org.ppsspp.ppsspp/.PpssppActivity", "org.ppsspp.ppssppgold/.PpssppActivity"],
};

const ROM_PATH = "/storage/emulated/0/ROMs/psp/game.iso";
const SAF_DOC_URI = buildSafDocUri(TREE_URI, ROM_PATH) ?? "";

describe("buildSafDocUri", () => {
	it("builds correct document URI for emulated storage", () => {
		const result = buildSafDocUri(TREE_URI, "/storage/emulated/0/ROMs/psp/game.iso");
		expect(result).toBe(
			`${TREE_URI}/document/${encodeURIComponent("primary:ROMs/psp/game.iso")}`,
		);
	});

	it("builds correct URI for nes game", () => {
		const result = buildSafDocUri(TREE_URI, "/storage/emulated/0/ROMs/nes/mario.nes");
		expect(result).toBe(
			`${TREE_URI}/document/${encodeURIComponent("primary:ROMs/nes/mario.nes")}`,
		);
	});

	it("returns null for non-/storage/ paths", () => {
		expect(buildSafDocUri(TREE_URI, "/not-storage/path")).toBeNull();
	});

	it("returns null when no slash after volume", () => {
		expect(buildSafDocUri(TREE_URI, "/storage/emulated")).toBeNull();
	});

	it("returns null when no second slash (no path after user dir)", () => {
		expect(buildSafDocUri(TREE_URI, "/storage/emulated/0")).toBeNull();
	});

	it("builds correct URI for non-emulated volume", () => {
		const result = buildSafDocUri(TREE_URI, "/storage/sdcard/ROMs/gba/pokemon.gba");
		expect(result).toBe(
			`${TREE_URI}/document/${encodeURIComponent("sdcard:ROMs/gba/pokemon.gba")}`,
		);
	});
});

describe("parseEsCommand", () => {
	it("resolves RETROARCH candidates from findRules", () => {
		const intent = parseEsCommand(
			"%EMULATOR_RETROARCH% %ROM%",
			"RetroArch",
			ROM_PATH,
			FIND_RULES,
			SAF_DOC_URI,
		);
		expect(intent).not.toBeNull();
		expect(intent!.candidates).toHaveLength(1);
		expect(intent!.candidates[0].pkg).toBe("com.retroarch");
		expect(intent!.candidates[0].activity).toBe(
			"com.retroarch.browser.retroactivity.RetroActivityFuture",
		);
	});

	it("uses provided label", () => {
		const intent = parseEsCommand("%EMULATOR_RETROARCH% %ROM%", "RetroArch", ROM_PATH, FIND_RULES, null);
		expect(intent!.label).toBe("RetroArch");
	});

	it("falls back to emulator name when label is empty", () => {
		const intent = parseEsCommand("%EMULATOR_RETROARCH% %ROM%", "", ROM_PATH, FIND_RULES, null);
		expect(intent!.label).toBe("RETROARCH");
	});

	it("resolves PPSSPP with two candidates, expanding relative activity", () => {
		const intent = parseEsCommand(
			"%EMULATOR_PPSSPP% %ROMSAF%",
			"PPSSPP",
			ROM_PATH,
			FIND_RULES,
			SAF_DOC_URI,
		);
		expect(intent!.candidates).toHaveLength(2);
		// relative activity starting with '.' gets pkg prepended
		expect(intent!.candidates[0].activity).toBe("org.ppsspp.ppsspp.PpssppActivity");
		expect(intent!.candidates[1].activity).toBe("org.ppsspp.ppssppgold.PpssppActivity");
	});

	it("sets clearTask when %ACTIVITY_CLEAR_TASK% present", () => {
		const intent = parseEsCommand(
			"%EMULATOR_RETROARCH% %ROM% %ACTIVITY_CLEAR_TASK%",
			"",
			ROM_PATH,
			FIND_RULES,
			null,
		);
		expect(intent!.clearTask).toBe(true);
		expect(intent!.clearTop).toBe(false);
	});

	it("sets clearTop when %ACTIVITY_CLEAR_TOP% present", () => {
		const intent = parseEsCommand(
			"%EMULATOR_RETROARCH% %ROM% %ACTIVITY_CLEAR_TOP%",
			"",
			ROM_PATH,
			FIND_RULES,
			null,
		);
		expect(intent!.clearTop).toBe(true);
		expect(intent!.clearTask).toBe(false);
	});

	it("sets action from %ACTION%=", () => {
		const intent = parseEsCommand(
			"%EMULATOR_RETROARCH% %ACTION%=android.intent.action.VIEW",
			"",
			ROM_PATH,
			FIND_RULES,
			null,
		);
		expect(intent!.action).toBe("android.intent.action.VIEW");
	});

	it("sets dataUri from %DATA%=%ROMSAF%", () => {
		const intent = parseEsCommand(
			"%EMULATOR_PPSSPP% %DATA%=%ROMSAF%",
			"",
			ROM_PATH,
			FIND_RULES,
			SAF_DOC_URI,
		);
		expect(intent!.dataUri).toBe(SAF_DOC_URI);
	});

	it("falls back to file:// URI for %ROMSAF% when safDocUri is null", () => {
		const intent = parseEsCommand(
			"%EMULATOR_PPSSPP% %DATA%=%ROMSAF%",
			"",
			ROM_PATH,
			FIND_RULES,
			null,
		);
		expect(intent!.dataUri).toBe(`file://${ROM_PATH}`);
	});

	it("sets extras from %EXTRA_ROM_PATH%=%ROM%", () => {
		const intent = parseEsCommand(
			"%EMULATOR_RETROARCH% %EXTRA_ROM_PATH%=%ROM%",
			"",
			ROM_PATH,
			FIND_RULES,
			null,
		);
		expect(intent!.extras["ROM_PATH"]).toBe(ROM_PATH);
	});

	it("resolves %ANDROIDPACKAGE% in extra value to first candidate pkg", () => {
		const intent = parseEsCommand(
			"%EMULATOR_RETROARCH% %EXTRA_ANDROID_PACKAGE%=%ANDROIDPACKAGE%",
			"",
			ROM_PATH,
			FIND_RULES,
			null,
		);
		expect(intent!.extras["ANDROID_PACKAGE"]).toBe("com.retroarch");
	});

	it("returns null for unknown emulator", () => {
		const intent = parseEsCommand("%EMULATOR_UNKNOWN% %ROM%", "", ROM_PATH, FIND_RULES, null);
		expect(intent).toBeNull();
	});

	it("returns null for non-emulator first token", () => {
		const intent = parseEsCommand("java -jar game.jar", "", ROM_PATH, FIND_RULES, null);
		expect(intent).toBeNull();
	});
});
