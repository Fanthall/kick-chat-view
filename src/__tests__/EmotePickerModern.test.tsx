/**
 * Sprint 6b — EmotePickerModern unit tests (minimum 6 cases + 1 ChatModern
 * integration test).
 *
 * Mocking strategy mirrors existing test files (ChatModern.test.tsx).
 * emoteFavorites localStorage API mocked via localStorage.clear() in beforeEach.
 */

import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import EmotePickerModern from "../renderer/src/Chat/EmotePickerModern";
import ChatModern from "../renderer/src/Chat/ChatModern";
import ChatMessageReducers from "../renderer/store/reducer/chatMessage";
import GeneralReducers from "../renderer/store/reducer/general";
import type { EmoteEntry, EmoteSet } from "../renderer/constants/emote";
import { buildEmoteIndex } from "../renderer/util/emoteIndex";
import { FAVORITES_CHANGED_EVENT } from "../renderer/util/emoteFavorites";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("moment", () => {
	const m = (_d: any) => ({ format: () => "12:34" });
	(m as any).default = m;
	return m;
});

jest.mock("react-toastify", () => ({ toast: jest.fn() }));

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeEmoteEntry(overrides: Partial<EmoteEntry> = {}): EmoteEntry {
	return {
		id: "100",
		name: "KEKW",
		provider: "kick-global",
		scope: "global",
		animated: false,
		zeroWidth: false,
		urls: { "1x": "https://cdn.example.com/kekw.webp" },
		insertText: "[emote:100:KEKW]",
		...overrides,
	};
}

const KICK_EMOTE = makeEmoteEntry({
	id: "100",
	name: "KEKW",
	provider: "kick-channel",
	scope: "channel",
	insertText: "[emote:100:KEKW]",
});

const SEVENTV_EMOTE = makeEmoteEntry({
	id: "abc",
	name: "PauseChamp",
	provider: "seventv-channel",
	scope: "channel",
	insertText: "PauseChamp",
});

const BTTV_EMOTE = makeEmoteEntry({
	id: "btv1",
	name: "LULW",
	provider: "bttv-global",
	scope: "global",
	animated: true,
	insertText: "LULW",
});

const FFZ_EMOTE = makeEmoteEntry({
	id: "ffz1",
	name: "PogChamp",
	provider: "ffz-global",
	scope: "global",
	insertText: "PogChamp",
});

