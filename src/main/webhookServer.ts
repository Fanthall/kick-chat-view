/**
 * Sprint 40 — Local webhook receiver for Kick events (kicks.gifted etc.).
 *
 * Kick public events API webhook-only. App "https://api.kick.com/public/v1/events/subscriptions"
 * endpoint'ine subscribe olur ve kullanıcının tünel (ngrok / cloudflare-tunnel)
 * üstünden gelen POST'ları bu local HTTP server karşılar:
 *
 *   POST http://localhost:<port>/webhook/kick
 *
 * Signature verify:
 *   - sigInput = Kick-Event-Message-Id "." Kick-Event-Message-Timestamp "." raw_body
 *   - RSA-SHA256(sigInput) → base64. Public key: GET /public/v1/public-key.
 *
 * Replay protection:
 *   - Kick-Event-Message-Id ULID; 5 dk aynı id reddedilir.
 *   - Timestamp +/- 5 dk dışında reddedilir.
 *
 * Dispatch:
 *   - Doğrulanan event → mainWindow.webContents.send("webhook:event", payload)
 *   - Renderer tarafı normalizeKickWebhookActivity ile activity/chat'e dispatch.
 *
 * CONSTRAINT-3 / CONSTRAINT-4 etkisi yok: yeni kanal, mevcut Pusher akışı
 * korunur.
 */

import http from "http";
import crypto from "crypto";
import { BrowserWindow } from "electron";

export const WEBHOOK_PORT_DEFAULT = 18292;
export const WEBHOOK_PATH = "/webhook/kick";
const PUBLIC_KEY_URL = "https://api.kick.com/public/v1/public-key";
const REPLAY_TTL_MS = 5 * 60 * 1000;
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

let server: http.Server | undefined;
let cachedPublicKey: crypto.KeyObject | undefined;
let cachedPublicKeyAt = 0;
const PUBLIC_KEY_TTL_MS = 60 * 60 * 1000; // 1 hour
const seenMessageIds = new Map<string, number>();

const log = (...args: unknown[]) => {
	if (process.env.NODE_ENV !== "production") {
		console.log("[webhook]", ...args);
	}
};

const fetchPublicKey = async (): Promise<crypto.KeyObject | undefined> => {
	const now = Date.now();
	if (cachedPublicKey && now - cachedPublicKeyAt < PUBLIC_KEY_TTL_MS) {
		return cachedPublicKey;
	}
	try {
		// Node 18+ has global fetch (Electron 26 bundles Node 18).
		const res = await fetch(PUBLIC_KEY_URL);
		if (!res.ok) {
			log("public-key fetch failed", res.status);
			return undefined;
		}
		const json: any = await res.json();
		// Kick docs imply the key is delivered as PEM either as plain text or
		// inside a JSON envelope. Accept several shapes.
		const pem: string | undefined =
			typeof json === "string"
				? json
				: json?.data?.public_key ||
				  json?.public_key ||
				  json?.data?.key ||
				  json?.key;
		if (!pem) {
			log("public-key payload shape unrecognised", json);
			return undefined;
		}
		cachedPublicKey = crypto.createPublicKey(pem);
		cachedPublicKeyAt = now;
		return cachedPublicKey;
	} catch (err) {
		log("public-key fetch error", err);
		return undefined;
	}
};

const cleanReplayCache = () => {
	const cutoff = Date.now() - REPLAY_TTL_MS;
	for (const [id, ts] of seenMessageIds) {
		if (ts < cutoff) seenMessageIds.delete(id);
	}
};

const readBody = (req: http.IncomingMessage): Promise<string> =>
	new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});

export interface WebhookEventPayload {
	eventType: string;
	messageId: string;
	subscriptionId?: string;
	timestamp: string;
	payload: unknown;
	verified: boolean;
}

const dispatchEventToRenderer = (
	payload: WebhookEventPayload,
	mainWindow: BrowserWindow | null
) => {
	if (!mainWindow || mainWindow.isDestroyed()) return;
	mainWindow.webContents.send("webhook:event", payload);
};

export const startWebhookServer = (
	mainWindowGetter: () => BrowserWindow | null,
	port: number = WEBHOOK_PORT_DEFAULT
): Promise<void> =>
	new Promise((resolve, reject) => {
		if (server) {
			log("server already running");
			resolve();
			return;
		}
		server = http.createServer(async (req, res) => {
			// Health check
			if (req.method === "GET" && req.url === "/health") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true, path: WEBHOOK_PATH }));
				return;
			}
			if (req.method !== "POST" || req.url !== WEBHOOK_PATH) {
				res.writeHead(404);
				res.end("not found");
				return;
			}
			try {
				const rawBody = await readBody(req);
				const messageId =
					(req.headers["kick-event-message-id"] as string) || "";
				const timestamp =
					(req.headers["kick-event-message-timestamp"] as string) || "";
				const signature =
					(req.headers["kick-event-signature"] as string) || "";
				const eventType =
					(req.headers["kick-event-type"] as string) || "unknown";
				const subscriptionId =
					(req.headers["kick-event-subscription-id"] as string) ||
					undefined;

				// Replay-protect timestamp
				const tsMs = Date.parse(timestamp);
				if (!Number.isFinite(tsMs)) {
					res.writeHead(400);
					res.end("bad timestamp");
					return;
				}
				if (Math.abs(Date.now() - tsMs) > TIMESTAMP_TOLERANCE_MS) {
					log("timestamp out of tolerance", { timestamp });
					res.writeHead(401);
					res.end("stale");
					return;
				}

				// Idempotency
				cleanReplayCache();
				if (messageId && seenMessageIds.has(messageId)) {
					res.writeHead(200);
					res.end("duplicate");
					return;
				}
				if (messageId) seenMessageIds.set(messageId, Date.now());

				// Signature verify (best-effort — public key fetch hatasında
				// verified=false dispatch, kullanıcı verbose-log'da görebilsin).
				let verified = false;
				try {
					const publicKey = await fetchPublicKey();
					if (publicKey && signature && messageId && timestamp) {
						const sigInput = `${messageId}.${timestamp}.${rawBody}`;
						verified = crypto.verify(
							"sha256",
							Buffer.from(sigInput, "utf8"),
							publicKey,
							Buffer.from(signature, "base64")
						);
					}
				} catch (verErr) {
					log("signature verify error", verErr);
				}

				let payloadParsed: unknown = {};
				try {
					payloadParsed = JSON.parse(rawBody || "{}");
				} catch {
					/* leave as empty */
				}

				const event: WebhookEventPayload = {
					eventType,
					messageId,
					subscriptionId,
					timestamp,
					payload: payloadParsed,
					verified,
				};
				dispatchEventToRenderer(event, mainWindowGetter());

				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: true, verified }));
			} catch (err) {
				log("handler error", err);
				res.writeHead(500);
				res.end("error");
			}
		});

		server.on("error", (err) => {
			log("server error", err);
			reject(err);
		});

		server.listen(port, "127.0.0.1", () => {
			log("webhook server listening on", `http://127.0.0.1:${port}${WEBHOOK_PATH}`);
			resolve();
		});
	});

export const stopWebhookServer = (): Promise<void> =>
	new Promise((resolve) => {
		if (!server) {
			resolve();
			return;
		}
		server.close(() => {
			server = undefined;
			resolve();
		});
	});

export const getWebhookReceiverInfo = (
	port: number = WEBHOOK_PORT_DEFAULT
) => ({
	port,
	path: WEBHOOK_PATH,
	localUrl: `http://localhost:${port}${WEBHOOK_PATH}`,
});
