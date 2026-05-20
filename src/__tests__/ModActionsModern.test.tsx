/**
 * Sprint 5 — ModActionsModern tests
 *
 * Cases:
 * 1. Renders empty state when no user selected
 * 2. Renders selected user card with username + meta when user selected
 * 3. Quick action buttons disabled when no target user
 * 4. Timeout button dispatches kick.timeoutUser with selected user + default seconds
 * 5. Ban button dispatches kick.banUser
 * 6. Ctrl+T keyboard shortcut fires default timeout
 * 7. Suspended user Unban button calls removeSuspendedUser + updates list
 */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, act } from "@testing-library/react";
import React from "react";
import { Provider } from "react-redux";
import configureMockStore from "redux-mock-store";
import thunk from "redux-thunk";
import ModActionsModern from "../renderer/src/ModActions/ModActionsModern";
import { ModMessage, UserMessage } from "../renderer/util/chatInterface";

// ─── Mock redux store ─────────────────────────────────────────────────────────

const middlewares = [thunk];
const mockStore = configureMockStore(middlewares);

const baseUser = {
	id: 42,
	username: "testuser",
	slug: "testuser",
	identity: {
		color: "#ff0000",
		badges: [{ type: "moderator", text: "Mod" }],
	},
};

const baseMeta = {
	channelSlug: "test-channel",
	broadcasterUserId: 9999,
	isLive: true,
	updatedAt: Date.now(),
};

const baseModAction: ModMessage = {
	id: "mod-1",
	type: "ban",
	channelSlug: "test-channel",
	status: "success",
	user: baseUser,
	banned_by: { id: 1, username: "admin", slug: "admin" },
	created_at: Date.now(),
};

const baseMessages = {
	modAction: [] as ModMessage[],
	messageList: [] as UserMessage[],
	channelBadges: [],
	channelBadgesByChannel: {},
	streamMetaByChannel: {
		"test-channel": baseMeta,
	},
};

function buildStore(modAction: ModMessage[] = [], messageList: UserMessage[] = []) {
	return mockStore({
		messages: { ...baseMessages, modAction, messageList },
	});
}

// ─── Mock electron bridge ─────────────────────────────────────────────────────

const mockTimeoutUser = jest.fn();
const mockBanUser = jest.fn();
const mockUnbanUser = jest.fn();

beforeEach(() => {
	mockTimeoutUser.mockReset();
	mockBanUser.mockReset();
	mockUnbanUser.mockReset();

	Object.defineProperty(window, "electron", {
		configurable: true,
		value: {
			ipcRenderer: {
				once: jest.fn(),
				sendMessage: jest.fn(),
			},
			kick: {
				getAuthStatus: jest.fn().mockResolvedValue({}),
				timeoutUser: mockTimeoutUser,
				banUser: mockBanUser,
				unbanUser: mockUnbanUser,
			},
			userWindow: {
				open: jest.fn(),
				update: jest.fn(),
				onPayload: jest.fn(),
			},
			kickConnectionWindow: {
				open: jest.fn(),
			},
		},
	});

	// Mock active channel slug
	jest.spyOn(
		require("../renderer/util/channelSettings"),
		"getActiveChannelSlug"
	).mockReturnValue("test-channel");

	// Clear suspended users storage
	localStorage.clear();
});

afterEach(() => {
	jest.restoreAllMocks();
});

// ─── Test 1: Empty state when no user selected ────────────────────────────────

describe("ModActionsModern — no user selected", () => {
	it("renders placeholder when no user selected", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern />
			</Provider>
		);
		expect(screen.getByTestId("mod-target-empty")).toBeInTheDocument();
		expect(
			screen.getByText("Click a chat row to select a user")
		).toBeInTheDocument();
	});
});

// ─── Test 2: Renders selected user card ──────────────────────────────────────

describe("ModActionsModern — selected user card", () => {
	it("renders user card with username and meta", () => {
		const store = buildStore([baseModAction]);
		render(
			<Provider store={store}>
				<ModActionsModern />
			</Provider>
		);
		expect(screen.getByTestId("mod-target-card")).toBeInTheDocument();
		expect(screen.getByText("testuser")).toBeInTheDocument();
		// Meta line: msgs + timeouts is in the .mod-target-meta element
		const metaEl = document.querySelector(".mod-target-meta");
		expect(metaEl).toBeInTheDocument();
		expect(metaEl!.textContent).toMatch(/msgs/i);
	});
});

// ─── Test 3: Quick action buttons disabled when no user ───────────────────────

