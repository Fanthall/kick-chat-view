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

// FIX-2 (dedup): Aynı yenileme hem `SubscriptionEvent` (Path B) hem celebration
// chat mesajı (Path A) ile gelebiliyor. `${slug}::${username}::${months}` anahtarı
// için kısa pencere (~30sn) içinde ikinci banner/activity'yi yutuyoruz.
const SUB_DEDUP_WINDOW_MS = 30 * 1000;
const recentSubEvents = new Map<string, number>(); // key → epoch ms

const subDedupKey = (slug: string | undefined, username: string, months?: number) =>
	`${(slug || "").toLowerCase()}::${username.toLowerCase()}::${months ?? "?"}`;

// true dönerse bu (slug,user,months) yakın zamanda zaten işlendi → tekrar basma.
const isDuplicateSubEvent = (
	slug: string | undefined,
	username: string,
	months?: number
): boolean => {
	if (!username) return false;
	const key = subDedupKey(slug, username, months);
	const now = Date.now();
	const last = recentSubEvents.get(key);
	// Sızıntı guard: pencereyi geçmiş eski kayıtları ara sıra temizle.
	if (recentSubEvents.size > 200) {
		for (const [k, ts] of recentSubEvents) {
			if (now - ts > SUB_DEDUP_WINDOW_MS) recentSubEvents.delete(k);
		}
	}
	if (typeof last === "number" && now - last < SUB_DEDUP_WINDOW_MS) {
		return true;
	}
	recentSubEvents.set(key, now);
	return false;
};

// FIX-3 (gift recipient exclude): Gift alıcılarını kısa süre işaretle ki
// gifter→recipient için ayrıca gelen SubscriptionEvent / celebration renewal
// banner+activity'sine düşmesin (otomasyon zaten ayrı dışlıyordu — RC-3).
const GIFT_RECIPIENT_TTL_MS = 5 * 60 * 1000;
const giftRecipientsReducer = new Map<string, number>(); // "slug::user" → expiresAt

const giftRecipientKey = (slug: string | undefined, username: string) =>
	`${(slug || "").toLowerCase()}::${username.toLowerCase()}`;

const markGiftRecipientReducer = (slug: string | undefined, username: string) => {
	if (!username) return;
	giftRecipientsReducer.set(
		giftRecipientKey(slug, username),
		Date.now() + GIFT_RECIPIENT_TTL_MS
	);
};

const wasRecentGiftRecipientReducer = (
	slug: string | undefined,
	username: string
): boolean => {
	if (!username) return false;
	const k = giftRecipientKey(slug, username);
	const exp = giftRecipientsReducer.get(k);
	if (!exp) return false;
	if (exp < Date.now()) {
		giftRecipientsReducer.delete(k);
		return false;
	}
	return true;
};

// FIX-1: months tabanlı renewal tespiti. months>1 → yenileme; streak>1 destekçi
// sinyal. months yoksa konservatif "yeni" (false).
const isRenewalFromCounts = (
	months: number | undefined,
	streak: number | undefined
): boolean => {
	if (typeof months === "number" && months > 1) return true;
	if (typeof streak === "number" && streak > 1) return true;
	return false;
};

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

// FIX-2: Celebration (re-sub) chat mesajından sub aktivitesi üret.
// - months: önce metadata.celebration.total_months, yoksa subscriber badge count.
// - alt-tip guard: yalnız gerçek resub/streak celebration'ı renewal say (kullanıcı
//   her celebration penceresinde konuştuğunda yanlış renewal üretme).
// - gift recipient exclude + dedup uygulanır.
// Sonuç hem activity hem banner üretimi için ortak kullanılır → {activity, banner, months, isRenewal}.
const CELEBRATION_SUB_TYPES = [
	"subscription_renewed",
	"subscription_renewal",
	"resubscription",
	"resub",
	"streak",
	"sub_renewed",
	"subscription",
];

interface CelebrationSubResult {
	activity: ActivityItem;
	months?: number;
	isRenewal: boolean;
	username: string;
}

