import {
	renderMessageHtml,
	renderMessageHtmlSnippet,
	buildEmoteMessageHtml,
} from "../renderer/util/chatHtml";
import {
	EMPTY_EMOTE_INDEX,
	EmoteIndex,
	buildEmoteIndex,
	normalizeSevenTvSet,
} from "../renderer/util/emoteIndex";

// Minimal 7TV set fixture: bir tane emote (KEKW)
const sevenTvFixtureSet = normalizeSevenTvSet(
	{
		id: "set-1",
		name: "Global 7TV",
		flags: 0,
		tags: [],
		immutable: true,
		privileged: false,
		emote_count: 1,
		capacity: 1,
		owner: undefined as any,
		emotes: [
			{
				id: "01HX",
				name: "KEKW",
				flags: 0,
				timestamp: 0,
				actor_id: "x",
				data: {
					id: "01HX",
					name: "KEKW",
					flags: 0,
					tags: [],
					lifecycle: 3,
					state: ["LISTED"],
					listed: true,
					animated: false,
					owner: undefined as any,
					host: {
						url: "//cdn.7tv.app/emote/01HX",
						files: [
							{ name: "1x.webp", format: "WEBP", width: 28, height: 28, size: 0 },
							{ name: "2x.webp", format: "WEBP", width: 56, height: 56, size: 0 },
						],
					},
				},
			},
		] as any,
	} as any,
	{ provider: "seventv-global", scope: "global" }
);
const indexWithKekw: EmoteIndex = buildEmoteIndex([], [sevenTvFixtureSet]);

describe("renderMessageHtml", () => {
	it("escapes plain text and lets Kick fallback render unknown emote tokens", () => {
		const html = renderMessageHtml(
			"hello [emote:4147902:KEKBye] world",
			EMPTY_EMOTE_INDEX
		);
		expect(html).toContain("hello");
		expect(html).toContain("world");
		// Kick fallback URL pattern uses files.kick.com/emotes/{id}/fullsize
		expect(html).toContain('src="https://files.kick.com/emotes/4147902/fullsize"');
		expect(html).toContain('alt="KEKBye"');
		// Raw token should NOT appear (escaped or kept literal)
		expect(html).not.toContain("[emote:4147902:KEKBye]");
	});

	it("renders 7TV emote when present in index (case-sensitive)", () => {
		const html = renderMessageHtml("oh KEKW lol", indexWithKekw);
		expect(html).toContain('alt="KEKW"');
		expect(html).toContain('class="chat-emote chat-emote--seventv-global"');
	});

	it("does not render emote img for unknown plain word", () => {
		const html = renderMessageHtml("kekw lowercase", EMPTY_EMOTE_INDEX);
		expect(html).not.toContain("<img");
		expect(html).toContain("kekw lowercase");
	});

	it("handles empty content safely", () => {
		expect(renderMessageHtml("", EMPTY_EMOTE_INDEX)).toBe("");
	});

	it("escapes HTML in plain text (XSS guard)", () => {
		const html = renderMessageHtml("<script>x</script>", EMPTY_EMOTE_INDEX);
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
	});

	it("wraps in-text @mention in a mention-tok span", () => {
		const html = renderMessageHtml("hey @john how are you", EMPTY_EMOTE_INDEX);
		expect(html).toContain('<span class="mention-tok">@john</span>');
		// Trailing text stays outside the span
		expect(html).toContain("how are you");
	});

	it("keeps trailing punctuation outside the mention span", () => {
		const html = renderMessageHtml("thanks @john!", EMPTY_EMOTE_INDEX);
		expect(html).toContain('<span class="mention-tok">@john</span>!');
	});

	it("still escapes a malicious mention word (no XSS via @)", () => {
		// Not a valid mention prefix after @, so it must be fully escaped, not span-wrapped.
		const html = renderMessageHtml("@<script>x</script>", EMPTY_EMOTE_INDEX);
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toContain('class="mention-tok"');
	});
});

describe("renderMessageHtmlSnippet", () => {
	it("returns empty string for empty content", () => {
		expect(renderMessageHtmlSnippet("", EMPTY_EMOTE_INDEX, new Set(), 50)).toBe("");
	});

	it("renders full content within budget without ellipsis", () => {
		const html = renderMessageHtmlSnippet(
			"hello [emote:1:KEKBye]",
			EMPTY_EMOTE_INDEX,
			new Set(),
			60
		);
		expect(html).toContain('alt="KEKBye"');
		expect(html).not.toMatch(/…$/);
	});

	it("truncates at token boundary and appends ellipsis", () => {
		const html = renderMessageHtmlSnippet(
			"hello [emote:1:KEKBye] world",
			EMPTY_EMOTE_INDEX,
			new Set(),
			6
		);
		expect(html).toContain("hello");
		// "hello" len=5, then space=1 -> 6 exactly, emote (16) wont fit
		expect(html).toMatch(/…$/);
		expect(html).not.toContain("<img");
	});

	it("does not split an emote token mid-way (token boundary safe)", () => {
		// "[emote:1:KEKBye]" = 16 chars. maxChars=10 -> should truncate before emote.
		const html = renderMessageHtmlSnippet(
			"[emote:1:KEKBye]rest",
			EMPTY_EMOTE_INDEX,
			new Set(),
			10
		);
		// Either full emote rendered + truncate after, OR nothing-with-ellipsis.
		// Asserting: no half-emote raw text leaks.
		expect(html).not.toContain("[emote:1:KE");
		expect(html).toMatch(/…$/);
	});

	it("uses Unicode ellipsis (…), not three dots", () => {
		const html = renderMessageHtmlSnippet(
			"abcdefghij more text after",
			EMPTY_EMOTE_INDEX,
			new Set(),
			5
		);
		expect(html.endsWith("…")).toBe(true);
		expect(html.endsWith("...")).toBe(false);
	});

	it("respects blocked emote set", () => {
		const html = renderMessageHtmlSnippet(
			"oh KEKW lol",
			indexWithKekw,
			new Set(["kekw"]),
			60
		);
		expect(html).toContain("hidden-emote");
	});
});

describe("buildEmoteMessageHtml (deprecated)", () => {
	it("still renders Kick emote tokens via tokenizer fallback", () => {
		// Even with empty 7TV list, Kick brackets fall through tokenizer.
		const html = buildEmoteMessageHtml("[emote:4147902:KEKBye]", undefined);
		expect(html).toContain('src="https://files.kick.com/emotes/4147902/fullsize"');
	});

	it("does not render channel 7TV emotes (legacy limitation)", () => {
		// Plain word emote requires full index; legacy API only has global 7TV.
		// Unknown plain word -> text.
		const html = buildEmoteMessageHtml("KEKW hi", undefined);
		expect(html).not.toContain("<img");
	});
});