function makeIndex(entries: EmoteEntry[] = [KICK_EMOTE, SEVENTV_EMOTE, BTTV_EMOTE]) {
	const allSets: EmoteSet[] = [
		{
			id: "kick-set",
			provider: "kick-channel" as const,
			scope: "channel" as const,
			name: "Kick Channel",
			emotes: entries.filter((e) => e.provider === "kick-channel"),
		},
		{
			id: "7tv-set",
			provider: "seventv-channel" as const,
			scope: "channel" as const,
			name: "7TV Channel",
			emotes: entries.filter((e) => e.provider === "seventv-channel"),
		},
		{
			id: "bttv-set",
			provider: "bttv-global" as const,
			scope: "global" as const,
			name: "BTTV Global",
			emotes: entries.filter((e) => e.provider === "bttv-global"),
		},
		{
			id: "ffz-set",
			provider: "ffz-global" as const,
			scope: "global" as const,
			name: "FFZ Global",
			emotes: entries.filter((e) => e.provider === "ffz-global"),
		},
	].filter((s) => s.emotes.length > 0);

	return buildEmoteIndex(allSets, [], "testchannel");
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

interface PickerWrapperProps {
	entries?: EmoteEntry[];
	onPick?: jest.Mock;
	onClose?: jest.Mock;
	initialOpen?: boolean;
}

function renderPicker({
	entries = [KICK_EMOTE, SEVENTV_EMOTE, BTTV_EMOTE],
	onPick = jest.fn(),
	onClose = jest.fn(),
	initialOpen = true,
}: PickerWrapperProps = {}) {
	const index = makeIndex(entries);
	return {
		...render(
			<EmotePickerModern
				open={initialOpen}
				onClose={onClose}
				index={index}
				onPick={onPick}
			/>
		),
		onPick,
		onClose,
		index,
	};
}

function makeElectronMock() {
	return {
		ipcRenderer: { once: jest.fn(), sendMessage: jest.fn() },
		kick: {
			getAuthStatus: jest.fn().mockResolvedValue({}),
			getUsers: jest.fn().mockResolvedValue({ data: [] }),
			getChannelBySlug: jest.fn().mockResolvedValue({ data: [] }),
			getOwnChannels: jest.fn().mockResolvedValue({ data: [] }),
			getChannelRewardRedemptions: jest.fn().mockResolvedValue({ data: [] }),
			sendChatMessage: jest.fn().mockResolvedValue({}),
			deleteChatMessage: jest.fn().mockResolvedValue({}),
			timeoutUser: jest.fn().mockResolvedValue({}),
			banUser: jest.fn().mockResolvedValue({}),
			unbanUser: jest.fn().mockResolvedValue({}),
		},
		userWindow: {
			open: jest.fn(),
			update: jest.fn(),
			onPayload: jest.fn(),
		},
		kickConnectionWindow: { open: jest.fn() },
	};
}

function makeStore() {
	return configureStore({
		reducer: { messages: ChatMessageReducers, generals: GeneralReducers },
		middleware: (gd) => gd({ serializableCheck: false }),
	});
}

// ─── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
	localStorage.clear();
	Object.defineProperty(window, "electron", {
		configurable: true,
		value: makeElectronMock(),
	});
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("EmotePickerModern", () => {
	// Case 1: Tab switch changes active tab + grid
	it("tab switch changes active tab and shows correct tab label as active", async () => {
		renderPicker();

		// Default active tab is "kick"
		const kickTab = screen.getByTestId("ep-tab-kick");
		expect(kickTab).toHaveClass("is-active");

		// Switch to 7TV tab
		await act(async () => {
			fireEvent.click(screen.getByTestId("ep-tab-seventv"));
		});

		expect(screen.getByTestId("ep-tab-seventv")).toHaveClass("is-active");
		expect(screen.getByTestId("ep-tab-kick")).not.toHaveClass("is-active");
	});

	// Case 2: Search input filters emote grid (case-insensitive)
	it("search input filters emote grid case-insensitively", async () => {
		renderPicker({
			entries: [KICK_EMOTE, SEVENTV_EMOTE, BTTV_EMOTE],
		});

		const input = screen.getByTestId("ep-search-input");

		// Search for "kekw" in lowercase — should match KEKW
		await act(async () => {
			fireEvent.change(input, { target: { value: "kekw" } });
		});

		const grid = screen.getByTestId("ep-grid");
		// KEKW should be present as an img with alt="KEKW"
		expect(grid.querySelector('img[alt="KEKW"]')).toBeTruthy();
		// PauseChamp should not be visible
		expect(grid.querySelector('img[alt="PauseChamp"]')).toBeFalsy();
	});

	// Case 3: Hover over emote updates preview pane (name + provider badge)
	it("hovering an emote updates the preview pane with name and provider badge", async () => {
		renderPicker();

		// Switch to 7TV tab to see SEVENTV_EMOTE
		await act(async () => {
			fireEvent.click(screen.getByTestId("ep-tab-seventv"));
		});

		const grid = screen.getByTestId("ep-grid");
		const cell = grid.querySelector("[title=\"PauseChamp\"]") as HTMLElement;
		expect(cell).toBeTruthy();

		await act(async () => {
			fireEvent.mouseEnter(cell);
		});

		const previewName = screen.getByTestId("ep-preview-name");
		expect(previewName.textContent).toBe("PauseChamp");

		// Provider badge for 7TV should be present
		const previewMeta = screen.getByTestId("ep-preview-meta");
		expect(previewMeta.textContent).toContain("7TV");
	});

	// Case 4: Click emote calls onPick with correct entry + closes picker
	it("clicking an emote cell calls onPick with correct entry and closes picker", async () => {
		const onPick = jest.fn();
		const onClose = jest.fn();
		renderPicker({ onPick, onClose });

		const grid = screen.getByTestId("ep-grid");
		const cell = grid.querySelector("[title=\"KEKW\"]") as HTMLElement;
		expect(cell).toBeTruthy();

		await act(async () => {
			fireEvent.click(cell);
		});

		expect(onPick).toHaveBeenCalledTimes(1);
		expect(onPick).toHaveBeenCalledWith(
			expect.objectContaining({ name: "KEKW", insertText: "[emote:100:KEKW]" }),
			expect.objectContaining({ keepOpen: false })
		);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	// Case 5: Right-click toggles favorite (FAVORITES_CHANGED_EVENT dispatched)
	it("right-clicking an emote cell dispatches FAVORITES_CHANGED_EVENT", async () => {
		renderPicker();

		const favEventSpy = jest.fn();
		window.addEventListener(FAVORITES_CHANGED_EVENT, favEventSpy);

		const grid = screen.getByTestId("ep-grid");
		const cell = grid.querySelector("[title=\"KEKW\"]") as HTMLElement;
		expect(cell).toBeTruthy();

		await act(async () => {
			fireEvent.contextMenu(cell);
		});

		expect(favEventSpy).toHaveBeenCalledTimes(1);

		window.removeEventListener(FAVORITES_CHANGED_EVENT, favEventSpy);
	});

	// Case 6: Empty state shown when search yields zero results
	it("shows empty state when search query yields no results", async () => {
		renderPicker();

		const input = screen.getByTestId("ep-search-input");

		await act(async () => {
			fireEvent.change(input, { target: { value: "xyznonexistentemote999" } });
		});

		expect(screen.getByTestId("ep-empty")).toBeInTheDocument();
		expect(screen.getByText(/No emotes match/i)).toBeInTheDocument();
	});

	// Case 7: Empty state has Clear button that resets query
	it("Clear button in empty state resets query and shows emotes again", async () => {
		renderPicker();

		const input = screen.getByTestId("ep-search-input");

		await act(async () => {
			fireEvent.change(input, { target: { value: "zzznomatch" } });
		});

		const clearBtn = screen.getByRole("button", { name: /clear/i });
		expect(clearBtn).toBeInTheDocument();

		await act(async () => {
			fireEvent.click(clearBtn);
		});

		// Empty state should be gone (at least KEKW visible on kick tab)
		expect(screen.queryByTestId("ep-empty")).toBeFalsy();
	});

	// Case 8: Favorites tab shows no-favorites empty state when no favorites
	it("favorites tab shows empty state message when favorites list is empty", async () => {
		renderPicker();

		await act(async () => {
			fireEvent.click(screen.getByTestId("ep-tab-favorites"));
		});

		expect(screen.getByTestId("ep-empty")).toBeInTheDocument();
		expect(screen.getByText(/No favorites yet/i)).toBeInTheDocument();
	});

	// Case 9: Provider footer shows correct totals
	it("footer shows total emote count", () => {
		renderPicker({
			entries: [KICK_EMOTE, SEVENTV_EMOTE, BTTV_EMOTE, FFZ_EMOTE],
		});

		// 4 total emotes — "4 total" should appear
		expect(screen.getByText(/4 total/i)).toBeInTheDocument();
	});
});

// ─── ChatModern integration test ───────────────────────────────────────────────

describe("ChatModern + EmotePickerModern integration", () => {
	// Case: Clicking the smile button opens EmotePickerModern in the document
	it("clicking smile button opens EmotePickerModern (ep-modal rendered to document)", async () => {
		const store = makeStore();

		render(
			<Provider store={store}>
				<ChatModern />
			</Provider>
		);

		// Initially picker should not be open
		expect(screen.queryByTestId("ep-modal")).toBeNull();

		// Click the smile button
		const smileBtn = screen.getByTestId("smile-btn");
		await act(async () => {
			fireEvent.click(smileBtn);
		});

		// After click, EmotePickerModern should be rendered
		expect(screen.getByTestId("ep-modal")).toBeInTheDocument();
	});
});
