/**
 * AddChannelPopover tests — Fidelity sprint.
 *
 * Cases:
 * 1. Renders when open=true
 * 2. Does not render when open=false
 * 3. Clicking Cancel calls onClose
 * 4. Typing + clicking Add calls addChannel and dispatches event
 * 5. Empty input shows error message, does not call addChannel
 */

import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { Provider } from "react-redux";
import configureMockStore from "redux-mock-store";
import thunk from "redux-thunk";
import AddChannelPopover from "../renderer/src/Layout/AddChannelPopover";

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
	hostInfo: [],
};

function buildStore() {
	return mockStore({ messages: baseMessages });
}

beforeEach(() => {
	localStorage.setItem("chatViewLanguage", "en");
	Object.defineProperty(window, "electron", {
		configurable: true,
		value: {
			ipcRenderer: { once: jest.fn(), sendMessage: jest.fn() },
			kick: {
				getAuthStatus: jest.fn().mockResolvedValue({ isConnected: false }),
				getUsers: jest.fn().mockResolvedValue({ data: [] }),
			},
			kickConnectionWindow: { open: jest.fn() },
			userWindow: { open: jest.fn(), update: jest.fn(), onPayload: jest.fn() },
		},
	});
});

afterEach(() => {
	jest.restoreAllMocks();
});

function renderPopover(open: boolean, onClose = jest.fn()) {
	const store = buildStore();
	return { onClose, ...render(
		<Provider store={store}>
			<div style={{ position: "relative" }}>
				<AddChannelPopover open={open} onClose={onClose} />
			</div>
		</Provider>
	)};
}

// ─── Test 1: renders when open ────────────────────────────────────────────────
describe("AddChannelPopover", () => {
	it("renders dialog when open=true", () => {
		renderPopover(true);
		expect(screen.getByRole("dialog", { name: /add a channel/i })).toBeInTheDocument();
	});

	it("does not render when open=false", () => {
		renderPopover(false);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("Cancel button calls onClose", () => {
		const { onClose } = renderPopover(true);
		fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("input + Add calls addChannel util and fires event", async () => {
		const addChannelMock = jest.fn().mockReturnValue([]);
		jest.spyOn(
			require("../renderer/util/channelSettings"),
			"addChannel"
		).mockImplementation(addChannelMock);
		jest.spyOn(
			require("../renderer/util/channelSettings"),
			"setActiveChannelSlug"
		).mockImplementation(jest.fn());

		const dispatchedEvents: string[] = [];
		const handler = (e: Event) => dispatchedEvents.push(e.type);
		window.addEventListener("kick-channel-settings-changed", handler);

		renderPopover(true);
		const input = screen.getByRole("textbox", { name: /channel handle or url/i });
		fireEvent.change(input, { target: { value: "mychannel" } });
		fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

		expect(addChannelMock).toHaveBeenCalledWith("mychannel");
		expect(dispatchedEvents).toContain("kick-channel-settings-changed");

		window.removeEventListener("kick-channel-settings-changed", handler);
	});

	it("empty input shows validation error and does not call addChannel", () => {
		const addChannelMock = jest.fn().mockReturnValue([]);
		jest.spyOn(
			require("../renderer/util/channelSettings"),
			"addChannel"
		).mockImplementation(addChannelMock);

		renderPopover(true);
		fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(addChannelMock).not.toHaveBeenCalled();
	});
});
