import { EmoteEntry } from "../constants/emote";
import { SubscriberBadge } from "../constants/kick";
import { Emote } from "../constants/seventv";
import founder from "../kickBadges/founder.png";
import moderator from "../kickBadges/channelMod.png";
import og from "../kickBadges/og.png";
import verified from "../kickBadges/verified.png";
import vip from "../kickBadges/vip.png";
import {
	buildEmoteIndex,
	EMPTY_EMOTE_INDEX,
	EmoteIndex,
	normalizeSevenTvSet,
} from "./emoteIndex";
import { escapeHtml, safeUrl } from "./htmlSafe";
import { tokenizeMessage } from "./messageTokens";

export interface ChatBadge {
	type: string;
	text: string;
	count?: number;
}

const renderTrustedBadge = (src: string, label: string): string => {
	const safeLabel = escapeHtml(label);
	const safeSrc = escapeHtml(src);
	return `<img class="chat-badge" width="20px" height="20px" src="${safeSrc}" alt="${safeLabel}" title="${safeLabel}" />`;
};

const renderRemoteBadge = (src: string, label: string): string => {
	const safeSrc = safeUrl(src);
	if (!safeSrc) return "";
	const safeLabel = escapeHtml(label);
	return `<img class="chat-badge" width="20px" height="20px" src="${safeSrc}" alt="${safeLabel}" title="${safeLabel}" />`;
};

export const buildBadgesHtml = (
	badges: ChatBadge[] | undefined,
	channelBadges: SubscriberBadge[]
): string => {
	if (!badges?.length) return "";
	return badges
		.map((badge) => {
			switch (badge.type.toLowerCase()) {
				case "founder":
					return renderTrustedBadge(founder, "founder");
				case "subscriber": {
					const userBadge = channelBadges.find(
						(channelBadge) =>
							badge.count !== undefined && badge.count >= channelBadge.months
					);
					return renderRemoteBadge(
						userBadge?.badge_image.src ?? "",
						`sub-${badge.count ?? ""}`
					);
				}
				case "og":
					return renderTrustedBadge(og, "og");
				case "vip":
					return renderTrustedBadge(vip, "vip");
				case "verified":
					return renderTrustedBadge(verified, "verified");
				case "moderator":
					return renderTrustedBadge(moderator, "moderator");
				default:
					return "";
			}
		})
		.join("");
};

const emoteImgHtml = (entry: EmoteEntry, options: { blocked: boolean }) => {
	const url = safeUrl(entry.urls["2x"] || entry.urls["1x"]);
	if (!url) return escapeHtml(entry.name);
	const srcset = [
		entry.urls["1x"] ? `${safeUrl(entry.urls["1x"])} 1x` : undefined,
		entry.urls["2x"] ? `${safeUrl(entry.urls["2x"])} 2x` : undefined,
		entry.urls["3x"] ? `${safeUrl(entry.urls["3x"])} 3x` : undefined,
	]
		.filter(Boolean)
		.join(", ");
	const safeName = escapeHtml(entry.name);
	const classes = [
		"chat-emote",
		`chat-emote--${entry.provider}`,
		entry.animated ? "chat-emote--animated" : "",
		entry.zeroWidth ? "chat-emote--zero-width" : "",
		options.blocked ? "hidden-emote" : "",
	]
		.filter(Boolean)
		.join(" ");
	const dataAttrs = `data-emote-name="${safeName}" data-emote-provider="${escapeHtml(entry.provider)}"`;
	const srcsetAttr = srcset ? ` srcset="${srcset}"` : "";
	return `<img class="${classes}" src="${url}"${srcsetAttr} alt="${safeName}" title="${safeName}" ${dataAttrs} loading="lazy" />`;
};

/**
 * Token akisini HTML string'e cevirir (renderMessageHtml ve snippet variant
 * arasinda paylasilan ic helper).
 */
// Faz 8: metin-ici @mention token'ini renklendir (prototip `.mention-tok`).
// Guvenlik: kullanici verisi ONCE escape edilir, sonra statik class'li span'a
// sarilir. Attribute'a hicbir dinamik veri girmez → CONSTRAINT-4 korunur.
// Sadece basi `@` + [A-Za-z0-9_] olan on-eki sarar; sondaki noktalama disarida
// kalir (orn. "@john," → span sadece "@john").
const MENTION_TOKEN_REGEX = /^(@[A-Za-z0-9_]+)([\s\S]*)$/;

const renderTextTokenHtml = (value: string): string => {
	const m = MENTION_TOKEN_REGEX.exec(value);
	if (!m) return escapeHtml(value);
	const mention = escapeHtml(m[1]);
	const rest = m[2] ? escapeHtml(m[2]) : "";
	return `<span class="mention-tok">${mention}</span>${rest}`;
};

