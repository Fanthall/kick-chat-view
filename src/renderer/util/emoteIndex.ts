import { BttvEmote, BttvUserResponse } from "../constants/bttv";
import {
	EmoteEntry,
	EmoteProvider,
	EmoteScope,
	EmoteSet,
	EmoteUrls,
	PROVIDER_LABEL,
} from "../constants/emote";
import { FfzSet } from "../constants/ffz";
import { KickApiEmote, KickEmoteGroup } from "../constants/kickEmotes";
import { ChannelEmotes, Emote as SevenTvEmote, EmoteFile } from "../constants/seventv";
import { SevenTvKickUserResponse } from "../services/sevenTv";

/* ---------- 7TV file picker ---------- */

const SEVENTV_ANIMATED_FORMAT_ORDER = ["webp", "avif", "gif", "png"];
const SEVENTV_STATIC_FORMAT_ORDER = ["webp", "avif", "png", "gif"];
const SEVENTV_SIZE_ORDER: Array<"1x" | "2x" | "3x" | "4x"> = [
	"1x",
	"2x",
	"3x",
	"4x",
];

const isSevenTvAnimated = (emote: SevenTvEmote): boolean => {
	if (emote.data?.animated) return true;
	return (emote.data?.host?.files || []).some((file) => (file.frame_count || 0) > 1);
};

const isSevenTvZeroWidth = (emote: SevenTvEmote): boolean => {
	const activeFlag = emote.flags ?? 0;
	const dataFlag = emote.data?.flags ?? 0;
	return (activeFlag & 1) === 1 || (dataFlag & 256) === 256;
};

const pickSevenTvFileForSize = (
	files: EmoteFile[],
	size: "1x" | "2x" | "3x" | "4x",
	animated: boolean
): EmoteFile | undefined => {
	const formatOrder = animated
		? SEVENTV_ANIMATED_FORMAT_ORDER
		: SEVENTV_STATIC_FORMAT_ORDER;
	for (const fmt of formatOrder) {
		const expected = `${size}.${fmt}`.toLowerCase();
		const found = files.find((f) => f.name?.toLowerCase() === expected);
		if (found) return found;
	}
	return undefined;
};

const buildSevenTvUrls = (emote: SevenTvEmote): EmoteUrls | undefined => {
	const hostUrl = emote.data?.host?.url;
	const files = emote.data?.host?.files || [];
	if (!hostUrl || !files.length) return undefined;
	const animated = isSevenTvAnimated(emote);
	const fallback =
		pickSevenTvFileForSize(files, "1x", animated) ||
		files.find((f) => /^(1x|2x|3x|4x)\.(webp|avif|gif|png)$/i.test(f.name)) ||
		files[0];
	if (!fallback) return undefined;
	const prefix = hostUrl.startsWith("//") ? `https:${hostUrl}` : hostUrl;
	const urls: EmoteUrls = { "1x": `${prefix}/${fallback.name}` };
	for (const size of SEVENTV_SIZE_ORDER) {
		const file = pickSevenTvFileForSize(files, size, animated);
		if (file) {
			urls[size] = `${prefix}/${file.name}`;
		}
	}
	return urls;
};

export const normalizeSevenTvEmote = (
	emote: SevenTvEmote,
	options: {
		provider: EmoteProvider;
		scope: EmoteScope;
		channelSlug?: string;
		ownerName?: string;
	}
): EmoteEntry | undefined => {
	const urls = buildSevenTvUrls(emote);
	if (!urls) return undefined;
	const animated = isSevenTvAnimated(emote);
	const zeroWidth = isSevenTvZeroWidth(emote);
	const firstFile = emote.data?.host?.files?.[0];
	return {
		id: emote.id,
		name: emote.name,
		provider: options.provider,
		scope: options.scope,
		channelSlug: options.channelSlug,
		animated,
		zeroWidth,
		width: firstFile?.width,
		height: firstFile?.height,
		urls,
		ownerName:
			options.ownerName ||
			emote.data?.owner?.display_name ||
			emote.data?.owner?.username,
		insertText: emote.name,
	};
};

