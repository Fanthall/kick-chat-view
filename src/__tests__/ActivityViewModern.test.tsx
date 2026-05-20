/**
 * Sprint 4 — ActivityViewModern tests
 *
 * Covers:
 * 1. All 5 activity types render with correct icon/accent
 * 2. Filter chip changes active list
 * 3. Row click toggles expand drawer
 * 4. Raw JSON toggle shows/hides pre block
 * 5. maskSensitive applied to raw JSON (token-like values redacted)
 * 6. Accept button dispatches updateRewardRedemption
 * 7. Bulk gift recipients pill list renders when expanded
 * 8. KICKs leaderboard sub-tab switches periods
 */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { Provider } from "react-redux";
import configureMockStore from "redux-mock-store";
import thunk from "redux-thunk";
import ActivityViewModern from "../renderer/src/ActivityView/ActivityViewModern";
import { ActivityItem } from "../renderer/util/chatInterface";

// ─── Mock store ──────────────────────────────────────────────────────────────
const middlewares = [thunk];
const mockStore = configureMockStore(middlewares);

const baseMessages = {
	activityList: [] as ActivityItem[],
	channelBadges: [],
	channelBadgesByChannel: {},
	streamMetaByChannel: {},
};

function buildStore(activityList: ActivityItem[]) {
	return mockStore({
		messages: { ...baseMessages, activityList },
	});
}

// ─── Mock electron bridge ─────────────────────────────────────────────────────
const mockGetKicksLeaderboard = jest.fn();
const mockAcceptRedemptions = jest.fn();
const mockRejectRedemptions = jest.fn();

