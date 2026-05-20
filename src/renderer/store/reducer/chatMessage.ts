import { EmoteSet } from "../../constants/emote";
import { SubscriberBadge } from "../../constants/kick";
import { Emote } from "../../constants/seventv";
import {
	ActivityItem,
	HostInfo,
	ModMessage,
	UserMessage,
} from "../../util/chatInterface";
import { StreamMeta } from "../../util/streamMeta";
import { MessageActions } from "../actions/chatMessage";
import { ChatMessageTypes } from "../types/chatMessages";

interface MessageState {
	messageList: UserMessage[];
	activityList: ActivityItem[];
	modAction: ModMessage[];
	connectionStatus: "idle" | "connecting" | "connected" | "disconnected";
	connectionStatusByChannel: Record<
		string,
		"idle" | "connecting" | "connected" | "disconnected"
	>;

	kickEmoteList: any[];
	sevenTvEmoteList: Emote[];
	globalEmoteSets: EmoteSet[];
	emoteSetsByChannel: Record<string, EmoteSet[]>;
	channelBadges: SubscriberBadge[];
	channelBadgesByChannel: Record<string, SubscriberBadge[]>;
	hostInfo: HostInfo[];
	streamMetaByChannel: Record<string, StreamMeta>;
}
const initialState: MessageState = {
	kickEmoteList: [],
	sevenTvEmoteList: [],
	globalEmoteSets: [],
	emoteSetsByChannel: {},
	messageList: [],
	activityList: [],
	modAction: [],
	connectionStatus: "idle",
	connectionStatusByChannel: {},
	channelBadges: [],
	channelBadgesByChannel: {},
	hostInfo: [],
	streamMetaByChannel: {},
};

const LOCAL_MESSAGE_ID_PREFIX = "local-";
const LOCAL_MOD_ID_PREFIX = "local-";
const LOCAL_ECHO_WINDOW_MS = 20000;

const isLocalMessage = (message: UserMessage) =>
	message.id.startsWith(LOCAL_MESSAGE_ID_PREFIX);

const isLocalModAction = (message: ModMessage) =>
	message.id.startsWith(LOCAL_MOD_ID_PREFIX);

const normalizeMessageContent = (content: string) => content.trim();

const trimList = <T,>(list: T[]) => {
	if (list.length > 500) {
		list.shift();
	}
	return list;
};

const getSubFromCelebrationMessage = (
	message: UserMessage
): ActivityItem | undefined => {
	if (message.type !== "celebration") {
		return undefined;
	}

	const subscriberBadge = message.sender.identity?.badges.find(
		(badge) => badge.type.toLowerCase() === "subscriber"
	);

	return {
		id: message.id,
		channelSlug: message.channelSlug,
		kind: "subscription_renewal",
		actor: {
			id: message.sender.id,
			username: message.sender.username,
			slug: message.sender.slug,
		},
		username: message.sender.username,
		months: subscriberBadge?.count,
		createdAt: new Date(message.created_at).getTime(),
		create_at: new Date(message.created_at).getTime(),
		raw: message,
	};
};

const appendActivityItem = (
	activityList: ActivityItem[],
	item: ActivityItem
) => {
	if (
		item.id &&
		activityList.some((activityItem) => activityItem.id === item.id)
	) {
		return activityList;
	}

	return trimList(activityList.concat(item));
};

const isLikelyLocalEcho = (localMessage: UserMessage, incoming: UserMessage) => {
	if (!isLocalMessage(localMessage) || isLocalMessage(incoming)) {
		return false;
	}

	if (!isSameChannel(localMessage.channelSlug, incoming.channelSlug)) {
		return false;
	}

	const sameSender =
		localMessage.sender.username.toLowerCase() ===
		incoming.sender.username.toLowerCase();
	const sameContent =
		normalizeMessageContent(localMessage.content) ===
		normalizeMessageContent(incoming.content);

	if (!sameSender || !sameContent) {
		return false;
	}

	const localTime = new Date(localMessage.created_at).getTime();
	const incomingTime = new Date(incoming.created_at).getTime();

	if (Number.isNaN(localTime) || Number.isNaN(incomingTime)) {
		return true;
	}

	return Math.abs(incomingTime - localTime) <= LOCAL_ECHO_WINDOW_MS;
};

const normalizeUsername = (username?: string) =>
	(username || "").trim().toLowerCase();

const isSameChannel = (left?: string, right?: string) =>
	!left || !right || left === right;

