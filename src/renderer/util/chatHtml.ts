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
	const parts: string[] = [];
	let lastEmoteIdx = -1;
	for (const token of tokens) {
		if (token.kind === "space") {
			parts.push(escapeHtml(token.value));
			continue;
		}
		if (token.kind === "text") {
			parts.push(escapeHtml(token.value));
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
 * Eski API - sadece sevenTvEmoteList[] alir, geri uyumluluk icin korunur.
 * Yeni cagrilar `renderMessageHtml(content, index, blocked)` kullansin.
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
