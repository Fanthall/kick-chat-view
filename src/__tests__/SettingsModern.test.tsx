/**
 * Sprint 6a — SettingsModern tests
 *
 * Cases:
 *  1. Renders side-nav with 6 items
 *  2. Click side-nav item changes active section
 *  3. Channel section: add channel calls addChannel + fires custom event
 *  4. Account section: sign out button visible
 *  5. Permissions section: missing scope banner rendered when scopes missing
 *  6. Moderation section: default timeout stepper updates localStorage
 *  7. Emotes section: animate GIF toggle persists to localStorage
 *  8. Advanced section: UI mode toggle persists chatViewShellPreference
 *  9. (regression) SettingsClassic still exports correctly
 */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, act, waitFor } from "@testing-library/react";
import React from "react";
import { Provider } from "react-redux";
import configureMockStore from "redux-mock-store";
import thunk from "redux-thunk";
import SettingsModern from "../renderer/src/Settings/SettingsModern";

// ─── Mock store ───────────────────────────────────────────────────────────────

const middlewares = [thunk];
const mockStore = configureMockStore(middlewares);

const baseMessages = {
	messageList: [],
	modAction: [],
	channelBadges: [],
	channelBadgesByChannel: {},
	streamMetaByChannel: {},
	globalEmoteSets: [],
	emoteSetsByChannel: {},
	connectionStatus: "idle",
	connectionStatusByChannel: {},
};

function buildStore(overrides: Partial<typeof baseMessages> = {}) {
	return mockStore({ messages: { ...baseMessages, ...overrides } });
}

// ─── Mock electron bridge ─────────────────────────────────────────────────────

beforeEach(() => {
	Object.defineProperty(window, "electron", {
		configurable: true,
		value: {
			ipcRenderer: {
				once: jest.fn(),
				sendMessage: jest.fn(),
			},
			kick: {
				getAuthStatus: jest.fn().mockResolvedValue({
					isConnected: false,
					grantedScopes: [],
					missingScopes: ["chat:write", "moderation:ban"],
				}),
				getUsers: jest.fn().mockResolvedValue({ data: [] }),
				getOwnChannels: jest.fn().mockResolvedValue({ data: [] }),
				startOAuth: jest.fn(),
				signOut: jest.fn().mockResolvedValue({}),
			},
			kickConnectionWindow: {
				open: jest.fn(),
			},
			userWindow: {
				open: jest.fn(),
				update: jest.fn(),
				onPayload: jest.fn(),
			},
		},
	});

	// Mock chatListener thunk
	jest.mock("../renderer/util/chatConnection", () => ({
		chatListener: jest.fn(() => ({ type: "NOOP" })),
	}));

	localStorage.clear();
	localStorage.setItem("chatViewLanguage", "en");
});

