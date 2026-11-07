/**
 * MainProcessSocket: main process'teki Kick soketinin renderer vekili.
 * IPC koprusu sahte; olaylarin WebSocket benzeri dinleyicilere ve
 * readyState gecislerine dogru yansidigi denetlenir.
 */
import type { RealtimeSocketEvent } from "../shared/kickRealtime";
import {
	MainProcessSocket,
	SOCKET_CLOSED,
	SOCKET_CLOSING,
	SOCKET_CONNECTING,
	SOCKET_OPEN,
} from "../renderer/util/realtimeSocket";

let emitToRenderer: (event: RealtimeSocketEvent) => void = () => undefined;
const open = jest.fn((_id: string, _url: string) => Promise.resolve());
const send = jest.fn();
const close = jest.fn();

beforeAll(() => {
	(window as any).electron = {
		realtimeSocket: {
			open,
			send,
			close,
			onEvent: (func: (event: RealtimeSocketEvent) => void) => {
				emitToRenderer = func;
				return () => undefined;
			},
		},
	};
});

beforeEach(() => {
	open.mockClear();
	send.mockClear();
	close.mockClear();
});

const lastId = () => open.mock.calls[open.mock.calls.length - 1][0];

describe("MainProcessSocket", () => {
	it("open → mesaj → close akisini dinleyicilere tasir", () => {
		const socket = new MainProcessSocket("wss://realtime.us-east-1.platform.kick.com/connection/websocket");
		const id = lastId();
		const seen: string[] = [];
		socket.addEventListener("open", () => seen.push("open"));
		socket.addEventListener("message", (e) => seen.push(`msg:${e.data}`));
		socket.addEventListener("close", (e) => seen.push(`close:${e.code}`));

		expect(socket.readyState).toBe(SOCKET_CONNECTING);
		socket.send("ignored-before-open");
		expect(send).not.toHaveBeenCalled();

		emitToRenderer({ id, type: "open" });
		expect(socket.readyState).toBe(SOCKET_OPEN);
		socket.send("{}");
		expect(send).toHaveBeenCalledWith(id, "{}");

		emitToRenderer({ id, type: "message", data: "hello" });
		emitToRenderer({ id, type: "close", code: 1000, reason: "" });
		expect(socket.readyState).toBe(SOCKET_CLOSED);
		expect(seen).toEqual(["open", "msg:hello", "close:1000"]);

		// Kapandiktan sonra gelen gec olay yok sayilir.
		emitToRenderer({ id, type: "message", data: "late" });
		expect(seen).toHaveLength(3);
	});

	it("baska soketin olayi bu sokete dokunmaz", () => {
		const first = new MainProcessSocket("wss://a.platform.kick.com/x");
		const firstId = lastId();
		const second = new MainProcessSocket("wss://b.platform.kick.com/x");
		const secondMessages: string[] = [];
		second.addEventListener("message", (e) => secondMessages.push(String(e.data)));
		emitToRenderer({ id: firstId, type: "message", data: "for-first" });
		expect(secondMessages).toEqual([]);
		expect(first.readyState).toBe(SOCKET_CONNECTING);
	});

	it("close bir kez gonderilir, readyState CLOSING olur", () => {
		const socket = new MainProcessSocket("wss://c.platform.kick.com/x");
		const id = lastId();
		emitToRenderer({ id, type: "open" });
		socket.close();
		socket.close();
		expect(close).toHaveBeenCalledTimes(1);
		expect(socket.readyState).toBe(SOCKET_CLOSING);
	});

	it("open reddedilirse error + close yayar", async () => {
		open.mockImplementationOnce(() => Promise.reject(new Error("host not allowed")));
		const socket = new MainProcessSocket("wss://evil.example.com/x");
		const seen: string[] = [];
		socket.addEventListener("error", (e) => seen.push(`error:${e.message}`));
		socket.addEventListener("close", (e) => seen.push(`close:${e.code}`));
		await Promise.resolve();
		await Promise.resolve();
		expect(seen).toEqual(["error:host not allowed", "close:1006"]);
		expect(socket.readyState).toBe(SOCKET_CLOSED);
	});
});
