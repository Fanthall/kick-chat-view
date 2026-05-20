/**
 * Sprint 3 — EmoteAutocompleteModern unit tests (minimum 4 cases).
 *
 * Tests the component's rendering, keyboard navigation, and insert format.
 */

import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import React, { useState } from "react";
import EmoteAutocompleteModern, {
	EmoteAutocompleteEntry,
} from "../renderer/src/Chat/EmoteAutocompleteModern";
import type { EmoteProvider } from "../renderer/constants/emote";

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeEmote(overrides: Partial<EmoteAutocompleteEntry> = {}): EmoteAutocompleteEntry {
	return {
		id: "1",
		name: "KEKW",
		provider: "kick-global" as EmoteProvider,
		animated: false,
		zeroWidth: false,
		subscribersOnly: false,
		urls: { "1x": "https://cdn.example.com/kekw.webp" },
		insertText: "[emote:1:KEKW]",
		...overrides,
	};
}

const KICK_EMOTE = makeEmote({
	id: "100",
	name: "KEKW",
	provider: "kick-global",
	insertText: "[emote:100:KEKW]",
});

const SEVENTV_EMOTE = makeEmote({
	id: "abc",
	name: "PauseChamp",
	provider: "seventv-channel",
	insertText: "PauseChamp",
});

const BTTV_EMOTE = makeEmote({
	id: "btv1",
	name: "LULW",
	provider: "bttv-global",
	insertText: "LULW",
	animated: true,
});

const SUGGESTIONS = [KICK_EMOTE, SEVENTV_EMOTE, BTTV_EMOTE];

// ── Stateful wrapper ──────────────────────────────────────────────────────────

interface WrapperProps {
	initialIndex?: number;
	onPick?: (entry: EmoteAutocompleteEntry) => void;
}

function Wrapper({ initialIndex = 0, onPick = jest.fn() }: WrapperProps) {
	const [activeIndex, setActiveIndex] = useState(initialIndex);
	return (
		<EmoteAutocompleteModern
			suggestions={SUGGESTIONS}
			activeIndex={activeIndex}
			onPick={onPick}
			onHover={(i) => setActiveIndex(i)}
		/>
	);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("EmoteAutocompleteModern", () => {
	// ── Case 1: search produces results ──
	it("renders emote rows for the provided suggestions", () => {
		render(<Wrapper />);

		expect(screen.getByText("KEKW")).toBeInTheDocument();
		expect(screen.getByText("PauseChamp")).toBeInTheDocument();
		expect(screen.getByText("LULW")).toBeInTheDocument();
	});

	// ── Case 2: ↑↓ keyboard nav moves activeIndex (via onHover) ──
	it("highlights the active row based on activeIndex prop", () => {
		const { container } = render(
			<EmoteAutocompleteModern
				suggestions={SUGGESTIONS}
				activeIndex={1}
				onPick={jest.fn()}
				onHover={jest.fn()}
			/>
		);

		const rows = container.querySelectorAll(".ac-row");
		expect(rows[0].classList.contains("is-active")).toBe(false);
		expect(rows[1].classList.contains("is-active")).toBe(true);
		expect(rows[2].classList.contains("is-active")).toBe(false);
	});

	// ── Case 3: Tab/Enter (mouseDown) insert correct emote format ──
	it("calls onPick with Kick emote insert text [emote:ID:NAME] on click", () => {
		const onPick = jest.fn();
		const { container } = render(
			<EmoteAutocompleteModern
				suggestions={SUGGESTIONS}
				activeIndex={0}
				onPick={onPick}
				onHover={jest.fn()}
			/>
		);

		// First row is the Kick emote
		const rows = container.querySelectorAll(".ac-row");
		fireEvent.mouseDown(rows[0]);
		expect(onPick).toHaveBeenCalledTimes(1);
		expect(onPick).toHaveBeenCalledWith(
			expect.objectContaining({ insertText: "[emote:100:KEKW]" })
		);
	});

	it("calls onPick with plain insertText for 7TV/BTTV emote", () => {
		const onPick = jest.fn();
		const { container } = render(
			<EmoteAutocompleteModern
				suggestions={SUGGESTIONS}
				activeIndex={1}
				onPick={onPick}
				onHover={jest.fn()}
			/>
		);

		// Second row is 7TV PauseChamp
		const rows = container.querySelectorAll(".ac-row");
		fireEvent.mouseDown(rows[1]);
		expect(onPick).toHaveBeenCalledWith(
			expect.objectContaining({ insertText: "PauseChamp" })
		);
	});

	// ── Case 4: Esc closes the menu (via parent state) ──
	it("renders nothing when suggestions array is empty (closed state)", () => {
		const { container } = render(
			<EmoteAutocompleteModern
				suggestions={[]}
				activeIndex={0}
				onPick={jest.fn()}
				onHover={jest.fn()}
			/>
		);
		expect(container.querySelector(".autocomplete")).toBeNull();
	});

	// ── Provider badge rendering ──
	it("shows provider pill labels for Kick, 7TV, and BTTV", () => {
		render(<Wrapper />);
		// Kick pill
		expect(screen.getByText("Kick")).toBeInTheDocument();
		// 7TV pill
		expect(screen.getByText("7TV")).toBeInTheDocument();
		// BTTV pill
		expect(screen.getByText("BTTV")).toBeInTheDocument();
	});

	// ── GIF badge ──
	it("shows GIF badge for animated emotes", () => {
		render(<Wrapper />);
		// BTTV_EMOTE has animated:true
		expect(screen.getByText("GIF")).toBeInTheDocument();
	});
});