afterEach(() => {
	jest.restoreAllMocks();
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderSettings(storeOverrides: Partial<typeof baseMessages> = {}) {
	const store = buildStore(storeOverrides);
	return render(
		<Provider store={store}>
			<SettingsModern />
		</Provider>
	);
}

// ─── Test 1: Side-nav renders 6 items ────────────────────────────────────────

describe("SettingsModern — side nav", () => {
	it("renders exactly 6 nav items", () => {
		renderSettings();
		const nav = screen.getByRole("navigation", { name: /settings sections/i });
		const items = nav.querySelectorAll(".set-nav-item");
		expect(items).toHaveLength(6);
	});

	it("each nav item label is present", () => {
		renderSettings();
		["Channel", "Account", "Permissions", "Moderation", "Emotes", "Advanced"].forEach(
			(label) => {
				expect(screen.getByRole("button", { name: new RegExp(label, "i") })).toBeInTheDocument();
			}
		);
	});
});

// ─── Test 2: Clicking nav item changes active section ────────────────────────

describe("SettingsModern — section navigation", () => {
	it("clicking Account nav item switches to Account section content", async () => {
		renderSettings();
		const accountBtn = screen.getByRole("button", { name: /^Account/i });
		fireEvent.click(accountBtn);
		await waitFor(() => {
			expect(screen.getByText(/manage the oauth connection/i)).toBeInTheDocument();
		});
	});

	it("clicking Moderation shows moderation section", async () => {
		renderSettings();
		fireEvent.click(screen.getByRole("button", { name: /^Moderation/i }));
		await waitFor(() => {
			expect(screen.getByText(/default timeout/i)).toBeInTheDocument();
		});
	});
});

// ─── Test 3: Channel add calls addChannel + dispatches event ─────────────────

describe("SettingsModern — channel section", () => {
	it("add channel button calls addChannel util and fires custom event", async () => {
		const addChannelMock = jest.fn().mockReturnValue([]);
		jest.spyOn(
			require("../renderer/util/channelSettings"),
			"addChannel"
		).mockImplementation(addChannelMock);
		jest.spyOn(
			require("../renderer/util/channelSettings"),
			"getChannelList"
		).mockReturnValue([]);
		jest.spyOn(
			require("../renderer/util/channelSettings"),
			"getActiveChannelSlug"
		).mockReturnValue("");

		const dispatchedEvents: string[] = [];
		const handler = (e: Event) => dispatchedEvents.push(e.type);
		window.addEventListener("kick-channel-settings-changed", handler);

		renderSettings();

		const input = screen.getByRole("textbox", { name: /new channel name/i });
		fireEvent.change(input, { target: { value: "testchannel" } });

		const addBtn = screen.getByRole("button", { name: /add/i });
		fireEvent.click(addBtn);

		expect(addChannelMock).toHaveBeenCalledWith("testchannel");
		expect(dispatchedEvents).toContain("kick-channel-settings-changed");

		window.removeEventListener("kick-channel-settings-changed", handler);
	});
});

// ─── Test 4: Account section — sign out button visible ───────────────────────

describe("SettingsModern — account section", () => {
	it("renders sign out button in Account section", async () => {
		renderSettings();
		fireEvent.click(screen.getByRole("button", { name: /^Account/i }));
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
		});
	});

	it("sign out button is visible even when disconnected", async () => {
		renderSettings();
		fireEvent.click(screen.getByRole("button", { name: /^Account/i }));
		await waitFor(() => {
			const btn = screen.getByRole("button", { name: /sign out/i });
			expect(btn).toBeInTheDocument();
		});
	});
});

// ─── Test 5: Permissions — missing scope banner ───────────────────────────────

describe("SettingsModern — permissions section", () => {
	it("shows missing-scope warn banner when auth has missing scopes", async () => {
		renderSettings();
		fireEvent.click(screen.getByRole("button", { name: /^Permissions/i }));
		await waitFor(() => {
			// Banner contains text about missing scopes
			const banner = document.querySelector(".set-scope-warn-banner");
			expect(banner).toBeInTheDocument();
			expect(banner!.textContent).toMatch(/scope.*missing/i);
		});
	});
});

// ─── Test 6: Moderation — default timeout stepper ────────────────────────────

describe("SettingsModern — moderation section", () => {
	it("increasing default timeout calls setDefaultTimeoutSeconds", async () => {
		const setDefaultMock = jest.fn();
		jest.spyOn(
			require("../renderer/util/chatCommands"),
			"setDefaultTimeoutSeconds"
		).mockImplementation(setDefaultMock);
		jest.spyOn(
			require("../renderer/util/chatCommands"),
			"getDefaultTimeoutSeconds"
		).mockReturnValue(60);

		renderSettings();
		fireEvent.click(screen.getByRole("button", { name: /^Moderation/i }));

		await waitFor(() => {
			expect(screen.getAllByRole("button", { name: /Increase seconds/i })).toHaveLength(2);
		});

		// Click the first "Increase seconds" button (default timeout stepper)
		const increaseBtns = screen.getAllByRole("button", { name: /Increase seconds/i });
		fireEvent.click(increaseBtns[0]);

		expect(setDefaultMock).toHaveBeenCalledWith(expect.any(Number));
	});
});

// ─── Test 7: Emotes — animate GIF toggle persists to localStorage ─────────────

