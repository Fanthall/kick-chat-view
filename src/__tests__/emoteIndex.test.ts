import { EmoteSet } from "../renderer/constants/emote";
import { KickEmoteGroup } from "../renderer/constants/kickEmotes";
import {
	buildEmoteIndex,
	normalizeKickGroups,
	normalizeSevenTvEmote,
	normalizeSevenTvSet,
	searchEmotes,
} from "../renderer/util/emoteIndex";
import { tokenizeMessage } from "../renderer/util/messageTokens";

const buildSevenTvEmote = (
	overrides: Partial<{
		id: string;
		name: string;
		flags: number;
		animated: boolean;
		frame_count: number;
		dataFlags: number;
		files: Array<{ name: string; format: string; frame_count?: number }>;
	}> = {}
) => {
	const files =
		overrides.files ??
		[
			{ name: "1x.webp", format: "WEBP", frame_count: overrides.frame_count ?? 1 },
			{ name: "2x.webp", format: "WEBP", frame_count: overrides.frame_count ?? 1 },
			{ name: "1x.avif", format: "AVIF", frame_count: overrides.frame_count ?? 1 },
			{ name: "1x.gif", format: "GIF", frame_count: overrides.frame_count ?? 1 },
		];
	return {
		id: overrides.id ?? "01EMOTE",
		name: overrides.name ?? "TestEmote",
		flags: overrides.flags ?? 0,
		timestamp: 0,
		data: {
			id: overrides.id ?? "01EMOTE",
			name: overrides.name ?? "TestEmote",
			flags: overrides.dataFlags ?? 0,
			lifecycle: 3,
			state: [],
			listed: true,
			animated: overrides.animated ?? false,
			owner: {
				id: "ownerid",
				username: "owner",
				display_name: "Owner",
			},
			host: {
				url: "//cdn.7tv.app/emote/01EMOTE",
				files: files.map((f) => ({
					name: f.name,
					static_name: f.name.replace(/\.(gif|webp|avif|png)$/, ".png"),
					width: 28,
					height: 28,
					frame_count: f.frame_count ?? 1,
					size: 1024,
					format: f.format,
				})),
			},
		},
	} as any;
};

describe("normalizeSevenTvEmote", () => {
	it("prefers webp for static emotes and 2x>1x ordering in srcset", () => {
		const entry = normalizeSevenTvEmote(buildSevenTvEmote(), {
			provider: "seventv-channel",
			scope: "channel",
			channelSlug: "demo",
		});
		expect(entry).toBeDefined();
		expect(entry!.urls["1x"]).toMatch(/1x\.webp$/);
		expect(entry!.urls["2x"]).toMatch(/2x\.webp$/);
		expect(entry!.animated).toBe(false);
	});

	it("marks animated when data.animated is true", () => {
		const entry = normalizeSevenTvEmote(
			buildSevenTvEmote({ animated: true, frame_count: 5 }),
			{ provider: "seventv-channel", scope: "channel" }
		);
		expect(entry!.animated).toBe(true);
	});

	it("detects zero-width via emote.flags & 1", () => {
		const entry = normalizeSevenTvEmote(
			buildSevenTvEmote({ flags: 1 }),
			{ provider: "seventv-channel", scope: "channel" }
		);
		expect(entry!.zeroWidth).toBe(true);
	});

	it("detects zero-width via data.flags & 256", () => {
		const entry = normalizeSevenTvEmote(
			buildSevenTvEmote({ dataFlags: 256 }),
			{ provider: "seventv-channel", scope: "channel" }
		);
		expect(entry!.zeroWidth).toBe(true);
	});

	it("falls back to first available file if expected formats missing", () => {
		const entry = normalizeSevenTvEmote(
			buildSevenTvEmote({
				files: [{ name: "1x.gif", format: "GIF", frame_count: 1 }],
			}),
			{ provider: "seventv-global", scope: "global" }
		);
		expect(entry!.urls["1x"]).toMatch(/1x\.gif$/);
	});
});

describe("normalizeKickGroups", () => {
	const groups: KickEmoteGroup[] = [
		{
			id: 1,
			name: "Global",
			emotes: [
				{ id: 10, name: "KickFlex" },
				{ id: 11, name: "POG" },
			],
		},
		{
			id: 2,
			name: "Emojis",
			emotes: [{ id: 20, name: "smile" }],
		},
		{
			id: 3,
			name: "channelname",
			emotes: [
				{ id: 30, name: "channelEmote" },
				{ id: 31, name: "subOnlyEmote", subscribers_only: true },
			],
			channel: { id: 99, slug: "channelname", user: { username: "Channelname" } },
		},
	];

	it("classifies groups into channel/subscriber/global/emoji", () => {
		const sets = normalizeKickGroups(groups, "channelname");
		const byProvider = sets.map((s) => `${s.provider}:${s.name}`);
		expect(byProvider).toContain("kick-global:Kick Global");
		expect(byProvider).toContain("kick-global:Emoji");
		expect(byProvider).toContain("kick-channel:channelname");
		expect(byProvider).toContain("kick-subscriber:channelname Subscriber");
	});

	it("uses [emote:id:name] format for insertText", () => {
		const sets = normalizeKickGroups(groups, "channelname");
		const flat = sets.flatMap((s) => s.emotes);
		const flex = flat.find((e) => e.name === "KickFlex");
		expect(flex?.insertText).toBe("[emote:10:KickFlex]");
		const sub = flat.find((e) => e.name === "subOnlyEmote");
		expect(sub?.subscribersOnly).toBe(true);
	});
});

