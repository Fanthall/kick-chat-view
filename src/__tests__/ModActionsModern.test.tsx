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
	mockTimeoutUser.mockReset().mockResolvedValue(undefined);
	mockBanUser.mockReset().mockResolvedValue(undefined);
	mockUnbanUser.mockReset().mockResolvedValue(undefined);

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
				<ModActionsModern isMod={true} />
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
		// Sprint 18: empty modAction so suspended list doesn't duplicate "testuser"
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} selectedUser={baseUser} />
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
	it("all quick action buttons + timeout picker are disabled when no user selected", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} />
			</Provider>
		);
		// Sprint 19: Apply (timeout picker primary action) is disabled.
		const applyBtn = screen.getByRole("button", { name: /^apply$/i });
		expect(applyBtn).toBeDisabled();
		// Sprint 19: preset chips disabled too.
		expect(screen.getByRole("button", { name: "1m" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "10m" })).toBeDisabled();
		// Ban button still disabled.
		const banBtn = screen.getByRole("button", { name: /ban user/i });
		expect(banBtn).toBeDisabled();
	});
});

// ─── Test 4: Timeout button dispatches kick.timeoutUser ──────────────────────

describe("ModActionsModern — timeout action", () => {
	it("Apply timeout button calls kick.timeoutUser with selected preset duration", () => {
		// Sprint 19: Two separate Timeout buttons collapsed into TimeoutPicker.
		// Default preset = getDefaultTimeoutSeconds (600s). Apply button fires
		// kick.timeoutUser with that duration.
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} selectedUser={baseUser} />
			</Provider>
		);

		const applyBtn = screen.getByRole("button", { name: /^apply$/i });
		expect(applyBtn).not.toBeDisabled();
		fireEvent.click(applyBtn);

		expect(mockTimeoutUser).toHaveBeenCalledTimes(1);
		expect(mockTimeoutUser).toHaveBeenCalledWith(
			expect.objectContaining({
				broadcaster_user_id: 9999,
				user_id: 42,
				duration: 600,
			})
		);
	});

	it("Custom seconds input overrides preset and fires kick.timeoutUser", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} selectedUser={baseUser} />
			</Provider>
		);

		const customInput = screen.getByLabelText(/custom timeout seconds/i);
		fireEvent.change(customInput, { target: { value: "120" } });
		const applyBtn = screen.getByRole("button", { name: /^apply$/i });
		fireEvent.click(applyBtn);

		expect(mockTimeoutUser).toHaveBeenCalledTimes(1);
		expect(mockTimeoutUser).toHaveBeenCalledWith(
			expect.objectContaining({
				duration: 120,
			})
		);
	});

	it("Preset chip click switches duration; Apply uses chip seconds", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} selectedUser={baseUser} />
			</Provider>
		);

		fireEvent.click(screen.getByRole("button", { name: "5m" }));
		fireEvent.click(screen.getByRole("button", { name: /^apply$/i }));

		expect(mockTimeoutUser).toHaveBeenCalledTimes(1);
		expect(mockTimeoutUser).toHaveBeenCalledWith(
			expect.objectContaining({
				duration: 300,
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
				<ModActionsModern isMod={true} selectedUser={baseUser} />
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
				<ModActionsModern isMod={true} selectedUser={baseUser} />
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
				<ModActionsModern isMod={true} selectedUser={baseUser} />
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
	it("Unban button calls kick.unbanUser with broadcaster + user IDs", () => {
		// Sprint 18: suspended list is now derived from modAction (ban entries).
		// Construct a ban action for "banneduser" and provide active stream meta
		// so broadcasterUserId resolves.
		const bannedUser = { id: 77, username: "banneduser", slug: "banneduser" };
		const banAction: ModMessage = {
			id: "mod-ban-banneduser",
			type: "ban",
			channelSlug: "test-channel",
			status: "success",
			user: bannedUser,
			banned_by: { id: 1, username: "admin", slug: "admin" },
			created_at: Date.now(),
		};
		const store = buildStore([banAction]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} />
			</Provider>
		);

		expect(screen.getByTestId("suspended-row-banneduser")).toBeInTheDocument();
		// Sprint 21: "banneduser" artik hem suspended hem recent actions
		// listelerinde gorulebilir — getAllByText ile ikisini de kabul et.
		expect(screen.getAllByText("banneduser").length).toBeGreaterThan(0);

		fireEvent.click(screen.getByRole("button", { name: /unban banneduser/i }));

		expect(mockUnbanUser).toHaveBeenCalledTimes(1);
		expect(mockUnbanUser).toHaveBeenCalledWith(
			expect.objectContaining({
				broadcaster_user_id: 9999,
				user_id: 77,
			})
		);
	});
});

// ─── Test 9: Viewer mode (Sprint 10) ─────────────────────────────────────────

describe("ModActionsModern — viewer mode (not mod/owner)", () => {
	it("hides Quick actions + Chat controls sections when isMod=false", () => {
		const store = buildStore([baseModAction]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={false} isOwner={false} />
			</Provider>
		);
		expect(screen.queryByText(/quick actions/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/chat controls/i)).not.toBeInTheDocument();
		// Suspended users section still rendered (read-only)
		expect(
			screen.getByRole("button", { name: /suspended users/i })
		).toBeInTheDocument();
	});

	it("hides Unban button when isMod=false", () => {
		// Sprint 18: suspended list now derived from modAction. Construct ban
		// entry so row renders; verify Unban btn is hidden in viewer mode.
		const banAction: ModMessage = {
			id: "mod-ban-vw",
			type: "ban",
			channelSlug: "test-channel",
			status: "success",
			user: { id: 77, username: "banneduser", slug: "banneduser" },
			banned_by: { id: 1, username: "admin", slug: "admin" },
			created_at: Date.now(),
		};
		const store = buildStore([banAction]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={false} />
			</Provider>
		);
		expect(screen.getByTestId("suspended-row-banneduser")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /unban banneduser/i })
		).not.toBeInTheDocument();
	});

	it("shows viewer mode placeholder text when no user selected", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={false} />
			</Provider>
		);
		expect(
			screen.getByText(/viewer mode — moderation actions hidden/i)
		).toBeInTheDocument();
	});
});

// ─── Test 10: Collapsible sections (Sprint 10) ───────────────────────────────

describe("ModActionsModern — collapsible sections", () => {
	it("toggles section collapsed state on chevron click", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} />
			</Provider>
		);
		const selectedToggle = screen.getByRole("button", {
			name: /selected user/i,
		});
		expect(selectedToggle).toHaveAttribute("aria-expanded", "true");
		fireEvent.click(selectedToggle);
		expect(selectedToggle).toHaveAttribute("aria-expanded", "false");
	});

	it("persists collapsed state to localStorage", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} />
			</Provider>
		);
		const actionsToggle = screen.getByRole("button", {
			name: /quick actions/i,
		});
		fireEvent.click(actionsToggle);
		const stored = JSON.parse(
			localStorage.getItem("chatViewModSections") || "{}"
		);
		expect(stored.actions).toBe(true);
	});
});
