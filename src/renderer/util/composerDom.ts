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

/**
 * Sprint 58f: Emote picker'dan seçilen emote'u doğrudan DOM'a IMG olarak ekle.
 *
 * Önceki text-replace yaklaşımı (`replaceKickBracketsInDom`) sadece
 * `[emote:ID:NAME]` patternini matchliyordu. 7TV emote'larının `insertText`
 * değeri çoğu zaman sadece emote ismi (örn: "peepoFAT") — bracket olmadığı
 * için text-replace IMG'e dönüştüremiyor, emote düz yazı olarak kalıyordu.
 *
 * DOM-first yaklaşım: caret pozisyonuna direkt IMG node insert et,
 * `data-emote-text` attribute'u kanonik metni saklasın (`extractComposerText`
 * okuyor). Provider'dan bağımsız çalışır.
 */
export const insertEmoteAtCaret = (
	root: HTMLElement,
	entry: EmoteEntry
): void => {
	const img = createEmoteImg(entry, entry.insertText);
	const sel = window.getSelection();
	const hasCaretInRoot =
		sel &&
		sel.rangeCount > 0 &&
		sel.anchorNode &&
		(root === sel.anchorNode || root.contains(sel.anchorNode));

	if (hasCaretInRoot && sel) {
		const range = sel.getRangeAt(0);
		range.deleteContents();
		range.insertNode(img);
		// Caret'i IMG'in sağına yerleştir + sonrasında bir boşluk koy ki bir
		// sonraki yazılan karakter image'e yapışmasın.
		const space = document.createTextNode(" ");
		img.parentNode?.insertBefore(space, img.nextSibling);
		const after = document.createRange();
		after.setStartAfter(space);
		after.collapse(true);
		sel.removeAllRanges();
		sel.addRange(after);
	} else {
		root.appendChild(img);
		root.appendChild(document.createTextNode(" "));
		putCaretAtEnd(root);
	}
	root.focus();
};

/**
 * Sprint 58e: contentEditable'da emote IMG'leri Backspace/Delete ile silinemiyordu.
 * Chrome bazen IMG'yi atlayıp etrafindaki boş text node'u siliyor → emote DOM'da
 * kalıyor, kullanıcı silemiyor.
 *
 * Bu helper keydown event'inde caret komşusunu kontrol eder:
 *   - Backspace + caret bir composer-emote IMG'in sağındaysa → IMG'yi kaldır
 *   - Delete   + caret bir composer-emote IMG'in solundaysa → IMG'yi kaldır
 *
 * Sadece collapsed selection (tek caret, range yok) için çalışır; kullanıcı
 * birden fazla karakter seçtiyse default davranış zaten silmeyi yapar.
 *
 * @returns event handle edildiyse true (caller preventDefault düşünmeli)
 */
export const handleEmoteBackspaceDelete = (
	e: KeyboardEvent | { key: string; preventDefault: () => void }
): boolean => {
	const key = (e as { key: string }).key;
	if (key !== "Backspace" && key !== "Delete") return false;
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0) return false;
	if (!sel.isCollapsed) return false; // çoklu seçim → default silme

	const range = sel.getRangeAt(0);
	const container = range.startContainer;
	const offset = range.startOffset;

	const isEmoteImg = (n: Node | null): n is HTMLImageElement =>
		!!n &&
		n.nodeType === Node.ELEMENT_NODE &&
		(n as HTMLElement).tagName === "IMG" &&
		(n as HTMLElement).classList.contains("composer-emote");

	const removeImgAndPlaceCaret = (img: HTMLImageElement) => {
		const parent = img.parentNode;
		if (!parent) return false;
		const newRange = document.createRange();
		// Caret'i img'in olduğu yere yerleştir
		newRange.setStartBefore(img);
		newRange.collapse(true);
		parent.removeChild(img);
		sel.removeAllRanges();
		sel.addRange(newRange);
		e.preventDefault();
		return true;
	};

	if (key === "Backspace") {
		let prev: Node | null = null;
		if (container.nodeType === Node.TEXT_NODE) {
			if (offset !== 0) return false; // text içinde — normal silme
			prev = container.previousSibling;
		} else {
			// Element node — child arasında, offset'in solundaki child
			if (offset <= 0) return false;
			prev = (container as Element).childNodes[offset - 1] || null;
		}
		if (isEmoteImg(prev)) {
			return removeImgAndPlaceCaret(prev);
		}
	} else {
		// Delete
		let next: Node | null = null;
		if (container.nodeType === Node.TEXT_NODE) {
			const len = container.textContent?.length || 0;
			if (offset < len) return false; // text içinde — normal silme
			next = container.nextSibling;
		} else {
			next = (container as Element).childNodes[offset] || null;
		}
		if (isEmoteImg(next)) {
			return removeImgAndPlaceCaret(next);
		}
	}
	return false;
};
