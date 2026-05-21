/**
 * Sprint 58 — Automation rules helper unit tests.
 */

import {
	fillPlaceholders,
	matchesChatPattern,
	matchesMentionTrigger,
	ruleAppliesToChannel,
	createBlankRule,
	ChannelRule,
} from "../renderer/util/automationRules";
import {
	loadAutomationRules,
	saveAutomationRules,
	upsertAutomationRule,
	deleteAutomationRule,
} from "../renderer/util/automationRulesStorage";

describe("automationRules helpers", () => {
	test("fillPlaceholders replaces known placeholders, leaves unknown alone", () => {
		const out = fillPlaceholders("Selam {username}! {amount} kicks geldi.", {
			channelSlug: "test",
			username: "fanthal",
			amount: 42,
		});
		expect(out).toBe("Selam fanthal! 42 kicks geldi.");
	});

	test("fillPlaceholders handles missing values as empty string", () => {
		const out = fillPlaceholders("Hi {username} ({months}mo)", {
			channelSlug: "test",
			username: "x",
		});
		expect(out).toBe("Hi x (mo)");
	});

	test("matchesChatPattern substring works case-insensitive", () => {
		expect(
			matchesChatPattern(
				{ type: "chat_match", pattern: "merhaba", caseInsensitive: true },
				"Merhaba ben yeniyim"
			)
		).toBe(true);
		expect(
			matchesChatPattern(
				{ type: "chat_match", pattern: "merhaba", caseInsensitive: false },
				"Merhaba ben yeniyim"
			)
		).toBe(false);
	});

	test("matchesChatPattern regex mode", () => {
		expect(
			matchesChatPattern(
				{
					type: "chat_match",
					pattern: "^/discord$",
					isRegex: true,
					caseInsensitive: true,
				},
				"/discord"
			)
		).toBe(true);
		expect(
			matchesChatPattern(
				{ type: "chat_match", pattern: "^/discord$", isRegex: true },
				"go to /discord please"
			)
		).toBe(false);
	});

	test("matchesChatPattern empty pattern returns false", () => {
		expect(
			matchesChatPattern({ type: "chat_match", pattern: "" }, "hi")
		).toBe(false);
	});

	test("matchesMentionTrigger uses my username when usernames empty", () => {
		expect(
			matchesMentionTrigger({ type: "mention" }, "@Fanthal hi!", "fanthal")
		).toBe(true);
		expect(
			matchesMentionTrigger({ type: "mention" }, "yo @notme", "fanthal")
		).toBe(false);
	});

	test("matchesMentionTrigger custom usernames list", () => {
		expect(
			matchesMentionTrigger(
				{ type: "mention", usernames: ["botRix", "Helper"] },
				"@botrix help"
			)
		).toBe(true);
	});

	test("ruleAppliesToChannel — empty channelSlugs = global", () => {
		const rule: ChannelRule = {
			...createBlankRule(),
			channelSlugs: [],
			enabled: true,
		};
		expect(ruleAppliesToChannel(rule, "anything")).toBe(true);
	});

	test("ruleAppliesToChannel — disabled rule never applies", () => {
		const rule: ChannelRule = {
			...createBlankRule(),
			channelSlugs: [],
			enabled: false,
		};
		expect(ruleAppliesToChannel(rule, "anything")).toBe(false);
	});

	test("ruleAppliesToChannel — explicit list match case-insensitive", () => {
		const rule: ChannelRule = {
			...createBlankRule(),
			channelSlugs: ["Fanthal"],
			enabled: true,
		};
		expect(ruleAppliesToChannel(rule, "fanthal")).toBe(true);
		expect(ruleAppliesToChannel(rule, "other")).toBe(false);
	});
});

describe("automationRulesStorage", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	test("save + load roundtrip", () => {
		const r1: ChannelRule = { ...createBlankRule(), name: "first" };
		const r2: ChannelRule = { ...createBlankRule(), name: "second" };
		saveAutomationRules([r1, r2]);
		const loaded = loadAutomationRules();
		expect(loaded).toHaveLength(2);
		expect(loaded.map((r) => r.name)).toEqual(["first", "second"]);
	});

	test("loadAutomationRules returns [] when storage is empty or invalid", () => {
		expect(loadAutomationRules()).toEqual([]);
		localStorage.setItem("chatViewAutomationRules", "not json");
		expect(loadAutomationRules()).toEqual([]);
		localStorage.setItem("chatViewAutomationRules", JSON.stringify({}));
		expect(loadAutomationRules()).toEqual([]);
	});

	test("upsert inserts new and updates existing by id", () => {
		const r: ChannelRule = { ...createBlankRule(), name: "first" };
		upsertAutomationRule(r);
		expect(loadAutomationRules()).toHaveLength(1);

		upsertAutomationRule({ ...r, name: "renamed" });
		const after = loadAutomationRules();
		expect(after).toHaveLength(1);
		expect(after[0].name).toBe("renamed");
	});

	test("delete removes by id", () => {
		const r1: ChannelRule = { ...createBlankRule(), name: "a" };
		const r2: ChannelRule = { ...createBlankRule(), name: "b" };
		saveAutomationRules([r1, r2]);
		deleteAutomationRule(r1.id);
		const after = loadAutomationRules();
		expect(after).toHaveLength(1);
		expect(after[0].name).toBe("b");
	});
});
