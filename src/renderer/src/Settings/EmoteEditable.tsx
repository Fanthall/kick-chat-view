/**
 * Sprint 58d — Otomasyon editöründe tekrar kullanılan emote-aware text input.
 *
 * - contentEditable div: `[emote:ID:NAME]` token'ları inline IMG olarak render eder
 * - Emote picker butonu: tıklanınca EmotePickerModern açılır, seçilen emote token'ı insert edilir
 * - Plain text dışa yansır: `onChange(text)` her zaman kanonik metin verir
 * - Hem chat_match.pattern hem action.content için kullanılır
 */

import React, {
	FunctionComponent,
	useEffect,
	useRef,
	useState,
} from "react";
import { EmoteIndex } from "../../util/emoteIndex";
import {
	extractComposerText,
	handleEmoteBackspaceDelete,
	insertEmoteAtCaret,
	putCaretAtEnd,
	replaceKickBracketsInDom,
} from "../../util/composerDom";
import EmotePickerModern from "../Chat/EmotePickerModern";
import { EmoteEntry } from "../../constants/emote";

export interface EmoteEditableProps {
	value: string;
	onChange: (next: string) => void;
	emoteIndex: EmoteIndex;
	placeholder?: string;
	className?: string;
	/** Tek satırlık input gibi davransın (chat_match.pattern için). */
	singleLine?: boolean;
	/** Buton metnine eklenir. Boş = standart "😀 emote". */
	pickerButtonLabel?: string;
	/** Picker'da hangi emote setleri görünsün. */
	pickerExtras?: {
		channelEmoteSets: any[];
		globalEmoteSets: any[];
	};
	/** test id (opsiyonel). */
	dataTestId?: string;
}

const EmoteEditable: FunctionComponent<EmoteEditableProps> = ({
	value,
	onChange,
	emoteIndex,
	placeholder,
	className,
	singleLine,
	pickerButtonLabel,
	pickerExtras,
	dataTestId,
}) => {
	const ref = useRef<HTMLDivElement>(null);
	const btnRef = useRef<HTMLButtonElement>(null);
	const [pickerOpen, setPickerOpen] = useState(false);
	// Son DOM-sync edilen text. Kullanıcı yazarken bu eşitse useEffect early-return eder
	// → caret kaybolmaz. Programatik insert'te (emote pick) farklı kalsın ki useEffect tetiklensin.
	const lastSynced = useRef<string>("__init__");

	// DOM ↔ value senkronizasyonu
	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		if (lastSynced.current === value) return;
		lastSynced.current = value;
		node.textContent = value;
		replaceKickBracketsInDom(node, emoteIndex);
		putCaretAtEnd(node);
	}, [value, emoteIndex]);

	const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
		const node = e.currentTarget;
		const replaced = replaceKickBracketsInDom(node, emoteIndex);
		if (replaced) putCaretAtEnd(node);
		let text = extractComposerText(node);
		// Tek satırlık modda newline'ları kabul etme
		if (singleLine) text = text.replace(/\n/g, " ");
		lastSynced.current = text; // useEffect early-return etsin → caret kaybı yok
		onChange(text);
	};

	const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
		const text = extractComposerText(e.currentTarget);
		lastSynced.current = text;
		onChange(text);
	};

	// Sprint 58f: DOM-first — picker'dan gelen emote'u doğrudan IMG node olarak insert et.
	// Text-replace zayıftı (7TV emote name'leri bracket'siz geldiği için match yapmıyordu).
	const handleEmotePick = (entry: EmoteEntry) => {
		const node = ref.current;
		if (!node) return;
		insertEmoteAtCaret(node, entry);
		const text = singleLine
			? extractComposerText(node).replace(/\n/g, " ")
			: extractComposerText(node);
		lastSynced.current = text;
		onChange(text);
		setPickerOpen(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (singleLine && e.key === "Enter") {
			e.preventDefault();
			return;
		}
		// Sprint 58e: Backspace/Delete ile emote IMG'i sil
		if (handleEmoteBackspaceDelete(e.nativeEvent)) {
			// IMG kaldırıldı — state'i güncelle
			const node = ref.current;
			if (node) {
				const text = singleLine
					? extractComposerText(node).replace(/\n/g, " ")
					: extractComposerText(node);
				lastSynced.current = text;
				onChange(text);
			}
		}
	};

	return (
		<div className="emote-editable-wrap">
			<div
				ref={ref}
				className={`set-input auto-content-editable ${
					singleLine ? "is-single-line" : ""
				} ${className || ""}`}
				contentEditable
				suppressContentEditableWarning
				role="textbox"
				aria-multiline={!singleLine}
				data-placeholder={placeholder || ""}
				data-testid={dataTestId}
				onInput={handleInput}
				onBlur={handleBlur}
				onKeyDown={handleKeyDown}
			/>
			<button
				ref={btnRef}
				type="button"
				className="auto-chip auto-chip-emote emote-editable-btn"
				onClick={() => setPickerOpen((v) => !v)}
				title="Kick emote ekle"
			>
				{pickerButtonLabel || "😀 emote"}
			</button>
			<EmotePickerModern
				open={pickerOpen}
				onClose={() => setPickerOpen(false)}
				index={emoteIndex}
				onPick={(entry, { keepOpen }) => {
					handleEmotePick(entry);
					if (keepOpen) setPickerOpen(true);
				}}
				anchorRef={btnRef}
			/>
		</div>
	);
};

export default EmoteEditable;
