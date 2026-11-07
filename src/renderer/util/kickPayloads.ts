/**
 * Kick olay govdelerini uygulamanin tiplerine ceviren saf fonksiyonlar.
 * Alan adlari kick.com'un kendi istemcisinin bu olaylari nasil okudugundan
 * cikarildi (2026-11-07); eksik/bozuk alanlarda guvenli varsayilan doner.
 */
import type { HostInfo, PinnedChatMessage, UserMessage } from "./chatInterface";

const toFiniteNumber = (value: unknown) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
};

const usernameOf = (value: unknown): string | undefined => {
	if (typeof value === "string") return value || undefined;
	if (value && typeof value === "object") {
		const user = value as { username?: unknown; slug?: unknown };
		if (typeof user.username === "string" && user.username) return user.username;
		if (typeof user.slug === "string" && user.slug) return user.slug;
	}
	return undefined;
};

// StreamHostedEvent: { user: { username }, message: { numberOfViewers, optionalMessage } }
export const parseStreamHosted = (data: string): Omit<HostInfo, "channelSlug"> => {
	const payload = JSON.parse(data || "{}");
	return {
		host_username: usernameOf(payload?.user) ?? "",
		number_viewers: toFiniteNumber(payload?.message?.numberOfViewers) ?? 0,
		optional_message: String(payload?.message?.optionalMessage ?? ""),
	};
};

/**
 * Sabitlenen mesaj iki kaynaktan gelir:
 * - PinnedMessageCreatedEvent: { message, duration (dk), pinnedBy }
 * - Gecmis mesajlar yaniti `pinned_message`: { message, duration, finish_at, pinned_by }
 */
export const parsePinnedMessage = (
	raw: unknown,
	now = Date.now()
): PinnedChatMessage | null => {
	if (!raw || typeof raw !== "object") return null;
	const payload = raw as Record<string, unknown>;
	const message = payload.message as UserMessage | undefined;
	if (!message || typeof message !== "object" || !message.id) return null;
	const finishAtIso =
		typeof payload.finish_at === "string" ? Date.parse(payload.finish_at) : NaN;
	const durationMinutes = toFiniteNumber(payload.duration);
	let finishAt: number | undefined;
	if (Number.isFinite(finishAtIso)) {
		finishAt = finishAtIso;
	} else if (durationMinutes && durationMinutes > 0) {
		finishAt = now + durationMinutes * 60 * 1000;
	}
	return {
		message,
		pinnedBy: usernameOf(payload.pinnedBy ?? payload.pinned_by),
		finishAt,
	};
};

/**
 * NewActivityFeedEvent: { channel_id, type, username, metadata, created_at (ms) }.
 * Ilk kez abone olan yalniz bu olayla (ve ayni bilgiyi tekrarlayan
 * ChannelSubscriptionEvent / NewSubscriberUpdatedEvent ile) bildiriliyor; eski
 * SubscriptionEvent gelmiyor. Yenilemeler kutlama mesajiyla geldigi icin yalniz
 * "new_subscriber" turu abonelik sayilir.
 */
export const parseNewSubscriber = (
	data: string
): { username: string; createdAt: number } | null => {
	const payload = JSON.parse(data || "{}");
	if (payload?.type !== "new_subscriber") return null;
	const username = usernameOf(payload.username);
	if (!username) return null;
	return { username, createdAt: toFiniteNumber(payload.created_at) ?? Date.now() };
};

export type KickGoalType = "followers" | "subscriptions" | "kicks";

export interface KickGoal {
	id: string;
	type?: KickGoalType;
	currentValue?: number;
	targetValue?: number;
	status?: string;
}

// Goal*Event: { id, type, current_value, target_value, status, achieved_at, end_date }
export const parseGoal = (data: string): KickGoal | null => {
	const payload = JSON.parse(data || "{}");
	if (payload?.id === undefined || payload?.id === null) return null;
	const type = ["followers", "subscriptions", "kicks"].includes(payload.type)
		? (payload.type as KickGoalType)
		: undefined;
	return {
		id: String(payload.id),
		type,
		currentValue: toFiniteNumber(payload.current_value),
		targetValue: toFiniteNumber(payload.target_value),
		status: typeof payload.status === "string" ? payload.status : undefined,
	};
};
