import { ActivityItem, ActivityStatus, ActivityUser } from "./chatInterface";

const toActivityStatus = (value: any): ActivityStatus => {
	if (value === "accepted" || value === "rejected") return value;
	return "pending";
};

const toActivityUser = (value: any): ActivityUser => ({
	id: value?.user_id,
	username: value?.username || "unknown",
	slug: value?.channel_slug,
	profilePicture: value?.profile_picture,
});

// Anonymous gifter fallback — REQ-4 acceptance:
// "Given anonymous gifter payload'i geldiginde Then 'Anonymous' gibi guvenli fallback gosterilir."
const ANON_USERNAME = "Anonymous";

const toGifterUser = (value: any): { user: ActivityUser; anonymous: boolean } => {
	const isAnon =
		value == null ||
		value?.is_anonymous === true ||
		value?.anonymous === true ||
		(typeof value?.username === "string" && value.username.toLowerCase() === "anonymous");
	if (isAnon) {
		return {
			user: { username: ANON_USERNAME },
			anonymous: true,
		};
	}
	return { user: toActivityUser(value), anonymous: false };
};

// Parse ISO/epoch expires_at to epoch ms; null-safe.
const parseExpiresAt = (value: any): number | undefined => {
	if (value == null) return undefined;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const t = new Date(value).getTime();
		return Number.isFinite(t) ? t : undefined;
	}
	return undefined;
};

export const normalizeKickWebhookActivity = (
	eventType: string,
	payload: any
): ActivityItem | undefined => {
	const createdAt = payload?.created_at
		? new Date(payload.created_at).getTime()
		: Date.now();
	const broadcasterSlug = payload?.broadcaster?.channel_slug;

	switch (eventType) {
		case "channel.subscription.new":
		case "channel.subscription.renewal": {
			const subscriber = toActivityUser(payload?.subscriber || payload?.user);
			const months =
				payload?.subscription?.duration ??
				payload?.months ??
				payload?.duration;
			const streak =
				payload?.subscription?.streak ??
				payload?.streak;
			const expiresAt = parseExpiresAt(
				payload?.subscription?.expires_at ?? payload?.expires_at
			);
			return {
				id: payload?.subscription?.id || payload?.id,
				channelSlug: broadcasterSlug,
				kind:
					eventType === "channel.subscription.renewal"
						? "subscription_renewal"
						: "subscription_new",
				eventType,
				actor: subscriber,
				username: subscriber.username,
				months,
				streak,
				expiresAt,
				createdAt,
				create_at: createdAt,
				raw: payload,
			};
		}
		case "channel.subscription.gifts": {
			const { user: gifter, anonymous } = toGifterUser(
				payload?.gifter || payload?.sender
			);
			// Docs say `giftees`; legacy code path used `gifted_users`/`recipients`.
			// Accept all three for CONSTRAINT-3 (Pusher legacy compat) + docs alignment.
			const rawGiftees =
				payload?.giftees ||
				payload?.gifted_users ||
				payload?.recipients ||
				[];
			const giftedUsers: ActivityUser[] = rawGiftees.map(toActivityUser);
			const expiresAt = parseExpiresAt(
				payload?.subscription?.expires_at ?? payload?.expires_at
			);
			return {
				id: payload?.gift?.id || payload?.id,
				channelSlug: broadcasterSlug,
				kind: "subscription_gift",
				eventType,
				actor: gifter,
				anonymous: anonymous || undefined,
				targetUsers: giftedUsers,
				amount: payload?.gift?.amount || giftedUsers.length,
				username: gifter.username,
				giftedList: giftedUsers.map((user) => user.username),
				expiresAt,
				createdAt,
				create_at: createdAt,
				raw: payload,
			};
		}
		case "channel.reward.redemption.updated": {
			const redeemer = toActivityUser(payload?.user || payload?.redeemer);
			return {
				id: payload?.redemption?.id || payload?.id,
				channelSlug: broadcasterSlug,
				kind: "reward_redemption",
				eventType,
				actor: redeemer,
				amount: payload?.reward?.cost,
				title: payload?.reward?.title,
				message: payload?.redemption?.user_input || payload?.user_input,
				status: toActivityStatus(payload?.redemption?.status || payload?.status),
				createdAt,
				create_at: createdAt,
				raw: payload,
			};
		}
		case "kicks.gifted": {
			const sender = toActivityUser(payload?.sender);
			const gift = payload?.gift ?? {};
			return {
				id: gift.id || payload?.id,
				channelSlug: broadcasterSlug,
				kind: "kicks_gifted",
				eventType,
				actor: sender,
				amount: gift.amount,
				title: gift.name,
				giftName: gift.name,
				giftType: gift.type,
				giftTier: gift.tier,
				pinnedTimeSeconds: gift.pinned_time_seconds,
				message: gift.message,
				createdAt,
				create_at: createdAt,
				raw: payload,
			};
		}
		default:
			return undefined;
	}
};
