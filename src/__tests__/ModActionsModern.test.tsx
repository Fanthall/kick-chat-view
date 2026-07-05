/**
 * Sprint 5 (rebuilt) — ModActionsModern tests
 *
 * Render structure REBUILT to mirror the prototype spec 1:1
 * (workspace/plan/chat-view/prototype/chat-view-full.html #panelMod):
 * panel-hd + mod-scroll(mod-hint viewer-only, mod-sec "Seçili Kullanıcı",
 * mod-sec "Hızlı Timeout" (canModerate only), mod-sec "Mod Aksiyonları").
 *
 * Removed vs. previous test suite: Suspended users tests (section removed),
 * Collapsible sections tests (mechanism removed), custom-seconds timeout
 * input test (TimeoutPicker removed — replaced by static quick-timeout chips).
 *
 * Cases:
 * 1. Renders empty state when no user selected
 * 2. Renders selected user card with username + meta when user selected
 * 3. Quick-timeout chips + Ban/Timeout buttons disabled/hidden appropriately
 * 4. Quick-timeout chip click dispatches kick.timeoutUser with chip seconds
 * 5. Ban button dispatches kick.banUser
 * 6. Viewer mode hides quick-timeout section + ban/timeout buttons, shows hint
 * 7. Mod Aksiyonları (history) log renders + actor fallback + action tags
 */

import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
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
		// Sprint 26: badges boş; protectedTargetReason guard "moderator" /
		// "broadcaster" gibi rolleri reddediyor — bu testlerde normal kullanıcı
		// timeout senaryosunu test ediyoruz, mod-on-mod değil.
		badges: [],
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

	localStorage.clear();
	// Sprint 23 fix: pin language to "en" so test assertions against English
	// strings continue to match after i18n migration.
	localStorage.setItem("chatViewLanguage", "en");
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
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} selectedUser={baseUser} />
			</Provider>
		);
		expect(screen.getByTestId("mod-target-card")).toBeInTheDocument();
		expect(screen.getByText("testuser")).toBeInTheDocument();
		// Meta line: msgs + timeouts + bans is in the .mt-meta element
		const metaEl = document.querySelector(".mt-meta");
		expect(metaEl).toBeInTheDocument();
		expect(metaEl!.textContent).toMatch(/messages/i);
	});

	it("renders Profile button for all roles (viewer included)", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={false} selectedUser={baseUser} />
			</Provider>
		);
		expect(
			screen.getByRole("button", { name: /profile testuser/i })
		).toBeInTheDocument();
	});
});

// ─── Test 3: Quick-timeout + Ban/Timeout gating ──────────────────────────────

describe("ModActionsModern — quick-timeout section gating", () => {
	it("renders 5 quick-timeout chips (1d/5d/10d/30d/1s) when canModerate", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} selectedUser={baseUser} />
			</Provider>
		);
		expect(screen.getByText("Quick Timeout")).toBeInTheDocument();
		["1d", "5d", "10d", "30d", "1s"].forEach((label) => {
			expect(screen.getByRole("button", { name: new RegExp(`timeout ${label}`, "i") })).toBeInTheDocument();
		});
	});

	it("quick-timeout chips disabled when no user selected", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} />
			</Provider>
		);
		expect(
			screen.getByRole("button", { name: /timeout 5d/i })
		).toBeDisabled();
	});

	it("Ban/Timeout buttons hidden (not rendered) in viewer mode", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={false} selectedUser={baseUser} />
			</Provider>
		);
		expect(screen.queryByRole("button", { name: /ban user/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /timeout user/i })).not.toBeInTheDocument();
		expect(screen.queryByText("Quick Timeout")).not.toBeInTheDocument();
	});
});

// ─── Test 4: Quick-timeout chip dispatches kick.timeoutUser ──────────────────

describe("ModActionsModern — quick-timeout action", () => {
	it("clicking a chip calls kick.timeoutUser with that chip's seconds", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} selectedUser={baseUser} />
			</Provider>
		);

		fireEvent.click(screen.getByRole("button", { name: /timeout 10d/i }));

		expect(mockTimeoutUser).toHaveBeenCalledTimes(1);
		expect(mockTimeoutUser).toHaveBeenCalledWith(
			expect.objectContaining({
				broadcaster_user_id: 9999,
				user_id: 42,
				duration: 600,
			})
		);
	});

	it("Timeout button in selected-user card fires the default (5d/300s) duration", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} selectedUser={baseUser} />
			</Provider>
		);

		fireEvent.click(screen.getByRole("button", { name: /timeout user/i }));

		expect(mockTimeoutUser).toHaveBeenCalledTimes(1);
		expect(mockTimeoutUser).toHaveBeenCalledWith(
			expect.objectContaining({
				broadcaster_user_id: 9999,
				user_id: 42,
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

// ─── Test 6: Viewer mode ──────────────────────────────────────────────────────

describe("ModActionsModern — viewer mode (not mod/owner)", () => {
	it("shows viewer hint and hides mod-only actions when no user selected", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={false} isOwner={false} />
			</Provider>
		);
		// Both the mod-hint and the empty-target placeholder share the same
		// viewer-mode copy when no user is selected — assert at least one match.
		expect(
			screen.getAllByText(/viewer mode.*ban\/timeout/i).length
		).toBeGreaterThan(0);
		expect(screen.queryByText("Quick Timeout")).not.toBeInTheDocument();
	});

	it("still renders Mod Aksiyonları (history) section for viewers (read-only)", () => {
		const store = buildStore([baseModAction]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={false} isOwner={false} />
			</Provider>
		);
		expect(screen.getByText("Mod Actions")).toBeInTheDocument();
	});
});

// ─── Test 7: Mod Aksiyonları (history) log ───────────────────────────────────

describe("ModActionsModern — mod action history", () => {
	it("renders empty-history message when no mod actions recorded", () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} />
			</Provider>
		);
		expect(screen.getByText("Mod Actions")).toBeInTheDocument();
		expect(screen.getByText("No mod actions recorded.")).toBeInTheDocument();
	});

	it("shows i18n fallback 'a moderator' when banned_by is missing", () => {
		const actionNoActor: ModMessage = {
			id: "mod-no-actor",
			type: "ban",
			channelSlug: "test-channel",
			status: "success",
			user: { id: 88, username: "nobody_actor", slug: "nobody_actor" },
			// banned_by intentionally omitted — some Pusher events don't include it.
			created_at: Date.now(),
		};
		const store = buildStore([actionNoActor]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} />
			</Provider>
		);
		expect(screen.getByText(/by @a moderator/i)).toBeInTheDocument();
		expect(screen.queryByText(/by @system/i)).not.toBeInTheDocument();
	});

	it("renders localized action tag labels (BAN)", () => {
		const banAction: ModMessage = {
			id: "mod-tag-ban",
			type: "ban",
			channelSlug: "test-channel",
			status: "success",
			user: { id: 89, username: "tagged_user", slug: "tagged_user" },
			banned_by: { id: 1, username: "admin", slug: "admin" },
			created_at: Date.now(),
		};
		const store = buildStore([banAction]);
		render(
			<Provider store={store}>
				<ModActionsModern isMod={true} />
			</Provider>
		);
		expect(screen.getByText("BAN")).toBeInTheDocument();
	});
});