beforeEach(() => {
	// Sprint 23 fix: pin language to "en" for assertions against English strings.
	localStorage.setItem("chatViewLanguage", "en");
	mockGetKicksLeaderboard.mockResolvedValue({
		data: {
			week: [
				{ rank: 1, username: "alpha", gifted_amount: 500, user_id: 1 },
				{ rank: 2, username: "beta", gifted_amount: 300, user_id: 2 },
			],
			month: [
				{ rank: 1, username: "gamma", gifted_amount: 1200, user_id: 3 },
			],
			lifetime: [
				{ rank: 1, username: "delta", gifted_amount: 9999, user_id: 4 },
			],
		},
	});
	mockAcceptRedemptions.mockResolvedValue({ data: [] });
	mockRejectRedemptions.mockResolvedValue({ data: [] });

	Object.defineProperty(window, "electron", {
		configurable: true,
		value: {
			ipcRenderer: {
				once: jest.fn(),
				sendMessage: jest.fn(),
			},
			kick: {
				getAuthStatus: jest.fn().mockResolvedValue({
					grantedScopes: [
						"channel:rewards:write",
						"kicks:read",
					],
					tokenScope: "channel:rewards:write kicks:read",
					introspection: { data: { scope: "", scopes: [] } },
				}),
				getChannelRewardRedemptions: jest.fn().mockResolvedValue({ data: [] }),
				getKicksLeaderboard: mockGetKicksLeaderboard,
				acceptChannelRewardRedemptions: mockAcceptRedemptions,
				rejectChannelRewardRedemptions: mockRejectRedemptions,
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

	// Silence missing channel slug for tests
	jest.spyOn(
		require("../renderer/util/channelSettings"),
		"getActiveChannelSlug"
	).mockReturnValue("test-channel");
});

afterEach(() => {
	jest.restoreAllMocks();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const makeActivity = (
	overrides: Partial<ActivityItem> & { kind: ActivityItem["kind"] }
): ActivityItem => ({
	id: `id-${overrides.kind}-${Math.random()}`,
	channelSlug: "test-channel",
	actor: { username: "testuser", id: 42 },
	createdAt: Date.now() - 60_000,
	create_at: Date.now() - 60_000,
	...overrides,
});

const subNewActivity = makeActivity({ kind: "subscription_new", months: 3, streak: 7 });
const subRenewalActivity = makeActivity({ kind: "subscription_renewal", months: 6 });
const subGiftActivity = makeActivity({
	kind: "subscription_gift",
	amount: 3,
	targetUsers: [
		{ username: "alice" },
		{ username: "bob" },
		{ username: "carol" },
	],
	raw: { tier: 2 },
});
const kicksActivity = makeActivity({
	kind: "kicks_gifted",
	amount: 1234,
	giftName: "SuperKick",
	giftTier: 3,
	pinnedTimeSeconds: 30,
});
const rewardActivity = makeActivity({
	kind: "reward_redemption",
	title: "Hydrate",
	amount: 500,
	message: "pretty please",
	status: "pending",
	raw: { secret_token: "abcdefghijklmnopqrstuvwxyz1234567890", user: "testuser" },
});

// ─── Test 1: All 5 activity types render ─────────────────────────────────────
describe("ActivityViewModern — activity types", () => {
	it("renders subscription_new row", () => {
		const store = buildStore([subNewActivity]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);
		expect(screen.getByText(/subscribed/i)).toBeInTheDocument();
		expect(screen.getByText(/3 mos/i)).toBeInTheDocument();
	});

	it("renders subscription_renewal row", () => {
		const store = buildStore([subRenewalActivity]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);
		expect(screen.getByText(/renewed/i)).toBeInTheDocument();
	});

	it("renders subscription_gift (bulk) row", () => {
		const store = buildStore([subGiftActivity]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);
		expect(screen.getByText(/gifted/i)).toBeInTheDocument();
		// bulk shows ×N
		expect(screen.getByText(/×3/i)).toBeInTheDocument();
	});

	it("renders kicks_gifted row with amount", () => {
		const store = buildStore([kicksActivity]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);
		// "sent" is unique to kicks_gifted line text
		expect(screen.getByText(/sent/i)).toBeInTheDocument();
		// SuperKick gift name appears in meta
		expect(screen.getByText(/SuperKick/i)).toBeInTheDocument();
	});

	it("renders reward_redemption row with title", () => {
		const store = buildStore([rewardActivity]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);
		expect(screen.getByText(/Hydrate/i)).toBeInTheDocument();
	});
});

// ─── Test 2: Filter chip changes visible list ─────────────────────────────────
describe("ActivityViewModern — filter chips", () => {
	it("Subs filter shows only subscription events", () => {
		const store = buildStore([subNewActivity, subRenewalActivity, rewardActivity]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);

		// Click Subs chip
		fireEvent.click(screen.getByRole("button", { name: /^Subs/ }));

		// Subscription rows should be visible
		expect(screen.getByText(/subscribed/i)).toBeInTheDocument();
		// Reward row should not be visible
		expect(screen.queryByText(/Hydrate/i)).not.toBeInTheDocument();
	});

	it("KICKs filter shows only kicks events", () => {
		const store = buildStore([subNewActivity, kicksActivity]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);

		// Use getAllByRole to pick the chip (not the sub-tab), identified by aria-pressed
		const kicksChip = screen.getAllByRole("button", { pressed: false }).find(
			(el) => el.classList.contains("chip") && el.textContent?.includes("KICKs")
		);
		expect(kicksChip).toBeDefined();
		fireEvent.click(kicksChip!);

		// Only kicks row visible
		expect(screen.queryByText(/subscribed/i)).not.toBeInTheDocument();
		expect(screen.getByText(/SuperKick/i)).toBeInTheDocument();
	});
});

// ─── Test 3: Row click toggles expand drawer ─────────────────────────────────
describe("ActivityViewModern — expand drawer", () => {
	it("clicking row opens expand drawer with event details", () => {
		const store = buildStore([subNewActivity]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);

		// Expand drawer should not be visible initially
		expect(screen.queryByText("Event ID")).not.toBeInTheDocument();

		// Click the row
		fireEvent.click(screen.getByText(/subscribed/i));

		// Expand drawer should now be visible
		expect(screen.getByText("Event ID")).toBeInTheDocument();
		expect(screen.getByText("Actor")).toBeInTheDocument();
		expect(screen.getByText("Created")).toBeInTheDocument();
	});

	it("clicking expanded row collapses drawer", () => {
		const store = buildStore([subNewActivity]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);

		fireEvent.click(screen.getByText(/subscribed/i));
		expect(screen.getByText("Event ID")).toBeInTheDocument();

		// Click again to collapse
		fireEvent.click(screen.getByText(/subscribed/i));
		expect(screen.queryByText("Event ID")).not.toBeInTheDocument();
	});
});

// Sprint 38: Raw JSON toggle + ham JSON dump tamamen kaldırıldı. Önceki
// "raw JSON toggle" ve "maskSensitive on raw JSON" testleri artık geçerli
// değil — onların yerine activity expand artık yalnız human-readable
// summary gösteriyor (Sprint 35 ile eklendi).
describe("ActivityViewModern — expand summary (Sprint 38)", () => {
	it("expand panel renders without any JSON pre block or toggle", () => {
		const store = buildStore([rewardActivity]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);

		fireEvent.click(screen.getByText(/Hydrate/i));

		// JSON toggle button ve <pre class="act-json"> artık DOM'da yok.
		expect(
			document.querySelector("button.act-json-toggle")
		).not.toBeInTheDocument();
		expect(document.querySelector(".act-json")).not.toBeInTheDocument();
	});
});

// ─── Test 6: Accept / Reject reward redemption ───────────────────────────────
describe("ActivityViewModern — reward redemption actions", () => {
	it("Accept button dispatches setActivityStatus with accepted", async () => {
		const store = buildStore([rewardActivity]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);

		// Open drawer
		fireEvent.click(screen.getByText(/Hydrate/i));

		// Wait for scope check to settle
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /Accept reward redemption/i })).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("button", { name: /Accept reward redemption/i }));

		await waitFor(() => {
			expect(mockAcceptRedemptions).toHaveBeenCalled();
		});
	});

	it("Reject button calls rejectChannelRewardRedemptions", async () => {
		const store = buildStore([rewardActivity]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);

		fireEvent.click(screen.getByText(/Hydrate/i));

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /Reject reward redemption/i })).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("button", { name: /Reject reward redemption/i }));

		await waitFor(() => {
			expect(mockRejectRedemptions).toHaveBeenCalled();
		});
	});
});