export const normalizeSevenTvSet = (
	set: ChannelEmotes,
	options: {
		provider: EmoteProvider;
		scope: EmoteScope;
		channelSlug?: string;
		nameOverride?: string;
		ownerNameOverride?: string;
	}
): EmoteSet => {
	const emotes = (set.emotes || [])
		.map((emote) =>
			normalizeSevenTvEmote(emote, {
				provider: options.provider,
				scope: options.scope,
				channelSlug: options.channelSlug,
				ownerName: options.ownerNameOverride || set.owner?.display_name,
			})
		)
		.filter((entry): entry is EmoteEntry => !!entry);
	return {
		id: set.id,
		provider: options.provider,
		scope: options.scope,
		channelSlug: options.channelSlug,
		name:
			options.nameOverride ||
			set.name ||
			(options.scope === "global" ? "7TV Global" : "7TV"),
		ownerName: options.ownerNameOverride || set.owner?.display_name,
		emotes,
	};
};

export const extractSevenTvSetsFromKickUser = (
	response: SevenTvKickUserResponse,
	channelSlug: string
): EmoteSet[] => {
	const sets: EmoteSet[] = [];
	const directSet = response.emote_set || response.user?.emote_sets?.[0];
	if (directSet && directSet.emotes?.length) {
		sets.push(
			normalizeSevenTvSet(directSet, {
				provider: "seventv-channel",
				scope: "channel",
				channelSlug,
				nameOverride: `${response.user?.display_name || response.username || channelSlug} 7TV`,
				ownerNameOverride:
					response.user?.display_name ||
					response.display_name ||
					response.username,
			})
		);
	}

	const kickConnection = response.user?.connections?.find(
		(connection) => connection?.platform?.toUpperCase() === "KICK"
	);
	if (
		kickConnection?.emote_set &&
		kickConnection.emote_set.emotes?.length &&
		!sets.some((existing) => existing.id === kickConnection.emote_set?.id)
	) {
		sets.push(
			normalizeSevenTvSet(kickConnection.emote_set, {
				provider: "seventv-channel",
				scope: "channel",
				channelSlug,
				nameOverride: `${
					kickConnection.display_name || kickConnection.username || channelSlug
				} 7TV`,
				ownerNameOverride:
					kickConnection.display_name ||
					kickConnection.username ||
					response.user?.display_name,
			})
		);
	}

	return sets;
};

/* ---------- Kick normalize ---------- */

const kickEmoteUrl = (id: number | string, size: "small" | "fullsize" = "fullsize") =>
	`https://files.kick.com/emotes/${id}/${size}`;

export const normalizeKickEmote = (
	emote: KickApiEmote,
	options: {
		provider: EmoteProvider;
		scope: EmoteScope;
		channelSlug?: string;
		ownerName?: string;
	}
): EmoteEntry => {
	const insertText = `[emote:${emote.id}:${emote.name}]`;
	return {
		id: String(emote.id),
		name: emote.name,
		provider: options.provider,
		scope: options.scope,
		channelSlug: options.channelSlug,
		animated: false,
		zeroWidth: false,
		urls: {
			"1x": kickEmoteUrl(emote.id, "fullsize"),
			"2x": kickEmoteUrl(emote.id, "fullsize"),
		},
		ownerName: options.ownerName,
		insertText,
		subscribersOnly: !!emote.subscribers_only,
	};
};

const classifyKickGroup = (
	group: KickEmoteGroup
): { provider: EmoteProvider; scope: EmoteScope; setName: string } => {
	const rawName = (group.name || "").toLowerCase();
	if (rawName === "global" || rawName === "kick") {
		return { provider: "kick-global", scope: "global", setName: "Kick Global" };
	}
	if (rawName === "emojis" || rawName === "emoji") {
		return { provider: "kick-global", scope: "global", setName: "Emoji" };
	}
	return {
		provider: "kick-channel",
		scope: "channel",
		setName: group.name || "Channel",
	};
};

