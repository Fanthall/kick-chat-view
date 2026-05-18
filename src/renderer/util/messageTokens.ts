import { EmoteEntry } from "../constants/emote";
import { EmoteIndex } from "./emoteIndex";

export type MessageToken =
	| { kind: "text"; value: string }
	| { kind: "space"; value: string }
	| { kind: "emote"; emote: EmoteEntry; raw: string };

const KICK_EMOTE_REGEX = /\[emote:(\d+):([^\]]+)\]/g;

const matchKickEmote = (
	word: string
): { id: string; name: string } | undefined => {
	const m = /^\[emote:(\d+):([^\]]+)\]$/.exec(word);
	if (!m) return undefined;
	return { id: m[1], name: m[2] };
};

const splitPreservingSpaces = (content: string): string[] => {
	// Mesaji whitespace + non-whitespace dilimleri olarak ayir ve aralari koru.
	const tokens = content.match(/\s+|\S+/g);
	return tokens || [];
};

/**
 * Mesaj icerigini text/space/emote token'larina ayirir.
 *
 *   - `[emote:ID:NAME]`  -> Kick emote token. Index'te (kick global/channel/sub)
 *                          eslesirse onunla, yoksa minimal Kick entry uretir.
 *   - Diger kelimeler    -> Eger index.byName icinde varsa (case-sensitive),
 *                          7TV/Kick/Sub emote token; aksi halde plain text.
 */
export const tokenizeMessage = (
	content: string,
	index: EmoteIndex
): MessageToken[] => {
	const tokens: MessageToken[] = [];
	const words = splitPreservingSpaces(content);
	for (const word of words) {
		if (!word) continue;
		if (/^\s+$/.test(word)) {
			tokens.push({ kind: "space", value: word });
			continue;
		}
		const kickMatch = matchKickEmote(word);
		if (kickMatch) {
			// Kick [emote:ID:NAME] formatinda case-insensitive eslesme
			// kabul edilebilir cunku ID zaten kanonik. Once exact, sonra lower.
			const entry =
				index.byName.get(kickMatch.name) ||
				index.byNameInsensitive.get(kickMatch.name.toLowerCase()) ||
				({
					id: kickMatch.id,
					name: kickMatch.name,
					provider: "kick-channel",
					scope: "channel",
					animated: false,
					zeroWidth: false,
					urls: {
						"1x": `https://files.kick.com/emotes/${kickMatch.id}/fullsize`,
					},
					insertText: word,
				} as EmoteEntry);
			tokens.push({ kind: "emote", emote: entry, raw: word });
			continue;
		}
		// Sade kelime: case-sensitive tam eslesme zorunlu (Kappa != kappa)
		const emote = index.byName.get(word);
		if (emote) {
			tokens.push({ kind: "emote", emote, raw: word });
			continue;
		}
		tokens.push({ kind: "text", value: word });
	}
	return tokens;
};

export const replaceKickEmotePlaceholders = (
	content: string,
	replacer: (id: string, name: string) => string
): string => {
	return content.replace(KICK_EMOTE_REGEX, (_match, id: string, name: string) =>
		replacer(id, name)
	);
};