// ─── Test 7: Bulk gift recipients pill list ───────────────────────────────────
describe("ActivityViewModern — bulk gift recipients", () => {
	it("recipients pill list renders when expanded", () => {
		const store = buildStore([subGiftActivity]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);

		// Open row
		fireEvent.click(screen.getByText(/gifted/i));

		expect(screen.getByText("Recipients")).toBeInTheDocument();
		expect(screen.getByText("alice")).toBeInTheDocument();
		expect(screen.getByText("bob")).toBeInTheDocument();
		expect(screen.getByText("carol")).toBeInTheDocument();
	});
});

// ─── Test 8: KICKs leaderboard sub-tab ───────────────────────────────────────
describe("ActivityViewModern — KICKs leaderboard", () => {
	it("switches to leaderboard tab and shows week entries", async () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);

		// Sprint 7: sub-tab buttons now have role="tab" (a11y improvement)
		fireEvent.click(screen.getByRole("tab", { name: /KICKs Leaderboard/i }));

		await waitFor(() => {
			expect(screen.getByText("alpha")).toBeInTheDocument();
			expect(screen.getByText("beta")).toBeInTheDocument();
		});
	});

	it("switches period tab to Month and shows month entries", async () => {
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);

		// Sprint 7: sub-tab buttons now have role="tab"
		fireEvent.click(screen.getByRole("tab", { name: /KICKs Leaderboard/i }));

		await waitFor(() => {
			expect(screen.getByText("alpha")).toBeInTheDocument();
		});

		// Period tabs also have role="tab"
		fireEvent.click(screen.getByRole("tab", { name: "Month" }));

		await waitFor(() => {
			expect(screen.getByText("gamma")).toBeInTheDocument();
		});
		expect(screen.queryByText("alpha")).not.toBeInTheDocument();
	});

	it("shows scope missing empty state when kicks:read absent", () => {
		(window.electron.kick.getAuthStatus as jest.Mock).mockResolvedValue({
			grantedScopes: [],
			tokenScope: "",
		});
		const store = buildStore([]);
		render(
			<Provider store={store}>
				<ActivityViewModern />
			</Provider>
		);

		// Sprint 7: sub-tab buttons now have role="tab"
		fireEvent.click(screen.getByRole("tab", { name: /KICKs Leaderboard/i }));

		// Scope missing state should eventually appear
		expect(
			screen.getByText(/kicks:read/i)
		).toBeInTheDocument();
	});
});
