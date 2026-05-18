/**
 * Minimal 7TV EventAPI v3 WebSocket client.
 *
 * Spec referansi:
 *   wss://events.7tv.io/v3
 *   - HELLO     op=1  (server -> client)
 *   - HEARTBEAT op=2  (server -> client, client echo gerekmiyor; sunucu keepalive)
 *   - DISPATCH  op=0  (server -> client)
 *   - SUBSCRIBE op=35 (client -> server)
 *   - RECONNECT op=4  (server -> client)
 *
 * Bizim ihtiyacimiz sadece `emote_set.update` icin abonelik ve callback.
 * Dispatch alindiginda set_id'ye karsilik gelen kanal icin bundle yenilenir.
 */

type SevenTvEventListener = (payload: {
	type: string;
	body: SevenTvDispatchBody;
}) => void;

interface SevenTvDispatchBody {
	id?: string;
	pushed?: Array<{ key?: string; value?: unknown }>;
	pulled?: Array<{ key?: string; old_value?: unknown }>;
	updated?: Array<{ key?: string; old_value?: unknown; value?: unknown }>;
}

const WS_URL = "wss://events.7tv.io/v3";

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 20000];

class SevenTvEventClient {
	private ws?: WebSocket;
	private status: "idle" | "connecting" | "open" = "idle";
	private subscriptions = new Set<string>();
	private listeners = new Set<SevenTvEventListener>();
	private reconnectAttempt = 0;
	private reconnectTimer?: ReturnType<typeof setTimeout>;
	private intentionallyClosed = false;

	subscribe(setId: string) {
		if (!setId) return;
		this.subscriptions.add(setId);
		this.ensureConnection();
		if (this.status === "open") {
			this.sendSubscribe(setId);
		}
	}

	unsubscribe(setId: string) {
		if (!setId) return;
		this.subscriptions.delete(setId);
		if (this.status === "open" && this.ws) {
			this.send({
				op: 36,
				d: { type: "emote_set.update", condition: { object_id: setId } },
			});
		}
	}

	onDispatch(listener: SevenTvEventListener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	close() {
		this.intentionallyClosed = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = undefined;
		}
		this.subscriptions.clear();
		this.listeners.clear();
		this.ws?.close();
	}

	private ensureConnection() {
		if (this.status !== "idle" || this.ws) return;
		this.intentionallyClosed = false;
		this.status = "connecting";
		try {
			this.ws = new WebSocket(WS_URL);
		} catch (err) {
			this.status = "idle";
			this.scheduleReconnect();
			return;
		}
		this.ws.addEventListener("open", () => {
			this.status = "open";
			this.reconnectAttempt = 0;
			for (const setId of this.subscriptions) {
				this.sendSubscribe(setId);
			}
		});
		this.ws.addEventListener("message", (event) => {
			this.handleMessage(event.data);
		});
		this.ws.addEventListener("close", () => {
			this.status = "idle";
			this.ws = undefined;
			if (!this.intentionallyClosed && this.subscriptions.size > 0) {
				this.scheduleReconnect();
			}
		});
		this.ws.addEventListener("error", () => {
			// "close" event reconnect'i tetikleyecek; burada bir sey yapma
		});
	}

	private scheduleReconnect() {
		const delay =
			RECONNECT_DELAYS[
				Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)
			];
		this.reconnectAttempt += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined;
			this.ensureConnection();
		}, delay);
	}

	private sendSubscribe(setId: string) {
		this.send({
			op: 35,
			d: {
				type: "emote_set.update",
				condition: { object_id: setId },
			},
		});
	}

	private send(payload: unknown) {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		try {
			this.ws.send(JSON.stringify(payload));
		} catch (err) {
			// noop
		}
	}

	private handleMessage(raw: unknown) {
		if (typeof raw !== "string") return;
		let parsed: { op?: number; d?: { type?: string; body?: SevenTvDispatchBody } };
		try {
			parsed = JSON.parse(raw);
		} catch {
			return;
		}
		if (!parsed || typeof parsed !== "object") return;
		switch (parsed.op) {
			case 0: {
				if (!parsed.d?.type) return;
				for (const listener of this.listeners) {
					try {
						listener({
							type: parsed.d.type,
							body: parsed.d.body || {},
						});
					} catch {
						// listener hatalari abone kanali bozmasin
					}
				}
				break;
			}
			case 4: {
				// RECONNECT: sunucu yeniden baglanmamizi istedi
				this.ws?.close();
				break;
			}
			// 1 HELLO, 2 HEARTBEAT, 5 ACK, 6 ERROR, 7 END_OF_STREAM: pasif gec
			default:
				break;
		}
	}
}

export const sevenTvEvents = new SevenTvEventClient();
