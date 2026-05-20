import { GiftSubMessage, SubMessage } from "./chatInterface";

// WI-1.5 — Pusher legacy event akisi (CONSTRAINT-3 korunmali) icin enrichment helper.
//
// chatConnection.ts uzerinden Pusher `App\\Events\\SubscriptionEvent` ve
// `App\\Events\\GiftedSubscriptionsEvent` payload'lari dispatch edilirken bu helper
// `eventType` etiketi + (varsa) `expiresAt` epoch ms + anonymous gifter tespiti ekler.
// Eski payload tuketicileri (mevcut reducer) yeni alanlari ignore eder; yeni UI ise
// Candidate A normalizer'i ile uretilenler ile ayni `eventType` field'i uzerinden filtreleyebilir.
//
// Kontrat:
// - Asla legacy alan SILMEZ (gifted_usernames, gifter_username, months, streak korunur).
// - Yeni alanlarin hepsi optional. Tip kontrolu: SubMessage / GiftSubMessage extended.
// - Anonymous tespiti gift-event'inde gifter_username "anonymous" (case-insensitive)
//   veya bos string oldugunda flag set edilir.

const ANON_RE = /^anonymous$/i;

const parseExpiresAtIso = (value: unknown): number | undefined => {
	if (value == null) return undefined;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const t = new Date(value).getTime();
		return Number.isFinite(t) ? t : undefined;
	}
	return undefined;
};

export interface LegacySubscriptionPayload extends SubMessage {
	// Pusher SubscriptionEvent bazi kanallarda `expires_at` ISO string ile gelir.
	expires_at?: string | number;
}

export interface LegacyGiftedSubscriptionsPayload extends GiftSubMessage {
	expires_at?: string | number;
	is_anonymous?: boolean;
}

export const enrichLegacySubscriptionPayload = (
	payload: LegacySubscriptionPayload
): SubMessage => {
	const expiresAt = parseExpiresAtIso(
		payload.expiresAt ?? (payload as any)?.expires_at
	);
	return {
		...payload,
		eventType: "App\\Events\\SubscriptionEvent",
		expiresAt,
	};
};

export const enrichLegacyGiftedSubscriptionsPayload = (
	payload: LegacyGiftedSubscriptionsPayload
): GiftSubMessage => {
	const gifter = payload.gifter_username || "";
	const inferredAnon =
		payload.is_anonymous === true ||
		gifter.trim().length === 0 ||
		ANON_RE.test(gifter.trim());
	const expiresAt = parseExpiresAtIso(
		payload.expiresAt ?? (payload as any)?.expires_at
	);
	return {
		...payload,
		eventType: "App\\Events\\GiftedSubscriptionsEvent",
		expiresAt,
		anonymous: inferredAnon || undefined,
	};
};

// Mod / Host event'leri SubMessage/GiftSubMessage shape'inde DEGIL — onlar
// reducer'da `ModMessage` ile yonetiliyor. Eng-lead notu: tag amacli icin event
// adlarini kayit altinda tutuyoruz; ileride ModMessage genisletilirse ek bridge eklenir.

export const LEGACY_MOD_EVENT_TYPE = "App\\Events\\UserBannedEvent";
export const LEGACY_UNBAN_EVENT_TYPE = "App\\Events\\UserUnbannedEvent";
export const LEGACY_HOST_EVENT_TYPE = "App\\Events\\StreamHostEvent";