const getSubFromCelebrationMessage = (
	message: UserMessage
): CelebrationSubResult | undefined => {
	if (message.type !== "celebration") {
		return undefined;
	}

	const celebration = message.metadata?.celebration;
	const celebrationType = (celebration?.type || "").toLowerCase();
	// Alt-tip biliniyorsa ve bilinen resub/streak tiplerinden biri değilse,
	// bunu sub renewal olarak SAYMA (ör. başka bir kutlama alt-tipi).
	if (celebrationType && !CELEBRATION_SUB_TYPES.some((t) => celebrationType.includes(t))) {
		return undefined;
	}

	const subscriberBadge = message.sender.identity?.badges?.find(
		(badge) => badge.type.toLowerCase() === "subscriber"
	);
	const months =
		typeof celebration?.total_months === "number"
			? celebration.total_months
			: subscriberBadge?.count;

	const username = message.sender.username;

	// FIX-3: Bu kullanıcı yakın zamanda gift aldıysa renewal olarak basma.
	if (wasRecentGiftRecipientReducer(message.channelSlug, username)) {
		return undefined;
	}

	// FIX-1 semantiği: celebration zaten resub anlamına geldiği için renewal=true,
	// ama months==1 ise (ilk ay) konservatif yeni say.
	const isRenewal = isRenewalFromCounts(months, undefined) || months === undefined;

	// FIX-2 dedup: SubscriptionEvent ile aynı yenilemeyi çift basma.
	if (isDuplicateSubEvent(message.channelSlug, username, months)) {
		return undefined;
	}

	const createdAt = new Date(message.created_at).getTime();
	const activity: ActivityItem = {
		id: message.id,
		channelSlug: message.channelSlug,
		kind: isRenewal ? "subscription_renewal" : "subscription_new",
		actor: {
			id: message.sender.id,
			username,
			slug: message.sender.slug,
		},
		username,
		months,
		createdAt,
		create_at: createdAt,
		raw: message,
	};

	return { activity, months, isRenewal, username };
};