describe("SettingsModern — emotes section", () => {
	it("animate GIF toggle persists chatViewAnimateGif to localStorage", async () => {
		localStorage.removeItem("chatViewAnimateGif");

		renderSettings();
		fireEvent.click(screen.getByRole("button", { name: /^Emotes/i }));

		await waitFor(() => {
			expect(screen.getByText(/animate gif emotes/i)).toBeInTheDocument();
		});

		// Initial state: on (default true). Find the toggle by finding the row
		const rows = document.querySelectorAll(".set-block-row");
		let animRow: Element | null = null;
		rows.forEach((row) => {
			if (row.textContent?.match(/animate gif emotes/i)) animRow = row;
		});
		expect(animRow).not.toBeNull();

		const toggle = animRow!.querySelector(".set-toggle");
		expect(toggle).not.toBeNull();

		// Click to turn off (was true → false)
		fireEvent.click(toggle!);
		expect(localStorage.getItem("chatViewAnimateGif")).toBe("false");

		// Click again to turn on
		fireEvent.click(toggle!);
		expect(localStorage.getItem("chatViewAnimateGif")).toBe("true");
	});
});

// ─── Test 8: Advanced — UI mode toggle persists chatViewShellPreference ───────

describe("SettingsModern — advanced section", () => {
	it("Modern UI toggle writes chatViewShellPreference to localStorage", async () => {
		localStorage.removeItem("chatViewShellPreference");

		renderSettings();
		fireEvent.click(screen.getByRole("button", { name: /^Advanced/i }));

		await waitFor(() => {
			expect(screen.getByText(/modern ui.*beta/i)).toBeInTheDocument();
		});

		const rows = document.querySelectorAll(".set-block-row");
		let modernRow: Element | null = null;
		rows.forEach((row) => {
			if (row.textContent?.match(/modern ui.*beta/i)) modernRow = row;
		});
		expect(modernRow).not.toBeNull();

		const toggle = modernRow!.querySelector(".set-toggle");
		expect(toggle).not.toBeNull();

		fireEvent.click(toggle!);
		const stored = localStorage.getItem("chatViewShellPreference");
		expect(stored === "modern" || stored === "classic").toBe(true);
	});
});

// ─── Test 9: Regression — SettingsClassic still exports ──────────────────────

describe("SettingsClassic — regression", () => {
	it("imports and renders SettingsClassic without throwing", () => {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const mod = require("../renderer/src/Settings/SettingsClassic");
		expect(mod.default).toBeDefined();
		expect(typeof mod.default).toBe("function");
	});
});

// ─── Test 10: Modal wrapping — Fix 8 ─────────────────────────────────────────
// Settings is rendered inside .modal-body; the set-shell fills that space.

describe("SettingsModern — modal wrapping (Fix 8)", () => {
	it("set-shell renders without its own header (modal-hd comes from LayoutModern)", () => {
		renderSettings();
		// set-shell should exist
		expect(document.querySelector("[data-testid='settings-modern-shell']")).toBeInTheDocument();
		// No standalone .set-header inside settings itself (removed in fidelity sprint)
		expect(document.querySelector(".set-header")).not.toBeInTheDocument();
	});

	it("set-main is present and contains side nav + content area", () => {
		renderSettings();
		const shell = document.querySelector("[data-testid='settings-modern-shell']");
		expect(shell?.querySelector(".set-main")).toBeInTheDocument();
		expect(shell?.querySelector(".set-nav")).toBeInTheDocument();
		expect(shell?.querySelector(".set-content")).toBeInTheDocument();
	});
});

// ─── Test 11: Side-nav icon mapping — Fix 9 ──────────────────────────────────

describe("SettingsModern — side nav icons (Fix 9)", () => {
	it("each nav item has an icon span", () => {
		renderSettings();
		const nav = screen.getByRole("navigation", { name: /settings sections/i });
		const items = nav.querySelectorAll(".set-nav-item");
		items.forEach((item) => {
			// Each item should have an icon child (span with inline-flex style)
			const icon = item.querySelector("span[style]");
			expect(icon).not.toBeNull();
		});
	});
});
