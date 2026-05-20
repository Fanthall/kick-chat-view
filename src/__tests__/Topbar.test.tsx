/**
 * Topbar tests — Fidelity sprint coverage for LayoutModern topbar.
 *
 * Cases:
 * 1. Avatar renders first letter of active channel
 * 2. LIVE pill shows when streamMeta.isLive = true
 * 3. LIVE pill hidden when not live
 * 4. + button opens AddChannelPopover
 * 5. Stats row shows viewers, uptime placeholder, category
 * 6. All 5 right action buttons have aria-label
 * 7. Settings button opens settings modal
 * 8. Click modal scrim closes settings modal
 * 9. Escape closes settings modal
 */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, act, waitFor } from "@testing-library/react";
import React from "react";
import { Provider } from "react-redux";
import configureMockStore from "redux-mock-store";
import thunk from "redux-thunk";
import LayoutModern from "../renderer/src/Layout/LayoutModern";

const middlewares = [thunk];
const mockStore = configureMockStore(middlewares);

const baseMessages = {
	messageList: [],
	activityList: [],
	modAction: [],
	channelBadges: [],
	channelBadgesByChannel: {},
	streamMetaByChannel: {},
	globalEmoteSets: [],
	emoteSetsByChannel: {},
	connectionStatus: "idle",
	connectionStatusByChannel: {},
	hostInfo: [],
	kicksLeaderboardByChannel: {},
};

function buildStore(overrides: Partial<typeof baseMessages> = {}) {
	return mockStore({ messages: { ...baseMessages, ...overrides } });
}

// ─── Mock electron ────────────────────────────────────────────────────────────
beforeEach(() => {
	Object.defineProperty(window, "electron", {
		configurable: true,
		value: {
			ipcRenderer: { once: jest.fn(), sendMessage: jest.fn() },
			kick: {
				getAuthStatus: jest.fn().mockResolvedValue({ isConnected: false, grantedScopes: [] }),
				getUsers: jest.fn().mockResolvedValue({ data: [] }),
				getOwnChannels: jest.fn().mockResolvedValue({ data: [] }),
				getChannelBySlug: jest.fn().mockResolvedValue({ data: null }),
				getLivestream: jest.fn().mockResolvedValue({ data: null }),
				getChannelData: jest.fn().mockResolvedValue({ data: null }),
			},
			kickConnectionWindow: { open: jest.fn() },
			userWindow: { open: jest.fn(), update: jest.fn(), onPayload: jest.fn() },
		},
	});

	// Mock localStorage with active channel
	localStorage.setItem("channelName", "testchannel");

	jest.spyOn(
		require("../renderer/util/channelSettings"),
		"getActiveChannelSlug"
	).mockReturnValue("testchannel");

	jest.spyOn(
		require("../renderer/util/channelSettings"),
		"getChannelList"
	).mockReturnValue([{ slug: "testchannel", autoConnect: true }]);
});

afterEach(() => {
	jest.restoreAllMocks();
	localStorage.clear();
});

function renderLayout(storeOverrides: Partial<typeof baseMessages> = {}) {
	const store = buildStore(storeOverrides);
	return render(
		<Provider store={store}>
			<LayoutModern />
		</Provider>
	);
}

// ─── Test 1: Avatar renders first letter ──────────────────────────────────────
describe("Topbar — avatar", () => {
	it("renders first letter of active channel slug uppercased", () => {
		renderLayout();
		const ava = screen.getByTestId("tb-avatar");
		expect(ava.textContent).toBe("T");
	});
});

