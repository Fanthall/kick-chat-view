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

// FIX-4: Kick `SubscriptionEvent` payload'unda months/streak bazen string
// ("3") bazen number (3) gelebiliyor. FIX-1 renewal tespiti `months > 1`
// karşılaştırmasına dayandığı için burada sayıya normalize ediyoruz; geçersiz
// değer undefined kalır (reducer konservatif "yeni" varsayar).
const coerceCount = (value: unknown): number | undefined => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		return Number.isFinite(n) ? n : undefined;
	}
	return undefined;
};

export const enrichLegacySubscriptionPayload = (
	payload: LegacySubscriptionPayload
): SubMessage => {
	const expiresAt = parseExpiresAtIso(
		payload.expiresAt ?? (payload as any)?.expires_at
	);
	const months = coerceCount(payload.months);
	const streak = coerceCount(payload.streak);
	return {
		...payload,
		months: months as number,
		streak,
		eventType: "App\\Events\\SubscriptionEvent",
		expiresAt,
	};
};

// FIX-GIFT (H1): Kick `GiftedSubscriptionsEvent` payload shape kanala/sürüme göre
// değişiyor. Alıcı listesi `gifted_usernames` yerine `usernames`,
// `gifted_users[].username` veya tekil `gifted_username` ile gelebiliyor.
// gifter da `gifter_username` yerine `gifter.username` altında olabiliyor.
// Reducer `gifted_usernames.length/.map` çağırdığı için undefined olursa THROW
// → dıştaki try/catch yutuyordu → gift HİÇ görünmüyordu. Burada tek bir güvenli
// `string[]`'e normalize ediyoruz.
const normalizeGiftedUsernames = (payload: any): string[] => {
	const candidates: unknown[] = [
		payload?.gifted_usernames,
		payload?.usernames,
		payload?.gifted_users,
		payload?.recipients,
	];
	for (const c of candidates) {
		if (Array.isArray(c)) {
			const list = c
				.map((entry) =>
					typeof entry === "string"
						? entry
						: entry?.username || entry?.slug || entry?.name
				)
				.filter((u: unknown): u is string => typeof u === "string" && u.trim() !== "");
			if (list.length > 0) return list;
		}
	}
	// Tekil alıcı varyantları.
	const single =
		payload?.gifted_username ||
		payload?.username ||
		payload?.recipient?.username;
	if (typeof single === "string" && single.trim() !== "") return [single];
	return [];
};

export const enrichLegacyGiftedSubscriptionsPayload = (
	payload: LegacyGiftedSubscriptionsPayload
): GiftSubMessage => {
	const gifter =
		payload.gifter_username ||
		(payload as any)?.gifter?.username ||
		(payload as any)?.gifter?.slug ||
		"";
	const giftedUsernames = normalizeGiftedUsernames(payload);
	const inferredAnon =
		payload.is_anonymous === true ||
		(payload as any)?.anonymous === true ||
		gifter.trim().length === 0 ||
		ANON_RE.test(gifter.trim());
	const expiresAt = parseExpiresAtIso(
		payload.expiresAt ?? (payload as any)?.expires_at
	);
	return {
		...payload,
		gifter_username: gifter || "Anonim",
		gifted_usernames: giftedUsernames,
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