describe("buildEmoteIndex precedence", () => {
	it("kick-channel wins over seventv-global for same name", () => {
		const kickSet: EmoteSet = {
			provider: "kick-channel",
			scope: "channel",
			channelSlug: "demo",
			name: "demo",
			emotes: [
				{
					id: "kick-1",
					name: "POG",
					provider: "kick-channel",
					scope: "channel",
					channelSlug: "demo",
					animated: false,
					zeroWidth: false,
					urls: { "1x": "https://files.kick.com/emotes/1/fullsize" },
					insertText: "[emote:1:POG]",
				},
			],
		};
		const sevenSet = normalizeSevenTvSet(
			{
				id: "abc",
				name: "Global",
				flags: 0,
				tags: [],
				immutable: true,
				privileged: false,
				emotes: [
					buildSevenTvEmote({ name: "POG", id: "7tv-1" }),
				],
				emote_count: 1,
				capacity: 1,
				owner: undefined as any,
			},
			{ provider: "seventv-global", scope: "global" }
		);
		const index = buildEmoteIndex([kickSet], [sevenSet], "demo");
		const entry = index.byName.get("POG");
		expect(entry?.provider).toBe("kick-channel");
		expect(entry?.insertText).toBe("[emote:1:POG]");
	});
});

describe("searchEmotes", () => {
	const sevenSet = normalizeSevenTvSet(
		{
			id: "global",
			name: "Global",
			flags: 0,
			tags: [],
			immutable: true,
			privileged: false,
			emotes: [
				buildSevenTvEmote({ id: "a", name: "KEKW" }),
				buildSevenTvEmote({ id: "b", name: "KEKWait" }),
				buildSevenTvEmote({ id: "c", name: "Sadge" }),
			],
			emote_count: 3,
			capacity: 3,
			owner: undefined as any,
		},
		{ provider: "seventv-global", scope: "global" }
	);
	const index = buildEmoteIndex([], [sevenSet]);

	it("returns exact and prefix matches first", () => {
		const results = searchEmotes(index, "kek", 5);
		expect(results.length).toBe(2);
		expect(results.map((r) => r.name)).toEqual(["KEKW", "KEKWait"]);
	});

	it("strips leading colon", () => {
		const results = searchEmotes(index, ":sad", 5);
		expect(results.map((r) => r.name)).toContain("Sadge");
	});
});

describe("tokenizeMessage", () => {
	const sevenSet = normalizeSevenTvSet(
		{
			id: "global",
			name: "Global",
			flags: 0,
			tags: [],
			immutable: true,
			privileged: false,
			emotes: [buildSevenTvEmote({ id: "p", name: "peepoSad" })],
			emote_count: 1,
			capacity: 1,
			owner: undefined as any,
		},
		{ provider: "seventv-global", scope: "global" }
	);
	const index = buildEmoteIndex([], [sevenSet]);

	it("matches 7TV emote name as emote token", () => {
		const tokens = tokenizeMessage("merhaba peepoSad bro", index);
		const kinds = tokens.map((t) => t.kind);
		expect(kinds.filter((k) => k === "emote").length).toBe(1);
	});

	it("matches Kick [emote:ID:NAME] format", () => {
		const tokens = tokenizeMessage("[emote:5:KickFlex] sonra", index);
		const emoteToken = tokens.find((t) => t.kind === "emote");
		expect(emoteToken).toBeDefined();
		if (emoteToken?.kind === "emote") {
			expect(emoteToken.emote.name).toBe("KickFlex");
		}
	});

	it("emote eslesmesi case-sensitive: Kappa eslesir, kappa eslesmez", () => {
		const kappaSet = normalizeSevenTvSet(
			{
				id: "k",
				name: "Global",
				flags: 0,
				tags: [],
				immutable: true,
				privileged: false,
				emotes: [buildSevenTvEmote({ id: "k1", name: "Kappa" })],
				emote_count: 1,
				capacity: 1,
				owner: undefined as any,
			},
			{ provider: "seventv-global", scope: "global" }
		);
		const idx = buildEmoteIndex([], [kappaSet]);
		const exact = tokenizeMessage("merhaba Kappa bro", idx).find(
			(t) => t.kind === "emote"
		);
		const lower = tokenizeMessage("merhaba kappa bro", idx).find(
			(t) => t.kind === "emote"
		);
		const upper = tokenizeMessage("merhaba KAPPA bro", idx).find(
			(t) => t.kind === "emote"
		);
		expect(exact).toBeDefined();
		if (exact?.kind === "emote") expect(exact.emote.name).toBe("Kappa");
		expect(lower).toBeUndefined();
		expect(upper).toBeUndefined();
	});
});
