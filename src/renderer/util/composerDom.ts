import { EmoteEntry } from "../constants/emote";
import { EmoteIndex } from "./emoteIndex";

/**
 * Composer contentEditable DOM'undan kanonik metni cikarir.
 * `data-emote-text` tasiyan <img> elemanlari icin attribute degeri kullanilir,
 * boylece Kick emote'lari `[emote:ID:NAME]`, diger emote'lar isim olarak donen.
 */
export const extractComposerText = (root: HTMLElement): string => {
	const parts: string[] = [];
	const visit = (node: Node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			parts.push(node.textContent || "");
			return;
		}
		if (node instanceof HTMLElement) {
			const emoteText = node.getAttribute("data-emote-text");
			if (emoteText !== null) {
				parts.push(emoteText);
				return;
			}
			if (node.tagName === "BR") {
				parts.push("\n");
				return;
			}
			for (const child of Array.from(node.childNodes)) {
				visit(child);
			}
		}
	};
	for (const child of Array.from(root.childNodes)) {
		visit(child);
	}
	return parts.join("");
};

/**
 * Composer'da gosterilecek emote IMG elemanini olusturur.
 * `data-emote-text` attribute'i `extractComposerText` tarafindan
 * mesaj gonderilirken kanonik metne donusturulur.
 */
export const createEmoteImg = (
	entry: EmoteEntry,
	rawText: string
): HTMLImageElement => {
	const img = document.createElement("img");
	img.src = entry.urls["1x"] || "";
	img.alt = entry.name;
	img.title = entry.name;
	img.className = "composer-emote";
	img.dataset.emoteText = rawText;
	img.dataset.emoteName = entry.name;
	img.setAttribute("contenteditable", "false");
	img.setAttribute("draggable", "false");
	return img;
};

const KICK_BRACKET_REGEX = /\[emote:(\d+):([^\]\s]+)\]/g;

/**
 * Composer DOM'undaki `[emote:ID:NAME]` text desenlerini IMG elemanlarina
 * cevirir. Caret pozisyonu kayipsiz koruyamadigi icin caller, replacement
 * sonrasi caret'i son anlamli pozisyona koymali.
 *
 * @returns degisiklik yapildiysa true
 */
export const replaceKickBracketsInDom = (
	root: HTMLElement,
	index: EmoteIndex
): boolean => {
	let modified = false;
	const textNodes: Text[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
	let current: Node | null;
	// eslint-disable-next-line no-cond-assign
	while ((current = walker.nextNode())) {
		const text = current.textContent || "";
		KICK_BRACKET_REGEX.lastIndex = 0;
		if (KICK_BRACKET_REGEX.test(text)) {
			textNodes.push(current as Text);
		}
	}
	for (const textNode of textNodes) {
		const text = textNode.textContent || "";
		const matches: Array<{
			start: number;
			end: number;
			id: string;
			name: string;
			raw: string;
		}> = [];
		KICK_BRACKET_REGEX.lastIndex = 0;
		let m: RegExpExecArray | null;
		// eslint-disable-next-line no-cond-assign
		while ((m = KICK_BRACKET_REGEX.exec(text))) {
			matches.push({
				start: m.index,
				end: m.index + m[0].length,
				id: m[1],
				name: m[2],
				raw: m[0],
			});
		}
		if (!matches.length) continue;
		const parent = textNode.parentNode;
		if (!parent) continue;
		let cursor = 0;
		const fragments: Node[] = [];
		for (const match of matches) {
			if (match.start > cursor) {
				fragments.push(
					document.createTextNode(text.slice(cursor, match.start))
				);
			}
			const entry: EmoteEntry =
				index.byName.get(match.name) ||
				index.byNameInsensitive.get(match.name.toLowerCase()) ||
				({
					id: match.id,
					name: match.name,
					provider: "kick-channel",
					scope: "channel",
					animated: false,
					zeroWidth: false,
					urls: {
						"1x": `https://files.kick.com/emotes/${match.id}/fullsize`,
					},
					insertText: match.raw,
				} as EmoteEntry);
			fragments.push(createEmoteImg(entry, match.raw));
			cursor = match.end;
		}
		if (cursor < text.length) {
			fragments.push(document.createTextNode(text.slice(cursor)));
		}
		for (const node of fragments) {
			parent.insertBefore(node, textNode);
		}
		parent.removeChild(textNode);
		modified = true;
	}
	return modified;
};

export const putCaretAtEnd = (root: HTMLElement): void => {
	const selection = window.getSelection();
	if (!selection) return;
	const range = document.createRange();
	range.selectNodeContents(root);
	range.collapse(false);
	selection.removeAllRanges();
	selection.addRange(range);
};