const renderTokensToHtml = (
	tokens: import("./messageTokens").MessageToken[],
	blockedLower: Set<string>
): string => {
	const parts: string[] = [];
	let lastEmoteIdx = -1;
	for (const token of tokens) {
		if (token.kind === "space") {
			parts.push(escapeHtml(token.value));
			continue;
		}
		if (token.kind === "text") {
			parts.push(renderTextTokenHtml(token.value));
			continue;
		}
		const blocked = blockedLower.has(token.emote.name.toLowerCase());
		if (token.emote.zeroWidth && lastEmoteIdx >= 0) {
			// Onceki emote'a overlay olarak iliştir
			const previous = parts[lastEmoteIdx];
			const overlay = emoteImgHtml(token.emote, { blocked });
			parts[lastEmoteIdx] = `<span class="chat-emote-stack">${previous}<span class="chat-emote-overlay">${overlay}</span></span>`;
			continue;
		}
		const html = emoteImgHtml(token.emote, { blocked });
		parts.push(html);
		lastEmoteIdx = parts.length - 1;
	}
	return parts.join("");
};

/**
 * Yeni token-tabanli mesaj HTML uretici.
 * Zero-width emote'lar bir onceki emote'un uzerine overlay edilir.
 */
export const renderMessageHtml = (
	content: string,
	index: EmoteIndex,
	blockedSet: Set<string> = new Set()
): string => {
	const tokens = tokenizeMessage(content || "", index);
	const blockedLower = new Set(
		Array.from(blockedSet, (value) => value.toLowerCase())
	);
	return renderTokensToHtml(tokens, blockedLower);
};

/**
 * Snippet variant: icerik tokenize edilir, sonra **token boundary**'sinde
 * `maxChars` karaktere kadar kesilir. Half-emote olusturmaz.
 *
 * Char count'unda emote token'lari kendi `raw` uzunluklarini ekler
 * (orn. `[emote:1:KEKW]` = 14 char), boylece text ve emote agirligi tutarli.
 * Truncate olursa sonuna `…` (Unicode horizontal ellipsis) ekler.
 *
 * Kullanim: reply preview, user history excerpt, vb. kucuk snippet'lar.
 */
export const renderMessageHtmlSnippet = (
	content: string,
	index: EmoteIndex,
	blockedSet: Set<string> = new Set(),
	maxChars: number = 60
): string => {
	if (!content) return "";
	const tokens = tokenizeMessage(content, index);
	const blockedLower = new Set(
		Array.from(blockedSet, (value) => value.toLowerCase())
	);
	const accepted: import("./messageTokens").MessageToken[] = [];
	let chars = 0;
	let truncated = false;
	for (const t of tokens) {
		const tokenLen =
			t.kind === "emote" ? t.raw.length : t.value.length;
		if (chars + tokenLen > maxChars) {
			truncated = true;
			break;
		}
		accepted.push(t);
		chars += tokenLen;
	}
	const body = renderTokensToHtml(accepted, blockedLower);
	return truncated ? body + "…" : body;
};

/**
 * @deprecated Sadece geriye uyumluluk icin korunuyor. Bu API yalnizca
 * 7TV global emote listesini index'e ekler — channel-specific 7TV, BTTV,
 * FFZ ve Kick sub/channel emote'lari **render edilmez**. (Kick `[emote:ID:NAME]`
 * token'lari `messageTokens` icindeki Kick fallback sayesinde calisir.)
 *
 * Yeni cagrilar `renderMessageHtml(content, emoteIndex, blockedSet)` veya
 * snippet ihtiyaci icin `renderMessageHtmlSnippet(...)` kullansin.
 * EmoteIndex'i Redux'tan veya `buildEmoteIndex(channelSets, globalSets, channelSlug)`
 * ile uretin.
 */
export const buildEmoteMessageHtml = (
	content: string,
	sevenTvEmoteList: Emote[] | undefined,
	_sevenTvUrlPrefix: "https:" | "" = "https:"
): string => {
	const set = sevenTvEmoteList?.length
		? [
				normalizeSevenTvSet(
					{
						id: "legacy",
						name: "legacy",
						flags: 0,
						tags: [],
						immutable: true,
						privileged: false,
						emotes: sevenTvEmoteList,
						emote_count: sevenTvEmoteList.length,
						capacity: sevenTvEmoteList.length,
						owner: undefined as any,
					},
					{ provider: "seventv-global", scope: "global" }
				),
		  ]
		: [];
	const index = sevenTvEmoteList?.length
		? buildEmoteIndex([], set)
		: EMPTY_EMOTE_INDEX;
	return renderMessageHtml(content, index);
};