const isLikelyLocalModEcho = (
	localAction: ModMessage,
	incoming: ModMessage
) => {
	if (!isLocalModAction(localAction) || isLocalModAction(incoming)) {
		return false;
	}

	if (localAction.type !== incoming.type) {
		return false;
	}

	if (!isSameChannel(localAction.channelSlug, incoming.channelSlug)) {
		return false;
	}

	if (
		normalizeUsername(localAction.user?.username) !==
		normalizeUsername(incoming.user?.username)
	) {
		return false;
	}

	if (
		incoming.type === "delete" &&
		localAction.message?.id !== incoming.message?.id
	) {
		return false;
	}

	const localTime = Number(localAction.created_at);
	const incomingTime = Number(incoming.created_at);
	if (Number.isNaN(localTime) || Number.isNaN(incomingTime)) {
		return true;
	}

	return Math.abs(incomingTime - localTime) <= LOCAL_ECHO_WINDOW_MS;
};

const ChatMessageReducers = (
	state = initialState,
	action: MessageActions
): MessageState => {
	if (action.type === ChatMessageTypes.CLEAR_CHANNEL_STATE_ACTION) {
		return {
			...state,
			messageList: [],
			activityList: [],
			modAction: [],
			channelBadges: [],
			hostInfo: [],
		};
	} else if (action.type === ChatMessageTypes.SET_CONNECTION_STATUS_ACTION) {
		return {
			...state,
			connectionStatus: action.status,
			connectionStatusByChannel: action.channelSlug
				? {
						...state.connectionStatusByChannel,
						[action.channelSlug]: action.status,
				  }
				: state.connectionStatusByChannel,
		};
	} else if (action.type === ChatMessageTypes.SET_MOD_ACTION_STATUS_ACTION) {
		return {
			...state,
			modAction: state.modAction.map((item) =>
				item.id === action.id
					? { ...item, status: action.status, error: action.error }
					: item
			),
		};
	} else if (action.type === ChatMessageTypes.NEW_MESSAGE_ACTION) {
		if (state.messageList.some((item) => item.id === action.message.id)) {
			return { ...state };
		}
		const localEchoMessage = state.messageList.find((item) =>
			isLikelyLocalEcho(item, action.message)
		);
		if (localEchoMessage) {
			return {
				...state,
				messageList: state.messageList.map((item) =>
					item.id === localEchoMessage.id ? action.message : item
				),
			};
		}
		// Sprint 34: chronological insert. Canlı Pusher mesajı ile gecikmeli
		// history fetch race olduğunda eski history mesajı liste sonuna
		// concat ediliyordu → UI'da bottom-scroll en yeni gibi gözüktüğü
		// için sıralama bozuk görünüyordu. created_at karşılaştırması ile
		// uygun konuma insert edip listeyi daima oldest→newest tutuyoruz.
		const incomingTs = new Date(action.message.created_at).getTime();
		let insertAt = state.messageList.length;
		for (let i = state.messageList.length - 1; i >= 0; i--) {
			const ts = new Date(state.messageList[i].created_at).getTime();
			if (Number.isFinite(ts) && ts <= incomingTs) {
				insertAt = i + 1;
				break;
			}
			insertAt = i;
		}
		const newList = trimList([
			...state.messageList.slice(0, insertAt),
			action.message,
			...state.messageList.slice(insertAt),
		]);
		const celebrationSub = getSubFromCelebrationMessage(action.message);
		return {
			...state,
			messageList: newList,
			activityList: celebrationSub
				? appendActivityItem(state.activityList, celebrationSub)
				: state.activityList,
		};
	} else if (action.type === ChatMessageTypes.MOD_MESSAGE_ACTION) {
		const localEchoAction = state.modAction.find((item) =>
			isLikelyLocalModEcho(item, action.message)
		);
		const baseModAction = localEchoAction
			? state.modAction.filter((item) => item.id !== localEchoAction.id)
			: state.modAction;
		let newList;
		let newMessageList: UserMessage[] | undefined = undefined;
		switch (action.message.type) {
			case "to":
				const toUserMessageList = state.messageList.filter((item) => {
					return (
						item.sender.username === action.message.user?.username &&
						isSameChannel(item.channelSlug, action.message.channelSlug)
					);
				});
				newMessageList = state.messageList.map((item) => {
					const findMessage = toUserMessageList.find(
						(i) => item.id === i.id
					);
					if (findMessage) {
						return { ...findMessage, removed: true };
					}
					return item;
				});
				newList = [
					...baseModAction,
					{
						type: action.message.type,
						id: action.message.id,
						channelSlug: action.message.channelSlug,
						status: action.message.status || "success",
						error: action.message.error,
						reason: action.message.reason,
						user: action.message.user,
						banned_by: action.message.banned_by,
						expires_at: action.message.expires_at,
						created_at: action.message.created_at,
						message: {
							messageList: toUserMessageList,
						},
					},
				];
				break;
			case "ban":
				const banUserMessageList = state.messageList.filter((item) => {
					return (
						item.sender.username === action.message.user?.username &&
						isSameChannel(item.channelSlug, action.message.channelSlug)
					);
				});
				newMessageList = state.messageList.map((item) => {
					const findMessage = banUserMessageList.find(
						(i) => item.id === i.id
					);
					if (findMessage) {
						return { ...findMessage, removed: true };
					}
					return item;
				});
				newList = [
					...baseModAction,
					{
						type: action.message.type,
						id: action.message.id,
						channelSlug: action.message.channelSlug,
						status: action.message.status || "success",
						error: action.message.error,
						reason: action.message.reason,
						user: action.message.user,
						banned_by: action.message.banned_by,
						created_at: action.message.created_at,
						message: {
							id: action.message.message?.id,
							messageList: banUserMessageList,
						},
					},
				];

				break;
			case "unban":
				newList = [
					...baseModAction,
					{
						type: action.message.type,
						id: action.message.id,
						channelSlug: action.message.channelSlug,
						status: action.message.status || "success",
						error: action.message.error,
						reason: action.message.reason,
						user: action.message.user,
						unbanned_by: action.message.unbanned_by,
						created_at: action.message.created_at,
					},
				];
				break;
			case "delete":
				newMessageList = state.messageList.map((item) => {
					if (
						item.id === action.message.message?.id &&
						isSameChannel(item.channelSlug, action.message.channelSlug)
					) {
						return { ...item, removed: true };
					}
					return item;
				});
				newList = [
					...baseModAction,
					{
						type: action.message.type,
						id: action.message.id,
						channelSlug: action.message.channelSlug,
						status: action.message.status || "success",
						error: action.message.error,
						reason: action.message.reason,
						user: action.message.user,
						created_at: action.message.created_at,
						message: {
							messageList: state.messageList.filter((item) => {
								return (
									item.id === action.message.message?.id &&
									isSameChannel(item.channelSlug, action.message.channelSlug)
								);
							}),
						},
					},
				];
				break;
		}
		if (newList.length > 500) {
			newList.shift();
		}
		return {
			...state,
			messageList: newMessageList ?? state.messageList,
			modAction: newList,
		};
	} else if (action.type === ChatMessageTypes.SUB_MESSAGE_ACTION) {
		const newList = appendActivityItem(state.activityList, {
			id: action.message.id,
			channelSlug: action.message.channelSlug,
			kind:
				action.message.streak && action.message.streak > 1
					? "subscription_renewal"
					: "subscription_new",
			actor: {
				username: action.message.username,
			},
			username: action.message.username,
			months: action.message.months,
			streak: action.message.streak,
			// WI-1.5: legacy Pusher bridge enrichment (CONSTRAINT-3; alanlar optional)
			eventType: action.message.eventType,
			expiresAt: action.message.expiresAt,
			createdAt: action.message.create_at,
			create_at: action.message.create_at,
			raw: action.message,
		});
		// Sprint 35: chat akışına da sub banner satırı bas — kullanıcı sub
		// event'lerini activity'den ayrıca takip etmek zorunda kalmasın.
		const subBannerId = `sub-banner-${action.message.id || action.message.username}-${action.message.create_at}`;
		const isRenewal = !!action.message.streak && action.message.streak > 1;
		const subBanner: UserMessage = {
			id: subBannerId,
			channelSlug: action.message.channelSlug,
			chatroom_id: action.message.chatroom_id,
			content: isRenewal
				? `${action.message.username} aboneliğini yeniledi — ${action.message.months} ay`
				: `${action.message.username} abone oldu — ${action.message.months} ay`,
			type: "sub-banner",
			created_at: new Date(action.message.create_at).toISOString(),
			sender: {
				id: 0,
				username: action.message.username,
				slug: action.message.username.toLowerCase(),
				identity: {
					color: "#7c3aed",
					badges: [
						{
							type: "subscriber",
							text: "Sub",
							count: action.message.months,
						},
					],
				},
			},
		};
		const subBannerExists = state.messageList.some(
			(m) => m.id === subBannerId
		);
		return {
			...state,
			activityList: newList,
			messageList: subBannerExists
				? state.messageList
				: trimList(state.messageList.concat(subBanner)),
		};
	} else if (action.type === ChatMessageTypes.GIF_SUB_MESSAGE_ACTION) {
		const newList = appendActivityItem(state.activityList, {
			id: action.message.id,
			channelSlug: action.message.channelSlug,
			kind: "subscription_gift",
			actor: {
				username: action.message.gifter_username,
			},
			targetUsers: action.message.gifted_usernames.map((username) => ({
				username,
			})),
			amount: action.message.gifted_usernames.length,
			username: action.message.gifter_username,
			giftedList: action.message.gifted_usernames,
			// WI-1.5: legacy Pusher bridge enrichment
			eventType: action.message.eventType,
			expiresAt: action.message.expiresAt,
			anonymous: action.message.anonymous,
			createdAt: action.message.create_at,
			create_at: action.message.create_at,
			raw: action.message,
		});
		// Sprint 35: gift sub için chat banner satırı.
		const giftCount = action.message.gifted_usernames.length;
		const giftBannerId = `gift-sub-banner-${action.message.id || action.message.gifter_username}-${action.message.create_at}`;
		const targetList = action.message.gifted_usernames.slice(0, 3).join(", ");
		const tailNote =
			action.message.gifted_usernames.length > 3
				? ` +${action.message.gifted_usernames.length - 3} kişi daha`
				: "";
		const giftBanner: UserMessage = {
			id: giftBannerId,
			channelSlug: action.message.channelSlug,
			chatroom_id: action.message.chatroom_id,
			content: `${action.message.gifter_username}, ${giftCount} kişiye hediye abonelik verdi → ${targetList}${tailNote}`,
			type: "gift-sub-banner",
			created_at: new Date(action.message.create_at).toISOString(),
			sender: {
				id: 0,
				username: action.message.gifter_username,
				slug: action.message.gifter_username.toLowerCase(),
				identity: {
					color: "#ec4899",
					badges: [],
				},
			},
		};
		const giftBannerExists = state.messageList.some(
			(m) => m.id === giftBannerId
		);
		return {
			...state,
			activityList: newList,
			messageList: giftBannerExists
				? state.messageList
				: trimList(state.messageList.concat(giftBanner)),
		};
	} else if (action.type === ChatMessageTypes.ADD_ACTIVITY_ACTION) {
		return {
			...state,
			activityList: appendActivityItem(state.activityList, action.activity),
		};
	} else if (action.type === ChatMessageTypes.SET_ACTIVITY_STATUS_ACTION) {
		return {
			...state,
			activityList: state.activityList.map((item) =>
				item.id === action.id ? { ...item, status: action.status } : item
			),
		};
	} else if (action.type === ChatMessageTypes.SET_KICK_EMOTES_ACTION) {
		return { ...state, kickEmoteList: action.emotes };
	} else if (action.type === ChatMessageTypes.SET_SEVEN_TV_EMOTES_ACTION) {
		return { ...state, sevenTvEmoteList: action.emotes };
	} else if (action.type === ChatMessageTypes.SET_GLOBAL_EMOTE_SETS_ACTION) {
		return { ...state, globalEmoteSets: action.sets };
	} else if (action.type === ChatMessageTypes.SET_CHANNEL_EMOTE_BUNDLE_ACTION) {
		return {
			...state,
			emoteSetsByChannel: {
				...state.emoteSetsByChannel,
				[action.channelSlug]: action.sets,
			},
		};
	} else if (action.type === ChatMessageTypes.CLEAR_CHANNEL_EMOTE_BUNDLE_ACTION) {
		const nextMap = { ...state.emoteSetsByChannel };
		delete nextMap[action.channelSlug];
		return { ...state, emoteSetsByChannel: nextMap };
	} else if (action.type === ChatMessageTypes.SET_STREAM_META_ACTION) {
		const slug = action.meta.channelSlug;
		const existing = state.streamMetaByChannel[slug];
		return {
			...state,
			streamMetaByChannel: {
				...state.streamMetaByChannel,
				[slug]: {
					...(existing || {}),
					...action.meta,
				},
			},
		};
	} else if (action.type === ChatMessageTypes.SET_CHANNEL_BADGES_ACTION) {
		return {
			...state,
			channelBadges: action.channelBadges,
			channelBadgesByChannel: action.channelSlug
				? {
						...state.channelBadgesByChannel,
						[action.channelSlug]: action.channelBadges,
				  }
				: state.channelBadgesByChannel,
		};
	} else if (action.type === ChatMessageTypes.SET_HOST_ACTION) {
		return { ...state, hostInfo: [...state.hostInfo, action.hostInfo] };
	} else if (action.type === ChatMessageTypes.REMOVE_HOST_ACTION) {
		return {
			...state,
			hostInfo: state.hostInfo.filter(
				(item) =>
					item.host_username !== action.hostInfo.host_username ||
					!isSameChannel(item.channelSlug, action.hostInfo.channelSlug)
			),
		};
	} else {
		return { ...state };
	}
};

export default ChatMessageReducers;
