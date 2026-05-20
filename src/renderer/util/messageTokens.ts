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
const buildKickFallback = (id: string, name: string, raw: string): EmoteEntry =>
	({
		id,
		name,
		provider: "kick-channel",
		scope: "channel",
		animated: false,
		zeroWidth: false,
		urls: {
			"1x": `https://files.kick.com/emotes/${id}/fullsize`,
		},
		insertText: raw,
	} as EmoteEntry);

const resolveKickEntry = (
	id: string,
	name: string,
	raw: string,
	index: EmoteIndex
): EmoteEntry =>
	index.byName.get(name) ||
	index.byNameInsensitive.get(name.toLowerCase()) ||
	buildKickFallback(id, name, raw);

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
		// Tek kelimenin icinde 1+ Kick bracket olabilir (boslukla ayrilmamis):
		//   "[emote:1:A][emote:2:B]"  veya  "before[emote:1:A]after"
		// Tum bracket'lari sira ile sok ve aralardaki metni text token olarak ekle.
		const re = /\[emote:(\d+):([^\]]+)\]/g;
		let m: RegExpExecArray | null;
		let lastIdx = 0;
		let foundAny = false;
		while ((m = re.exec(word)) !== null) {
			foundAny = true;
			if (m.index > lastIdx) {
				const before = word.slice(lastIdx, m.index);
				// Aradaki parca da plain emote ismi olabilir (case-sensitive)
				const between = index.byName.get(before);
				if (between) {
					tokens.push({ kind: "emote", emote: between, raw: before });
				} else {
					tokens.push({ kind: "text", value: before });
				}
			}
			const id = m[1];
			const name = m[2];
			const raw = m[0];
			tokens.push({ kind: "emote", emote: resolveKickEntry(id, name, raw, index), raw });
			lastIdx = m.index + raw.length;
		}
		if (foundAny) {
			if (lastIdx < word.length) {
				const tail = word.slice(lastIdx);
				const tailEmote = index.byName.get(tail);
				if (tailEmote) {
					tokens.push({ kind: "emote", emote: tailEmote, raw: tail });
				} else {
					tokens.push({ kind: "text", value: tail });
				}
			}
			continue;
		}
		// Kelimede hic bracket yok: case-sensitive tam eslesme (Kappa != kappa)
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