// FIX-2: Celebration renewal için chat'e sub-banner üret (Path B ile aynı görünüm).
const buildCelebrationSubBanner = (
	message: UserMessage,
	result: CelebrationSubResult
): UserMessage => {
	const { username, months, isRenewal } = result;
	const monthsLabel = typeof months === "number" ? `${months} ay` : "";
	const suffix = monthsLabel ? ` — ${monthsLabel}` : "";
	return {
		id: `sub-banner-celebration-${message.id}`,
		channelSlug: message.channelSlug,
		chatroom_id: message.chatroom_id,
		content: isRenewal
			? `${username} aboneliğini yeniledi${suffix}`
			: `${username} abone oldu${suffix}`,
		type: "sub-banner",
		created_at: message.created_at,
		sender: {
			id: 0,
			username,
			slug: username.toLowerCase(),
			identity: {
				color: "#7c3aed",
				badges: [
					{
						type: "subscriber",
						text: "Sub",
						count: months as number,
					},
				],
			},
		},
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
		// FIX-2: Celebration (re-sub) ise hem activity ekle hem chat'e sub-banner bas.
		const celebrationSub = getSubFromCelebrationMessage(action.message);
		if (celebrationSub) {
			const subBanner = buildCelebrationSubBanner(
				action.message,
				celebrationSub
			);
			const bannerExists = newList.some((m) => m.id === subBanner.id);
			return {
				...state,
				messageList: bannerExists
					? newList
					: trimList(newList.concat(subBanner)),
				activityList: appendActivityItem(
					state.activityList,
					celebrationSub.activity
				),
			};
		}
		return {
			...state,
			messageList: newList,
			activityList: state.activityList,
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
		const subUsername = action.message.username;
		// FIX-3: Gifter→recipient için ayrıca gelen SubscriptionEvent'i, alıcı
		// yakın zamanda gift aldıysa sub/renewal olarak basma (çifte patlama).
		if (wasRecentGiftRecipientReducer(action.message.channelSlug, subUsername)) {
			return { ...state };
		}
		const months = action.message.months;
		// FIX-1: renewal tespiti months tabanlı (months>1) + streak destekçi sinyal.
		const isRenewal = isRenewalFromCounts(months, action.message.streak);
		// FIX-2: celebration ile aynı yenilemeyi çift basma (kısa pencere dedup).
		if (isDuplicateSubEvent(action.message.channelSlug, subUsername, months)) {
			return { ...state };
		}
		const newList = appendActivityItem(state.activityList, {
			id: action.message.id,
			channelSlug: action.message.channelSlug,
			kind: isRenewal ? "subscription_renewal" : "subscription_new",
			actor: {
				username: subUsername,
			},
			username: subUsername,
			months,
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
		const subBannerId = `sub-banner-${action.message.id || subUsername}-${action.message.create_at}`;
		// FIX-1: months undefined ise sayı yazma (NaN/"undefined ay" önlemi).
		const monthsLabel = typeof months === "number" ? `${months} ay` : "";
		const suffix = monthsLabel ? ` — ${monthsLabel}` : "";
		const subBanner: UserMessage = {
			id: subBannerId,
			channelSlug: action.message.channelSlug,
			chatroom_id: action.message.chatroom_id,
			content: isRenewal
				? `${subUsername} aboneliğini yeniledi${suffix}`
				: `${subUsername} abone oldu${suffix}`,
			type: "sub-banner",
			created_at: new Date(action.message.create_at).toISOString(),
			sender: {
				id: 0,
				username: subUsername,
				slug: subUsername.toLowerCase(),
				identity: {
					color: "#7c3aed",
					badges: [
						{
							type: "subscriber",
							text: "Sub",
							count: months,
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
		// FIX-GIFT (defense-in-depth): bridge normalize ediyor olsa da reducer
		// `gifted_usernames` undefined'a karşı asla `.map/.length` ile THROW
		// etmemeli (eskiden bu throw'u dıştaki try/catch yutup gift'i tamamen
		// görünmez yapıyordu). `?? []` ile garanti dizi.
		const giftedUsernames = action.message.gifted_usernames ?? [];
		const gifterUsername = action.message.gifter_username || "Anonim";
		// FIX-3: alıcıları işaretle ki birazdan gelebilecek SubscriptionEvent /
		// celebration renewal bunları gifter ile çift basmasın.
		for (const recipient of giftedUsernames) {
			markGiftRecipientReducer(action.message.channelSlug, recipient);
		}
		const newList = appendActivityItem(state.activityList, {
			id: action.message.id,
			channelSlug: action.message.channelSlug,
			kind: "subscription_gift",
			actor: {
				username: gifterUsername,
			},
			targetUsers: giftedUsernames.map((username) => ({
				username,
			})),
			amount: giftedUsernames.length,
			username: gifterUsername,
			giftedList: giftedUsernames,
			// WI-1.5: legacy Pusher bridge enrichment
			eventType: action.message.eventType,
			expiresAt: action.message.expiresAt,
			anonymous: action.message.anonymous,
			createdAt: action.message.create_at,
			create_at: action.message.create_at,
			raw: action.message,
		});
		// Sprint 35: gift sub için chat banner satırı.
		const giftCount = giftedUsernames.length;
		const giftBannerId = `gift-sub-banner-${action.message.id || gifterUsername}-${action.message.create_at}`;
		const targetList = giftedUsernames.slice(0, 3).join(", ");
		const tailNote =
			giftedUsernames.length > 3
				? ` +${giftedUsernames.length - 3} kişi daha`
				: "";
		const giftBanner: UserMessage = {
			id: giftBannerId,
			channelSlug: action.message.channelSlug,
			chatroom_id: action.message.chatroom_id,
			content:
				giftCount > 0
					? `${gifterUsername}, ${giftCount} kişiye hediye abonelik verdi → ${targetList}${tailNote}`
					: `${gifterUsername} hediye abonelik verdi`,
			type: "gift-sub-banner",
			created_at: new Date(action.message.create_at).toISOString(),
			sender: {
				id: 0,
				username: gifterUsername,
				slug: gifterUsername.toLowerCase(),
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
		// Sprint 39: host/raid olayı geldiğinde sadece hostInfo'ya değil,
		// activity listesine ve chat akışına da banner basıyoruz —
		// kullanıcı bunları ayrıca aramak zorunda kalmasın.
		const hostInfo = action.hostInfo;
		const hostId = `host-${hostInfo.channelSlug || "x"}-${hostInfo.host_username}-${Date.now()}`;
		const createdAt = Date.now();
		const activityItem: ActivityItem = {
			id: hostId,
			channelSlug: hostInfo.channelSlug,
			kind: "host_raid",
			actor: { username: hostInfo.host_username },
			username: hostInfo.host_username,
			amount: hostInfo.number_viewers,
			message: hostInfo.optional_message,
			createdAt,
			create_at: createdAt,
			raw: hostInfo,
		};
		const hostBanner: UserMessage = {
			id: hostId,
			channelSlug: hostInfo.channelSlug,
			chatroom_id: 0,
			content:
				`${hostInfo.host_username}, ${hostInfo.number_viewers} izleyici ile raid yaptı` +
				(hostInfo.optional_message ? ` — ${hostInfo.optional_message}` : ""),
			type: "host-banner",
			created_at: new Date(createdAt).toISOString(),
			sender: {
				id: 0,
				username: hostInfo.host_username,
				slug: hostInfo.host_username.toLowerCase(),
				identity: { color: "#f59e0b", badges: [] },
			},
		};
		return {
			...state,
			hostInfo: [...state.hostInfo, hostInfo],
			activityList: appendActivityItem(state.activityList, activityItem),
			messageList: state.messageList.some((m) => m.id === hostId)
				? state.messageList
				: trimList(state.messageList.concat(hostBanner)),
		};
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