export const normalizeKickGroups = (
	groups: KickEmoteGroup[],
	channelSlug: string
): EmoteSet[] => {
	if (!Array.isArray(groups)) return [];
	const sets: EmoteSet[] = [];
	for (const group of groups) {
		const { provider, scope, setName } = classifyKickGroup(group);
		const isChannel = scope === "channel";
		const subscriberEntries: EmoteEntry[] = [];
		const channelEntries: EmoteEntry[] = [];
		const globalEntries: EmoteEntry[] = [];
		for (const apiEmote of group.emotes || []) {
			if (isChannel && apiEmote.subscribers_only) {
				subscriberEntries.push(
					normalizeKickEmote(apiEmote, {
						provider: "kick-subscriber",
						scope: "subscriber",
						channelSlug,
						ownerName: group.channel?.user?.username || group.name,
					})
				);
			} else if (isChannel) {
				channelEntries.push(
					normalizeKickEmote(apiEmote, {
						provider: "kick-channel",
						scope: "channel",
						channelSlug,
						ownerName: group.channel?.user?.username || group.name,
					})
				);
			} else {
				globalEntries.push(
					normalizeKickEmote(apiEmote, {
						provider,
						scope,
					})
				);
			}
		}
		if (globalEntries.length) {
			sets.push({
				id: group.id ? String(group.id) : undefined,
				provider: "kick-global",
				scope: "global",
				name: setName,
				emotes: globalEntries,
			});
		}
		if (channelEntries.length) {
			sets.push({
				id: group.id ? String(group.id) : undefined,
				provider: "kick-channel",
				scope: "channel",
				channelSlug,
				name: setName || "Kick Channel",
				ownerName: group.channel?.user?.username,
				emotes: channelEntries,
			});
		}
		if (subscriberEntries.length) {
			sets.push({
				id: group.id ? String(group.id) : undefined,
				provider: "kick-subscriber",
				scope: "subscriber",
				channelSlug,
				name: `${setName || "Channel"} Subscriber`,
				ownerName: group.channel?.user?.username,
				emotes: subscriberEntries,
			});
		}
	}
	return sets;
};

/* ---------- BTTV normalize ---------- */

const bttvUrl = (id: string, size: "1x" | "2x" | "3x") =>
	`https://cdn.betterttv.net/emote/${id}/${size}`;

export const normalizeBttvEmote = (
	emote: BttvEmote,
	options: {
		provider: EmoteProvider;
		scope: EmoteScope;
		channelSlug?: string;
		ownerName?: string;
	}
): EmoteEntry => {
	const animated =
		!!emote.animated ||
		emote.imageType === "gif" ||
		emote.imageType === "webp" ||
		emote.imageType === "avif";
	return {
		id: emote.id,
		name: emote.code,
		provider: options.provider,
		scope: options.scope,
		channelSlug: options.channelSlug,
		animated,
		zeroWidth: false,
		urls: {
			"1x": bttvUrl(emote.id, "1x"),
			"2x": bttvUrl(emote.id, "2x"),
			"3x": bttvUrl(emote.id, "3x"),
		},
		ownerName:
			options.ownerName ||
			emote.user?.displayName ||
			emote.user?.name,
		insertText: emote.code,
	};
};

export const normalizeBttvGlobal = (emotes: BttvEmote[]): EmoteSet => ({
	provider: "bttv-global",
	scope: "global",
	name: "BTTV Global",
	emotes: (emotes || []).map((emote) =>
		normalizeBttvEmote(emote, {
			provider: "bttv-global",
			scope: "global",
		})
	),
});

export const normalizeBttvUser = (
	response: BttvUserResponse | undefined,
	channelSlug: string
): EmoteSet[] => {
	if (!response) return [];
	const sets: EmoteSet[] = [];
	if (response.channelEmotes?.length) {
		sets.push({
			provider: "bttv-channel",
			scope: "channel",
			channelSlug,
			name: "BTTV Channel",
			emotes: response.channelEmotes.map((emote) =>
				normalizeBttvEmote(emote, {
					provider: "bttv-channel",
					scope: "channel",
					channelSlug,
				})
			),
		});
	}
	if (response.sharedEmotes?.length) {
		sets.push({
			provider: "bttv-shared",
			scope: "channel",
			channelSlug,
			name: "BTTV Shared",
			emotes: response.sharedEmotes.map((emote) =>
				normalizeBttvEmote(emote, {
					provider: "bttv-shared",
					scope: "channel",
					channelSlug,
					ownerName: emote.user?.displayName || emote.user?.name,
				})
			),
		});
	}
	return sets;
};

/* ---------- FFZ normalize ---------- */

const ffzUrl = (rawUrl?: string): string | undefined => {
	if (!rawUrl) return undefined;
	if (rawUrl.startsWith("//")) return `https:${rawUrl}`;
	return rawUrl;
};

