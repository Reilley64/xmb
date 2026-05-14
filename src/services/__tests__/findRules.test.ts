import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../http", () => ({
	fetchText: vi.fn(),
	readStorage: vi.fn(),
	writeStorage: vi.fn(),
}));

import { fetchText, readStorage, writeStorage } from "../http";
import { NetworkFetchError } from "../errors";
import { getFindRules, parseXml } from "../findRules";

const FIND_RULES_XML = `<?xml version="1.0"?>
<ruleList>
  <emulator name="RETROARCH">
    <rule type="androidpackage">
      <entry>com.retroarch/com.retroarch.browser.retroactivity.RetroActivityFuture</entry>
    </rule>
  </emulator>
  <emulator name="PPSSPP">
    <rule type="androidpackage">
      <entry>org.ppsspp.ppsspp/.PpssppActivity</entry>
      <entry>org.ppsspp.ppssppgold/.PpssppActivity</entry>
    </rule>
  </emulator>
  <emulator name="LEMUROID">
    <rule type="androidpackage">
      <entry>com.swordfish.lemuroid/.main.MainActivity</entry>
    </rule>
  </emulator>
</ruleList>`;

const RETROARCH_XML = `<?xml version="1.0"?>
<ruleList>
  <emulator name="RETROARCH">
    <rule type="androidpackage">
      <entry>com.retroarch/com.retroarch.browser.retroactivity.RetroActivityFuture</entry>
    </rule>
  </emulator>
</ruleList>`;

const PPSSPP_XML = `<?xml version="1.0"?>
<ruleList>
  <emulator name="PPSSPP">
    <rule type="androidpackage">
      <entry>org.ppsspp.ppsspp/.PpssppActivity</entry>
    </rule>
  </emulator>
</ruleList>`;

describe("parseXml", () => {
	it("parses multiple emulators with correct keys", () => {
		const result = parseXml(FIND_RULES_XML);
		expect(Object.keys(result)).toHaveLength(3);
		expect(result.RETROARCH).toBeDefined();
		expect(result.PPSSPP).toBeDefined();
		expect(result.LEMUROID).toBeDefined();
	});

	it("uppercases emulator names", () => {
		const xml = `<ruleList><emulator name="retroarch"><rule><entry>com.retroarch/Activity</entry></rule></emulator></ruleList>`;
		const result = parseXml(xml);
		expect(result.RETROARCH).toBeDefined();
		expect(result.retroarch).toBeUndefined();
	});

	it("single entry produces a one-element array", () => {
		const result = parseXml(FIND_RULES_XML);
		expect(result.RETROARCH).toEqual([
			"com.retroarch/com.retroarch.browser.retroactivity.RetroActivityFuture",
		]);
	});

	it("multiple entries produce an array", () => {
		const result = parseXml(FIND_RULES_XML);
		expect(result.PPSSPP).toEqual([
			"org.ppsspp.ppsspp/.PpssppActivity",
			"org.ppsspp.ppssppgold/.PpssppActivity",
		]);
	});

	it("emulator with no entries is excluded", () => {
		const xml = `<ruleList><emulator name="EMPTY"><rule></rule></emulator></ruleList>`;
		const result = parseXml(xml);
		expect(result.EMPTY).toBeUndefined();
	});

	it("emulator with no rule element is excluded", () => {
		const xml = `<ruleList><emulator name="NORULE"></emulator></ruleList>`;
		const result = parseXml(xml);
		expect(result.NORULE).toBeUndefined();
	});

	it("empty ruleList returns empty object", () => {
		expect(parseXml("<ruleList></ruleList>")).toEqual({});
	});
});

describe("getFindRules Effect", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns cached result without fetching on cache hit", async () => {
		const cached = JSON.stringify({ RETROARCH: ["com.retroarch/Activity"] });
		vi.mocked(readStorage).mockReturnValue(Effect.succeed(cached));

		const result = await Effect.runPromise(getFindRules());
		expect(result.RETROARCH).toEqual(["com.retroarch/Activity"]);
		expect(vi.mocked(fetchText)).not.toHaveBeenCalled();
	});

	it("fetches and merges when cache is null", async () => {
		vi.mocked(readStorage).mockReturnValue(Effect.succeed(null));
		vi.mocked(fetchText)
			.mockReturnValueOnce(Effect.succeed(RETROARCH_XML))
			.mockReturnValueOnce(Effect.succeed(PPSSPP_XML));
		vi.mocked(writeStorage).mockReturnValue(Effect.succeed(undefined as unknown as void));

		const result = await Effect.runPromise(getFindRules());
		expect(result.RETROARCH).toBeDefined();
		expect(result.PPSSPP).toBeDefined();
		expect(vi.mocked(fetchText)).toHaveBeenCalledTimes(2);
	});

	it("custom overrides official for same emulator name", async () => {
		const officialXml = `<ruleList><emulator name="RETROARCH"><rule><entry>com.official/Activity</entry></rule></emulator></ruleList>`;
		const customXml = `<ruleList><emulator name="RETROARCH"><rule><entry>com.custom/Activity</entry></rule></emulator></ruleList>`;

		vi.mocked(readStorage).mockReturnValue(Effect.succeed(null));
		vi.mocked(fetchText)
			.mockReturnValueOnce(Effect.succeed(officialXml))
			.mockReturnValueOnce(Effect.succeed(customXml));
		vi.mocked(writeStorage).mockReturnValue(Effect.succeed(undefined as unknown as void));

		const result = await Effect.runPromise(getFindRules());
		expect(result.RETROARCH).toEqual(["com.custom/Activity"]);
	});

	it("returns empty object when both fetches fail and no cache", async () => {
		vi.mocked(readStorage).mockReturnValue(Effect.succeed(null));
		vi.mocked(fetchText).mockReturnValue(
			Effect.fail(new NetworkFetchError({ url: "http://x", cause: new Error() })),
		);

		const result = await Effect.runPromise(getFindRules());
		expect(result).toEqual({});
	});

	it("falls back to stale cache when both fetches fail", async () => {
		const stale = JSON.stringify({ LEMUROID: ["com.swordfish.lemuroid/.main.MainActivity"] });
		vi.mocked(readStorage).mockReturnValue(Effect.succeed(stale));
		vi.mocked(fetchText).mockReturnValue(
			Effect.fail(new NetworkFetchError({ url: "http://x", cause: new Error() })),
		);

		const result = await Effect.runPromise(getFindRules(true));
		expect(result.LEMUROID).toBeDefined();
	});

	it("ignores cache and fetches when forceRefresh=true", async () => {
		const cached = JSON.stringify({ OLD: ["com.old/Activity"] });
		vi.mocked(readStorage).mockReturnValue(Effect.succeed(cached));
		vi.mocked(fetchText).mockReturnValue(Effect.succeed(RETROARCH_XML));
		vi.mocked(writeStorage).mockReturnValue(Effect.succeed(undefined as unknown as void));

		const result = await Effect.runPromise(getFindRules(true));
		expect(result.RETROARCH).toBeDefined();
		expect(vi.mocked(fetchText)).toHaveBeenCalled();
	});
});
