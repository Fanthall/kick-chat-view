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
			return {
				id: payload?.subscription?.id || payload?.id,
				channelSlug: broadcasterSlug,
				kind:
					eventType === "channel.subscription.renewal"
						? "subscription_renewal"
						: "subscription_new",
				actor: subscriber,
				username: subscriber.username,
				months: payload?.subscription?.duration || payload?.months,
				streak: payload?.subscription?.streak,
				createdAt,
				create_at: createdAt,
				raw: payload,
			};
		}
		case "channel.subscription.gifts": {
			const gifter = toActivityUser(payload?.gifter || payload?.sender);
			const giftedUsers: ActivityUser[] = (
				payload?.gifted_users ||
				payload?.recipients ||
				[]
			).map(
				toActivityUser
			);
			return {
				id: payload?.gift?.id || payload?.id,
				channelSlug: broadcasterSlug,
				kind: "subscription_gift",
				actor: gifter,
				targetUsers: giftedUsers,
				amount: payload?.gift?.amount || giftedUsers.length,
				username: gifter.username,
				giftedList: giftedUsers.map((user) => user.username),
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
			return {
				id: payload?.gift?.id || payload?.id,
				channelSlug: broadcasterSlug,
				kind: "kicks_gifted",
				actor: sender,
				amount: payload?.gift?.amount,
				title: payload?.gift?.name,
				message: payload?.gift?.message,
				createdAt,
				create_at: createdAt,
				raw: payload,
			};
		}
		default:
			return undefined;
	}
};