// ─── Test 2+3: LIVE badge ─────────────────────────────────────────────────────
describe("Topbar — LIVE badge", () => {
	it("shows LIVE badge when streamMeta.isLive is true", () => {
		renderLayout({
			streamMetaByChannel: {
				testchannel: {
					channelSlug: "testchannel",
					isLive: true,
					viewerCount: 100,
					updatedAt: Date.now(),
				},
			},
		});
		expect(screen.getByTestId("tb-live-badge")).toBeInTheDocument();
	});

	it("hides LIVE badge when stream is not live", () => {
		renderLayout({
			streamMetaByChannel: {
				testchannel: {
					channelSlug: "testchannel",
					isLive: false,
					updatedAt: Date.now(),
				},
			},
		});
		expect(screen.queryByTestId("tb-live-badge")).not.toBeInTheDocument();
	});
});

// ─── Test 4: + button opens AddChannelPopover ─────────────────────────────────
describe("Topbar — + button", () => {
	it("clicking + button opens AddChannelPopover", async () => {
		renderLayout();
		const addBtn = screen.getByTestId("tb-add-btn");
		fireEvent.click(addBtn);
		await waitFor(() => {
			expect(screen.getByRole("dialog", { name: /add a channel/i })).toBeInTheDocument();
		});
	});
});

// ─── Test 5: Stats row ────────────────────────────────────────────────────────
describe("Topbar — stats row", () => {
	it("shows viewers formatted", () => {
		renderLayout({
			streamMetaByChannel: {
				testchannel: {
					channelSlug: "testchannel",
					isLive: true,
					viewerCount: 1234,
					updatedAt: Date.now(),
				},
			},
		});
		expect(screen.getByTestId("tb-viewers").textContent).toBe("1,234");
	});

	it("shows '--' uptime when not live", () => {
		renderLayout();
		expect(screen.getByTestId("tb-uptime").textContent).toBe("--");
	});

	it("shows category name from streamMeta", () => {
		renderLayout({
			streamMetaByChannel: {
				testchannel: {
					channelSlug: "testchannel",
					isLive: true,
					viewerCount: 0,
					category: { id: 1, name: "Just Chatting" },
					updatedAt: Date.now(),
				},
			},
		});
		expect(screen.getByTestId("tb-category").textContent).toBe("Just Chatting");
	});
});

// ─── Test 6: Right action buttons aria-labels ─────────────────────────────────
describe("Topbar — action buttons a11y", () => {
	it("all 5 right action buttons have aria-label", () => {
		renderLayout();
		const actionsDiv = screen.getByTestId("tb-actions");
		const buttons = actionsDiv.querySelectorAll("button[aria-label]");
		expect(buttons.length).toBeGreaterThanOrEqual(5);
		const labels = Array.from(buttons).map((b) => b.getAttribute("aria-label"));
		expect(labels).toContain("Toggle activity panel");
		expect(labels).toContain("Toggle moderation panel");
		expect(labels).toContain("Open emote picker");
		expect(labels).toContain("Refresh channel data");
		expect(labels).toContain("Open settings");
	});
});

// ─── Test 7+8+9: Settings modal ───────────────────────────────────────────────
describe("Topbar — settings modal", () => {
	it("settings button opens settings modal", async () => {
		renderLayout();
		fireEvent.click(screen.getByTestId("tb-btn-settings"));
		await waitFor(() => {
			expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
		});
	});

	it("click on scrim closes settings modal", async () => {
		renderLayout();
		fireEvent.click(screen.getByTestId("tb-btn-settings"));
		await waitFor(() => {
			expect(screen.getByTestId("settings-modal-scrim")).toBeInTheDocument();
		});
		fireEvent.click(screen.getByTestId("settings-modal-scrim"));
		await waitFor(() => {
			expect(screen.queryByTestId("settings-modal")).not.toBeInTheDocument();
		});
	});

	it("Escape key closes settings modal", async () => {
		renderLayout();
		fireEvent.click(screen.getByTestId("tb-btn-settings"));
		await waitFor(() => {
			expect(screen.getByTestId("settings-modal")).toBeInTheDocument();
		});
		fireEvent.keyDown(document, { key: "Escape" });
		await waitFor(() => {
			expect(screen.queryByTestId("settings-modal")).not.toBeInTheDocument();
		});
	});
});
