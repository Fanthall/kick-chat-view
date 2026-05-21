/**
 * Sprint 58e — composerDom helpers, özellikle handleEmoteBackspaceDelete.
 */

import {
	handleEmoteBackspaceDelete,
	extractComposerText,
} from "../renderer/util/composerDom";

const setupContainer = () => {
	const root = document.createElement("div");
	root.contentEditable = "true";
	document.body.appendChild(root);
	return root;
};

const addText = (root: HTMLElement, text: string): Text => {
	const node = document.createTextNode(text);
	root.appendChild(node);
	return node;
};

const addEmoteImg = (root: HTMLElement, name: string, raw: string): HTMLImageElement => {
	const img = document.createElement("img");
	img.className = "composer-emote";
	img.alt = name;
	img.dataset.emoteText = raw;
	img.dataset.emoteName = name;
	img.setAttribute("contenteditable", "false");
	root.appendChild(img);
	return img;
};

const placeCaretAt = (node: Node, offset: number) => {
	const sel = window.getSelection()!;
	const range = document.createRange();
	range.setStart(node, offset);
	range.collapse(true);
	sel.removeAllRanges();
	sel.addRange(range);
};

const fakeEvent = (key: "Backspace" | "Delete" | string) => {
	let prevented = false;
	return {
		key,
		preventDefault: () => {
			prevented = true;
		},
		get prevented() {
			return prevented;
		},
	};
};

describe("handleEmoteBackspaceDelete (Sprint 58e)", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	test("Backspace: caret bir IMG'in sağında — IMG silinir", () => {
		const root = setupContainer();
		const img = addEmoteImg(root, "sumheart", "[emote:1:sumheart]");
		const afterText = addText(root, " ");
		placeCaretAt(afterText, 0); // caret IMG'den hemen sonra

		const ev = fakeEvent("Backspace");
		const handled = handleEmoteBackspaceDelete(ev as any);

		expect(handled).toBe(true);
		expect(ev.prevented).toBe(true);
		expect(root.contains(img)).toBe(false);
		expect(extractComposerText(root)).toBe(" ");
	});

	test("Backspace: caret text içinde, normal silmeye izin verir", () => {
		const root = setupContainer();
		const textNode = addText(root, "hello");
		placeCaretAt(textNode, 3); // caret "hel|lo"

		const ev = fakeEvent("Backspace");
		const handled = handleEmoteBackspaceDelete(ev as any);

		expect(handled).toBe(false);
		expect(ev.prevented).toBe(false);
		// Text node hala olduğu gibi (silme browser'a kalır)
		expect(textNode.textContent).toBe("hello");
	});

	test("Delete: caret bir IMG'in solunda — IMG silinir", () => {
		const root = setupContainer();
		const beforeText = addText(root, "hi");
		const img = addEmoteImg(root, "kekw", "[emote:99:kekw]");

		placeCaretAt(beforeText, 2); // "hi|" → caret text sonunda, sonraki sibling IMG

		const ev = fakeEvent("Delete");
		const handled = handleEmoteBackspaceDelete(ev as any);

		expect(handled).toBe(true);
		expect(root.contains(img)).toBe(false);
		expect(extractComposerText(root)).toBe("hi");
	});

	test("Delete: caret text içinde, normal silme", () => {
		const root = setupContainer();
		const t = addText(root, "abc");
		placeCaretAt(t, 1); // a|bc

		const ev = fakeEvent("Delete");
		expect(handleEmoteBackspaceDelete(ev as any)).toBe(false);
	});

	test("non-emote IMG silinmez", () => {
		const root = setupContainer();
		const img = document.createElement("img");
		// composer-emote class YOK
		img.src = "https://example.com/x.png";
		root.appendChild(img);
		const after = addText(root, " ");
		placeCaretAt(after, 0);

		const ev = fakeEvent("Backspace");
		expect(handleEmoteBackspaceDelete(ev as any)).toBe(false);
		expect(root.contains(img)).toBe(true);
	});

	test("Backspace + selection (range) → default davranışa bırakır", () => {
		const root = setupContainer();
		const img = addEmoteImg(root, "x", "[emote:1:x]");
		const t = addText(root, "abc");
		const sel = window.getSelection()!;
		const range = document.createRange();
		range.setStart(t, 0);
		range.setEnd(t, 3); // "abc" seçili
		sel.removeAllRanges();
		sel.addRange(range);

		const ev = fakeEvent("Backspace");
		expect(handleEmoteBackspaceDelete(ev as any)).toBe(false);
		expect(root.contains(img)).toBe(true); // IMG silinmedi (selection text üzerindeydi)
	});

	test("Backspace: birden fazla emote, sadece soldaki silinir", () => {
		const root = setupContainer();
		const img1 = addEmoteImg(root, "a", "[emote:1:a]");
		const img2 = addEmoteImg(root, "b", "[emote:2:b]");
		// caret en sonda
		placeCaretAt(root, 2);

		const ev = fakeEvent("Backspace");
		expect(handleEmoteBackspaceDelete(ev as any)).toBe(true);
		expect(root.contains(img1)).toBe(true);
		expect(root.contains(img2)).toBe(false);
		expect(extractComposerText(root)).toBe("[emote:1:a]");
	});
});
