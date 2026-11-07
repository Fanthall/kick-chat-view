import { ipcMain, WebContents } from "electron";
import WebSocket from "ws";
import type { RealtimeSocketEvent } from "../shared/kickRealtime";

// Kick canli soketi main process'te `ws` ile acilir (Origin basligi gonderilmez);
// renderer `MainProcessSocket` vekiliyle konusur. Yalniz Kick'in realtime
// sunucularina baglanti acilir.
const ALLOWED_HOST_SUFFIX = ".platform.kick.com";

interface OwnedSocket {
	ws: WebSocket;
	owner: WebContents;
}

const sockets = new Map<string, OwnedSocket>();
const trackedOwners = new WeakSet<WebContents>();

const emit = (owner: WebContents, event: RealtimeSocketEvent) => {
	if (!owner.isDestroyed()) {
		owner.send("realtime-socket:event", event);
	}
};

const isAllowedUrl = (url: string) => {
	try {
		const parsed = new URL(url);
		return (
			parsed.protocol === "wss:" &&
			parsed.hostname.endsWith(ALLOWED_HOST_SUFFIX)
		);
	} catch {
		return false;
	}
};

const closeOwnedSockets = (owner: WebContents) => {
	for (const [id, entry] of sockets) {
		if (entry.owner === owner) {
			sockets.delete(id);
			entry.ws.terminate();
		}
	}
};

// Pencere kapaninca ya da sayfa yeniden yuklenince (Ctrl+R) eski renderer'in
// soketleri sahipsiz kalmasin.
const trackOwner = (owner: WebContents) => {
	if (trackedOwners.has(owner)) return;
	trackedOwners.add(owner);
	owner.once("destroyed", () => closeOwnedSockets(owner));
	owner.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
		if (isMainFrame && !isInPlace) {
			closeOwnedSockets(owner);
		}
	});
};

export const registerRealtimeSocketIpc = () => {
	ipcMain.handle(
		"realtime-socket:open",
		(event, id: string, url: string) => {
			if (!isAllowedUrl(url)) {
				throw new Error(`Realtime socket host not allowed: ${url}`);
			}
			const owner = event.sender;
			trackOwner(owner);
			sockets.get(id)?.ws.terminate();
			const ws = new WebSocket(url);
			sockets.set(id, { ws, owner });
			ws.on("open", () => emit(owner, { id, type: "open" }));
			ws.on("message", (data) =>
				emit(owner, { id, type: "message", data: data.toString() })
			);
			ws.on("error", (err) =>
				emit(owner, { id, type: "error", message: err.message })
			);
			ws.on("close", (code, reason) => {
				if (sockets.get(id)?.ws === ws) {
					sockets.delete(id);
				}
				emit(owner, { id, type: "close", code, reason: reason.toString() });
			});
		}
	);

	ipcMain.on("realtime-socket:send", (event, id: string, data: string) => {
		const entry = sockets.get(id);
		if (
			!entry ||
			entry.owner !== event.sender ||
			entry.ws.readyState !== WebSocket.OPEN
		) {
			return;
		}
		entry.ws.send(data);
	});

	ipcMain.on("realtime-socket:close", (event, id: string) => {
		const entry = sockets.get(id);
		if (!entry || entry.owner !== event.sender) return;
		entry.ws.close();
	});
};
