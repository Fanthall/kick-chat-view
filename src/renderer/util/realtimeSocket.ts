import type { RealtimeSocketEvent } from "../../shared/kickRealtime";

/**
 * Kick canli soketinin renderer tarafindaki vekili. Asil soket main process'te
 * (`src/main/realtimeSocket.ts`); bu sinif WebSocket'in bizim kullandigimiz alt
 * kumesini taklit eder: readyState, send, close ve open/message/close/error.
 */
export const SOCKET_CONNECTING = 0;
export const SOCKET_OPEN = 1;
export const SOCKET_CLOSING = 2;
export const SOCKET_CLOSED = 3;

type SocketEventType = "open" | "message" | "close" | "error";
type SocketListener = (event: { data?: string; code?: number; reason?: string; message?: string }) => void;

const liveSockets = new Map<string, MainProcessSocket>();
let bridgeInstalled = false;
let socketCounter = 0;

const installBridge = () => {
	if (bridgeInstalled) return;
	bridgeInstalled = true;
	window.electron.realtimeSocket.onEvent((event) => {
		liveSockets.get(event.id)?.handleEvent(event);
	});
};

export class MainProcessSocket {
	readyState = SOCKET_CONNECTING;

	private readonly id: string;

	private readonly listeners: Record<SocketEventType, Set<SocketListener>> = {
		open: new Set(),
		message: new Set(),
		close: new Set(),
		error: new Set(),
	};

	constructor(url: string) {
		installBridge();
		socketCounter += 1;
		this.id = `rt-${Date.now()}-${socketCounter}`;
		liveSockets.set(this.id, this);
		window.electron.realtimeSocket.open(this.id, url).catch((err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			this.handleEvent({ id: this.id, type: "error", message });
			this.handleEvent({ id: this.id, type: "close", code: 1006, reason: message });
		});
	}

	addEventListener(type: SocketEventType, listener: SocketListener) {
		this.listeners[type].add(listener);
	}

	// Acik degilse sessizce yok sayilir; cagiranlar zaten readyState'e bakar.
	send(data: string) {
		if (this.readyState !== SOCKET_OPEN) return;
		window.electron.realtimeSocket.send(this.id, data);
	}

	close() {
		if (this.readyState === SOCKET_CLOSING || this.readyState === SOCKET_CLOSED) {
			return;
		}
		this.readyState = SOCKET_CLOSING;
		window.electron.realtimeSocket.close(this.id);
	}

	handleEvent(event: RealtimeSocketEvent) {
		if (this.readyState === SOCKET_CLOSED) return;
		switch (event.type) {
			case "open":
				if (this.readyState === SOCKET_CONNECTING) {
					this.readyState = SOCKET_OPEN;
				}
				this.emit("open", {});
				break;
			case "message":
				this.emit("message", { data: event.data });
				break;
			case "error":
				this.emit("error", { message: event.message });
				break;
			case "close":
				this.readyState = SOCKET_CLOSED;
				liveSockets.delete(this.id);
				this.emit("close", { code: event.code, reason: event.reason });
				break;
			default:
				break;
		}
	}

	private emit(type: SocketEventType, payload: Parameters<SocketListener>[0]) {
		this.listeners[type].forEach((listener) => {
			try {
				listener(payload);
			} catch (err) {
				console.log("Realtime socket listener failed", type, err);
			}
		});
	}
}
