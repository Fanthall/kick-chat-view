/**
 * Sprint 12 — UserWindow unit tests (6 cases)
 *
 * Cases:
 * 1. Renders user header with avatar initials + username
 * 2. Stats row shows session message count from payload
 * 3. Ban button visible when no ban in history
 * 4. Unban button visible when last mod action is "ban"
 * 5. Custom seconds input clears preset and updates duration label
 * 6. Apply timeout calls kick.timeoutUser with correct duration
 */

import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import UserWindow from "../renderer/src/UserWindow/UserWindow";
import type { UserWindowPayload } from "../shared/userWindow";
import type { ModMessage, UserMessage } from "../renderer/util/chatInterface";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("moment", () => {
	const m = (d: any) => ({ format: () => "12:34" });
	(m as any).default = m;
	return m;
});

jest.mock("react-toastify", () => ({
	toast: jest.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const baseUser = {
	id: 7,
	username: "SyUser",
	slug: "syuser",
	identity: {
		color: "#9b59b6",
		badges: [{ type: "subscriber", text: "Sub", count: 3 }],
	},
};

function makeMsg(overrides: Partial<UserMessage> = {}): UserMessage {
	return {
		id: `msg-${Math.random()}`,
		channelSlug: "testchan",
		chatroom_id: 1,
		content: "Hello chat",
		type: "message",
		created_at: new Date().toISOString(),
		sender: baseUser,
		...overrides,
	};
}

function makeModAction(
	type: ModMessage["type"],
	overrides: Partial<ModMessage> = {}
): ModMessage {
	return {
		id: `mod-${Math.random()}`,
		type,
		channelSlug: "testchan",
		status: "success",
		user: baseUser,
		created_at: Date.now(),
		banned_by: type === "ban" || type === "to" ? {
			id: 1, username: "mod1", slug: "mod1",
			identity: { color: "#fff", badges: [] },
		} : undefined,
		unbanned_by: type === "unban" ? {
			id: 1, username: "mod1", slug: "mod1",
			identity: { color: "#fff", badges: [] },
		} : undefined,
		...overrides,
	};
}

function makePayload(overrides: Partial<UserWindowPayload> = {}): UserWindowPayload {
	return {
		key: "testchan:syuser",
		channelName: "testchan",
		canModerateChannel: true,
		openedFrom: "chat",
		user: baseUser,
		messages: [],
		modActions: [],
		updatedAt: Date.now(),
		...overrides,
	};
}

function makeElectronMock(payload?: UserWindowPayload) {
	let _cb: ((p: UserWindowPayload) => void) | null = null;
	return {
		ipcRenderer: { once: jest.fn(), sendMessage: jest.fn() },
		kick: {
			getAuthStatus: jest.fn().mockResolvedValue({
				grantedScopes: ["moderation:ban", "moderation:chat_message:manage"],
			}),
			getChannelBySlug: jest.fn().mockResolvedValue({
				data: [{ broadcaster_user_id: 9000 }],
			}),
			timeoutUser: jest.fn().mockResolvedValue({}),
			banUser: jest.fn().mockResolvedValue({}),
			unbanUser: jest.fn().mockResolvedValue({}),
			deleteChatMessage: jest.fn().mockResolvedValue({}),
			sendChatMessage: jest.fn().mockResolvedValue({}),
		},
		userWindow: {
			open: jest.fn(),
			update: jest.fn(),
			onPayload: jest.fn().mockImplementation((cb: (p: UserWindowPayload) => void) => {
				_cb = cb;
				// fire immediately if payload provided
				if (payload) cb(payload);
				return () => {};
			}),
		},
		kickConnectionWindow: { open: jest.fn() },
	};
}

function renderWithPayload(payload: UserWindowPayload) {
	const mock = makeElectronMock(payload);
	(window as any).electron = mock;
	render(<UserWindow />);
	return { mock };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("UserWindow (Sprint 12)", () => {
	beforeEach(() => {
		// Clear localStorage notes between tests
		localStorage.clear();
		// Sprint 23 fix: pin language to "en" so test assertions match.
		localStorage.setItem("chatViewLanguage", "en");
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it("renders avatar initials and username from payload", async () => {
		renderWithPayload(makePayload());

		// Avatar shows first 2 chars uppercase
		expect(screen.getByText("SY")).toBeInTheDocument();
		// Username rendered
		expect(screen.getByText("SyUser")).toBeInTheDocument();
	});

	it("stats row shows session message count", async () => {
		const messages = [makeMsg(), makeMsg(), makeMsg()];
		renderWithPayload(makePayload({ messages }));

		// The first stat cell should display count 3
		const statNums = screen.getAllByText("3");
		expect(statNums.length).toBeGreaterThanOrEqual(1);
	});

	it("shows Ban permanently button when user has no ban in history", async () => {
		// Give browser_id via mock so mod panel renders
		const { mock } = renderWithPayload(
			makePayload({ modActions: [], canModerateChannel: true })
		);

		// Wait for scope resolution
		await waitFor(() => {
			expect(mock.kick.getChannelBySlug).toHaveBeenCalled();
		});
		await waitFor(() => {
			expect(screen.getByText("Ban permanently")).toBeInTheDocument();
		});
		expect(screen.queryByText("Unban")).not.toBeInTheDocument();
	});

	it("shows Unban button when last relevant mod action is ban", async () => {
		const { mock } = renderWithPayload(
			makePayload({
				modActions: [makeModAction("ban")],
				canModerateChannel: true,
			})
		);

		await waitFor(() => {
			expect(mock.kick.getChannelBySlug).toHaveBeenCalled();
		});
		await waitFor(() => {
			expect(screen.getByText("Unban")).toBeInTheDocument();
		});
		expect(screen.queryByText("Ban permanently")).not.toBeInTheDocument();
	});

	it("custom seconds input clears preset and updates duration display", async () => {
		const { mock } = renderWithPayload(
			makePayload({ canModerateChannel: true })
		);

		await waitFor(() => {
			expect(mock.kick.getChannelBySlug).toHaveBeenCalled();
		});
		await waitFor(() => {
			expect(screen.getByPlaceholderText("custom")).toBeInTheDocument();
		});

		const input = screen.getByPlaceholderText("custom") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "90" } });

		// Duration display should now show "90s"
		await waitFor(() => {
			expect(screen.getByText("90s")).toBeInTheDocument();
		});
	});

	it("Apply timeout calls kick.timeoutUser with custom duration", async () => {
		const { mock } = renderWithPayload(
			makePayload({ canModerateChannel: true })
		);

		await waitFor(() => {
			expect(mock.kick.getChannelBySlug).toHaveBeenCalled();
		});
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /^Apply$/i })).toBeInTheDocument();
		});

		// Set custom duration
		const input = screen.getByPlaceholderText("custom") as HTMLInputElement;
		fireEvent.change(input, { target: { value: "120" } });

		const applyBtn = screen.getByRole("button", { name: /^Apply$/i });
		await act(async () => {
			fireEvent.click(applyBtn);
		});

		await waitFor(() => {
			expect(mock.kick.timeoutUser).toHaveBeenCalledWith(
				expect.objectContaining({ duration: 120 })
			);
		});
	});
});