export const normalizeFfzSet = (
	set: FfzSet,
	options: {
		provider: EmoteProvider;
		scope: EmoteScope;
		channelSlug?: string;
	}
): EmoteSet => ({
	id: String(set.id),
	provider: options.provider,
	scope: options.scope,
	channelSlug: options.channelSlug,
	name: set.title || (options.scope === "global" ? "FFZ Global" : "FFZ Channel"),
	emotes: (set.emoticons || []).map((emote) => {
		const url1 = ffzUrl(emote.urls?.["1"]);
		const url2 = ffzUrl(emote.urls?.["2"]);
		const url4 = ffzUrl(emote.urls?.["4"]);
		const animatedUrls = emote.animated || undefined;
		const animated = !!animatedUrls;
		return {
			id: String(emote.id),
			name: emote.name,
			provider: options.provider,
			scope: options.scope,
			channelSlug: options.channelSlug,
			animated,
			zeroWidth: false,
			width: emote.width,
			height: emote.height,
			urls: {
				"1x": ffzUrl(animatedUrls?.["1"]) || url1 || "",
				"2x": ffzUrl(animatedUrls?.["2"]) || url2,
				"4x": ffzUrl(animatedUrls?.["4"]) || url4,
			},
			ownerName: emote.owner?.display_name || emote.owner?.name,
			insertText: emote.name,
		};
	}),
});

/* ---------- Index + search ---------- */

// Kick her zaman digerlerini ezer: ayni isimde catisma olursa Kick kazanir.
const PROVIDER_PRECEDENCE: EmoteProvider[] = [
	"kick-channel",
	"kick-subscriber",
	"kick-global",
	"seventv-channel",
	"seventv-personal",
	"bttv-channel",
	"bttv-shared",
	"ffz-channel",
	"seventv-global",
	"bttv-global",
	"ffz-global",
];

const providerRank = (provider: EmoteProvider) => {
	const idx = PROVIDER_PRECEDENCE.indexOf(provider);
	return idx === -1 ? PROVIDER_PRECEDENCE.length : idx;
};

export interface EmoteIndex {
	channelSlug?: string;
	channelSets: EmoteSet[];
	globalSets: EmoteSet[];
	allSets: EmoteSet[];
	byName: Map<string, EmoteEntry>;
	byNameInsensitive: Map<string, EmoteEntry>;
	all: EmoteEntry[];
}

export const buildEmoteIndex = (
	channelSets: EmoteSet[],
	globalSets: EmoteSet[],
	channelSlug?: string
): EmoteIndex => {
	const allSets = [...channelSets, ...globalSets];
	const byName = new Map<string, EmoteEntry>();
	const byNameInsensitive = new Map<string, EmoteEntry>();
	const all: EmoteEntry[] = [];
	for (const set of allSets) {
		for (const entry of set.emotes) {
			all.push(entry);
			const existing = byName.get(entry.name);
			if (!existing || providerRank(entry.provider) < providerRank(existing.provider)) {
				byName.set(entry.name, entry);
			}
			const lower = entry.name.toLowerCase();
			const existingLower = byNameInsensitive.get(lower);
			if (
				!existingLower ||
				providerRank(entry.provider) < providerRank(existingLower.provider)
			) {
				byNameInsensitive.set(lower, entry);
			}
		}
	}
	return { channelSlug, channelSets, globalSets, allSets, byName, byNameInsensitive, all };
};

export const EMPTY_EMOTE_INDEX: EmoteIndex = {
	channelSets: [],
	globalSets: [],
	allSets: [],
	byName: new Map(),
	byNameInsensitive: new Map(),
	all: [],
};

const stripColon = (value: string) => value.replace(/^:+|:+$/g, "");

export interface EmoteSearchResult extends EmoteEntry {
	score: number;
}

const scoreMatch = (entry: EmoteEntry, queryLower: string): number => {
	const nameLower = entry.name.toLowerCase();
	if (nameLower === queryLower) return 1000;
	if (nameLower.startsWith(queryLower)) return 500 - (nameLower.length - queryLower.length);
	const idx = nameLower.indexOf(queryLower);
	if (idx === -1) return -1;
	return 200 - idx - (nameLower.length - queryLower.length);
};

export const searchEmotes = (
	index: EmoteIndex,
	rawQuery: string,
	limit = 8
): EmoteSearchResult[] => {
	const query = stripColon(rawQuery.trim());
	if (!query) return [];
	const queryLower = query.toLowerCase();
	const results: EmoteSearchResult[] = [];
	const seen = new Set<string>();
	for (const entry of index.all) {
		const key = `${entry.provider}:${entry.id}:${entry.name}`;
		if (seen.has(key)) continue;
		const score = scoreMatch(entry, queryLower);
		if (score < 0) continue;
		seen.add(key);
		results.push({ ...entry, score: score - providerRank(entry.provider) });
	}
	results.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return a.name.localeCompare(b.name);
	});
	return results.slice(0, limit);
};

export const providerLabel = (provider: EmoteProvider) => PROVIDER_LABEL[provider];