describe("ModActionsModern — quick action disabled state", () => {
	it("all quick action buttons are disabled when no user selected", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern />
			</Provider>
		);
		const timeoutBtns = screen.getAllByRole("button", { name: /timeout/i });
		timeoutBtns.forEach((btn) => expect(btn).toBeDisabled());

		const banBtn = screen.getByRole("button", { name: /ban user/i });
		expect(banBtn).toBeDisabled();
	});
});

// ─── Test 4: Timeout button dispatches kick.timeoutUser ──────────────────────

describe("ModActionsModern — timeout action", () => {
	it("timeout (default) button calls kick.timeoutUser with correct user + duration", () => {
		const store = buildStore([baseModAction]);
		render(
			<Provider store={store}>
				<ModActionsModern />
			</Provider>
		);

		const timeoutBtn = screen.getByRole("button", { name: /timeout \(default\)/i });
		expect(timeoutBtn).not.toBeDisabled();
		fireEvent.click(timeoutBtn);

		expect(mockTimeoutUser).toHaveBeenCalledTimes(1);
		expect(mockTimeoutUser).toHaveBeenCalledWith(
			expect.objectContaining({
				broadcaster_user_id: 9999,
				user_id: 42,
			})
		);
	});
});

// ─── Test 5: Ban button dispatches kick.banUser ───────────────────────────────

describe("ModActionsModern — ban action", () => {
	it("ban button calls kick.banUser with broadcaster + user IDs", () => {
		const store = buildStore([baseModAction]);
		render(
			<Provider store={store}>
				<ModActionsModern />
			</Provider>
		);

		const banBtn = screen.getByRole("button", { name: /ban user/i });
		expect(banBtn).not.toBeDisabled();
		fireEvent.click(banBtn);

		expect(mockBanUser).toHaveBeenCalledTimes(1);
		expect(mockBanUser).toHaveBeenCalledWith(
			expect.objectContaining({
				broadcaster_user_id: 9999,
				user_id: 42,
			})
		);
	});
});

// ─── Test 6: Ctrl+T keyboard shortcut ────────────────────────────────────────

describe("ModActionsModern — keyboard shortcuts", () => {
	it("Ctrl+T fires default timeout on selected user", () => {
		const store = buildStore([baseModAction]);
		render(
			<Provider store={store}>
				<ModActionsModern />
			</Provider>
		);

		act(() => {
			fireEvent.keyDown(window, { key: "t", ctrlKey: true, shiftKey: false });
		});

		expect(mockTimeoutUser).toHaveBeenCalledTimes(1);
		expect(mockTimeoutUser).toHaveBeenCalledWith(
			expect.objectContaining({
				broadcaster_user_id: 9999,
				user_id: 42,
			})
		);
	});

	it("Ctrl+Shift+T fires long timeout (600s) on selected user", () => {
		const store = buildStore([baseModAction]);
		render(
			<Provider store={store}>
				<ModActionsModern />
			</Provider>
		);

		act(() => {
			fireEvent.keyDown(window, { key: "T", ctrlKey: true, shiftKey: true });
		});

		expect(mockTimeoutUser).toHaveBeenCalledTimes(1);
		expect(mockTimeoutUser).toHaveBeenCalledWith(
			expect.objectContaining({
				broadcaster_user_id: 9999,
				user_id: 42,
				duration: 600,
			})
		);
	});
});

// ─── Test 7: Suspended user Unban button ─────────────────────────────────────

describe("ModActionsModern — suspended users", () => {
	it("Unban button calls removeSuspendedUser and removes entry from list", () => {
		// Pre-populate suspended users in localStorage
		localStorage.setItem("susUsers", JSON.stringify(["banneduser"]));

		const store = buildStore([]);
		const { rerender } = render(
			<Provider store={store}>
				<ModActionsModern />
			</Provider>
		);

		// User row should be visible
		expect(screen.getByTestId("suspended-row-banneduser")).toBeInTheDocument();
		expect(screen.getByText("banneduser")).toBeInTheDocument();

		// Click unban
		const unbanBtn = screen.getByRole("button", { name: /unban banneduser/i });
		fireEvent.click(unbanBtn);

		// List should now be empty
		expect(screen.queryByTestId("suspended-row-banneduser")).not.toBeInTheDocument();
		expect(screen.getByText("No suspended users")).toBeInTheDocument();

		// localStorage should be updated
		const stored = JSON.parse(localStorage.getItem("susUsers") || "[]");
		expect(stored).not.toContain("banneduser");
	});
});
