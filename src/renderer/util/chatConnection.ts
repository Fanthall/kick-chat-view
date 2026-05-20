import { EmoteSet } from "../constants/emote";
import { getChannelData, getChannelMessages } from "../services/kick";
import { getKickChannelEmotes } from "../services/kickEmotes";
import { getSevenTvKickUser } from "../services/sevenTv";
import { sevenTvEvents } from "../services/sevenTvEvents";
import MessageActionsFunc from "../store/actions/chatMessage";
import { FanthalDispatch } from "../store/store";
import {
	BanToMessage,
	DeleteMessage,
	GiftSubMessage,
	HostInfo,
	SubMessage,
	UnBanTOMessage,
	UserMessage,
} from "./chatInterface";
import { getActiveChannelSlug } from "./channelSettings";
import { extractSevenTvSetsFromKickUser, normalizeKickGroups } from "./emoteIndex";
import {
	enrichLegacyGiftedSubscriptionsPayload,
	enrichLegacySubscriptionPayload,
	LegacyGiftedSubscriptionsPayload,
	LegacySubscriptionPayload,
} from "./legacyPusherBridge";
interface EventType {
	channel: string;
	data: string;
	event: string;
}

const activeSockets = new Map<string, WebSocket>();
const channelEmoteLoaders = new Set<string>();
const channelEmoteLoadedAt = new Map<string, number>();
const channelEmoteUserIds = new Map<string, number>();
const channelSevenTvSetIds = new Map<string, Set<string>>();
const sevenTvSetSubscribed = new Set<string>();
const sevenTvRefreshDebounce = new Map<string, ReturnType<typeof setTimeout>>();
const streamMetaPollers = new Map<string, ReturnType<typeof setInterval>>();
const CHANNEL_EMOTE_TTL_MS = 10 * 60 * 1000;
const SEVENTV_REFRESH_DEBOUNCE_MS = 750;
const STREAM_META_POLL_MS = 60 * 1000;

const loadStreamMeta = (dispatch: FanthalDispatch, channelSlug: string) => {
	window.electron.kick
		.getChannelBySlug(channelSlug)
		.then((response) => {
			const channel = response?.data?.[0];
			if (!channel) return;
			dispatch(
				MessageActionsFunc.setStreamMeta({
					channelSlug,
					broadcasterUserId: channel.broadcaster_user_id,
					streamTitle: channel.stream_title,
					category: channel.category
						? {
								id: channel.category.id,
								name: channel.category.name,
								thumbnail: channel.category.thumbnail,
						  }
						: undefined,
					customTags: channel.stream?.custom_tags,
					viewerCount: channel.stream?.viewer_count,
					isLive: !!channel.stream?.is_live,
					startedAt: channel.stream?.start_time,
					updatedAt: Date.now(),
				})
			);
		})
		.catch(() => {
			// noop: kanal okuma yoksa essiz
		});
};

const startStreamMetaPolling = (
	dispatch: FanthalDispatch,
	channelSlug: string
) => {
	if (streamMetaPollers.has(channelSlug)) return;
	loadStreamMeta(dispatch, channelSlug);
	const interval = setInterval(() => {
		loadStreamMeta(dispatch, channelSlug);
	}, STREAM_META_POLL_MS);
	streamMetaPollers.set(channelSlug, interval);
};

const stopStreamMetaPolling = (channelSlug: string) => {
	const interval = streamMetaPollers.get(channelSlug);
	if (interval) {
		clearInterval(interval);
		streamMetaPollers.delete(channelSlug);
	}
};

export const refreshStreamMeta = (channelSlug: string) => {
	return (dispatch: FanthalDispatch) => {
		const normalized = channelSlug.trim().toLowerCase();
		if (!normalized) return;
		loadStreamMeta(dispatch, normalized);
	};
};

let sevenTvDispatchHookInstalled = false;

const installSevenTvDispatchHook = (dispatch: FanthalDispatch) => {
	if (sevenTvDispatchHookInstalled) return;
	sevenTvDispatchHookInstalled = true;
	sevenTvEvents.onDispatch((event) => {
		if (event.type !== "emote_set.update") return;
		const setId = event.body?.id;
		if (!setId) return;
		let targetChannel: string | undefined;
		for (const [slug, ids] of channelSevenTvSetIds) {
			if (ids.has(setId)) {
				targetChannel = slug;
				break;
			}
		}
		if (!targetChannel) return;
		const existingTimer = sevenTvRefreshDebounce.get(targetChannel);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}
		const timer = setTimeout(() => {
			sevenTvRefreshDebounce.delete(targetChannel!);
			loadChannelEmoteBundle(
				dispatch,
				targetChannel!,
				channelEmoteUserIds.get(targetChannel!),
				{ force: true }
			);
		}, SEVENTV_REFRESH_DEBOUNCE_MS);
		sevenTvRefreshDebounce.set(targetChannel, timer);
	});
};

const syncSevenTvSubscriptions = (
	channelSlug: string,
	sets: EmoteSet[]
) => {
	const newIds = new Set<string>();
	for (const set of sets) {
		if (set.provider.startsWith("seventv-") && set.id) {
			newIds.add(set.id);
		}
	}
	const previousIds = channelSevenTvSetIds.get(channelSlug) || new Set<string>();
	for (const id of newIds) {
		if (!sevenTvSetSubscribed.has(id)) {
			sevenTvEvents.subscribe(id);
			sevenTvSetSubscribed.add(id);
		}
	}
	for (const id of previousIds) {
		if (!newIds.has(id)) {
			const stillUsed = Array.from(channelSevenTvSetIds.entries()).some(
				([otherSlug, ids]) => otherSlug !== channelSlug && ids.has(id)
			);
			if (!stillUsed) {
				sevenTvEvents.unsubscribe(id);
				sevenTvSetSubscribed.delete(id);
			}
		}
	}
	channelSevenTvSetIds.set(channelSlug, newIds);
};

const loadChannelEmoteBundle = (
	dispatch: FanthalDispatch,
	channelSlug: string,
	channelUserId?: number,
	options: { force?: boolean } = {}
) => {
	if (channelEmoteLoaders.has(channelSlug)) {
		return;
	}
	const last = channelEmoteLoadedAt.get(channelSlug);
	if (!options.force && last && Date.now() - last < CHANNEL_EMOTE_TTL_MS) {
		return;
	}
	installSevenTvDispatchHook(dispatch);
	channelEmoteLoaders.add(channelSlug);
	const userIdToUse = channelUserId ?? channelEmoteUserIds.get(channelSlug);
	if (channelUserId) {
		channelEmoteUserIds.set(channelSlug, channelUserId);
	}
	const kickPromise = getKickChannelEmotes(channelSlug)
		.then((res) => normalizeKickGroups(res.data || [], channelSlug))
		.catch(() => [] as EmoteSet[]);
	const sevenTvPromise = userIdToUse
		? getSevenTvKickUser(userIdToUse)
				.then((res) =>
					extractSevenTvSetsFromKickUser(res.data || {}, channelSlug)
				)
				.catch(() => [] as EmoteSet[])
		: Promise.resolve([] as EmoteSet[]);
	Promise.all([kickPromise, sevenTvPromise])
		.then(([kickSets, sevenTvSets]) => {
			const combined: EmoteSet[] = [...kickSets, ...sevenTvSets];
			dispatch(
				MessageActionsFunc.setChannelEmoteBundle(channelSlug, combined)
			);
			channelEmoteLoadedAt.set(channelSlug, Date.now());
			syncSevenTvSubscriptions(channelSlug, combined);
		})
		.finally(() => {
			channelEmoteLoaders.delete(channelSlug);
		});
};

export const refreshChannelEmoteBundle = (channelSlug: string) => {
	return (dispatch: FanthalDispatch) => {
		const normalized = channelSlug.trim().toLowerCase();
		if (!normalized) return;
		loadChannelEmoteBundle(
			dispatch,
			normalized,
			channelEmoteUserIds.get(normalized),
			{ force: true }
		);
	};
};

export const chatListener = (slug?: string) => {
	return (dispatch: FanthalDispatch) => {
		const channelName = (slug || getActiveChannelSlug())?.trim().toLowerCase();
		if (!channelName) {
			return;
		}

		const existingSocket = activeSockets.get(channelName);
		if (existingSocket) {
			existingSocket.close();
			activeSockets.delete(channelName);
		}

		dispatch(MessageActionsFunc.setConnectionStatus("connecting", channelName));

		const socket = new WebSocket(
			"wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false"
		);
		activeSockets.set(channelName, socket);

		socket.addEventListener("open", (event) => {
			if (channelName) {
				getChannelData(channelName)
					.then((res) => {
						const channelId = res.data.id;
						const channelUserId = res.data.user_id;
						dispatch(
							MessageActionsFunc.setChannelBadges(
								res.data.subscriber_badges.reverse(),
								channelName
							)
						);

						loadChannelEmoteBundle(dispatch, channelName, channelUserId);
						startStreamMetaPolling(dispatch, channelName);

						getChannelMessages(channelId)
							.then((historyRes) => {
								const historyMessages =
									historyRes.data.data.messages || [];
								historyMessages
									.slice()
									.sort(
										(a, b) =>
											new Date(a.created_at).getTime() -
											new Date(b.created_at).getTime()
									)
									.forEach((message) => {
										if (activeSockets.get(channelName) === socket) {
											dispatch(
												MessageActionsFunc.newMessage({
													...message,
													channelSlug: channelName,
												})
											);
										}
									});
							})
							.catch((err) => {
								console.log("Kick history load failed", err);
							});
						socket.send(
							`{"event":"pusher:subscribe","data":{"auth":"","channel":"chatrooms.${res.data.chatroom.id}.v2"}}`
						);
					})
					.catch((err) => {
						console.log("Kick channel load failed", err);
						dispatch(
							MessageActionsFunc.setConnectionStatus(
								"disconnected",
								channelName
							)
						);
						activeSockets.delete(channelName);
						socket.close();
					});
			}
		});

		socket.addEventListener("close", () => {
			if (activeSockets.get(channelName) === socket) {
				activeSockets.delete(channelName);
				stopStreamMetaPolling(channelName);
				dispatch(
					MessageActionsFunc.setConnectionStatus("disconnected", channelName)
				);
			}
		});

		socket.addEventListener("error", () => {
			if (activeSockets.get(channelName) === socket) {
				dispatch(
					MessageActionsFunc.setConnectionStatus("disconnected", channelName)
				);
			}
		});

		// Listen for messages
		socket.addEventListener("message", (event) => {
			if (activeSockets.get(channelName) !== socket) {
				return;
			}
			let parsedEvent: EventType;
			try {
				parsedEvent = JSON.parse(event.data);
			} catch (err) {
				console.log("Kick websocket parse failed", err);
				return;
			}
			try {
				switch (parsedEvent.event) {
					case "pusher_internal:subscription_succeeded":
						dispatch(
							MessageActionsFunc.setConnectionStatus("connected", channelName)
						);
						break;
					case "App\\Events\\ChatMessageEvent":
						const parsedMessage: UserMessage = JSON.parse(parsedEvent.data);
						dispatch(
							MessageActionsFunc.newMessage({
								...parsedMessage,
								channelSlug: channelName,
							})
						);
						break;
				case "App\\Events\\SubscriptionEvent":
					const parsedSubMessage: LegacySubscriptionPayload = JSON.parse(
						parsedEvent.data
					);
					dispatch(
							MessageActionsFunc.subMessage(
								enrichLegacySubscriptionPayload({
									...parsedSubMessage,
									channelSlug: channelName,
									create_at: new Date().getTime(),
								})
							)
					);
					break;
				case "App\\Events\\GiftedSubscriptionsEvent":
					const parsedGiftSubMessage: LegacyGiftedSubscriptionsPayload = JSON.parse(
						parsedEvent.data
					);
					dispatch(
							MessageActionsFunc.gifSubMessage(
								enrichLegacyGiftedSubscriptionsPayload({
									...parsedGiftSubMessage,
									channelSlug: channelName,
									create_at: new Date().getTime(),
								})
							)
					);
					break;
				case "App\\Events\\MessageDeletedEvent":
					const parsedDeleteMessage: DeleteMessage = JSON.parse(
						parsedEvent.data
					);
					dispatch(
						MessageActionsFunc.modMessage({
							created_at: new Date().getTime(),
							channelSlug: channelName,
							type: "delete",
							id: parsedDeleteMessage.id,
							message: parsedDeleteMessage.message,
						})
					);
					break;
				case "App\\Events\\UserBannedEvent":
					const parsedBannedMessage: BanToMessage = JSON.parse(
						parsedEvent.data
					);
					dispatch(
						MessageActionsFunc.modMessage({
							created_at: new Date().getTime(),
							channelSlug: channelName,
							type: parsedBannedMessage.expires_at ? "to" : "ban",
							id: parsedBannedMessage.id,
							banned_by: parsedBannedMessage.banned_by,
							user: parsedBannedMessage.user,
							expires_at: parsedBannedMessage.expires_at,
						})
					);
					break;
				case "App\\Events\\UserUnbannedEvent":
					const parsedUnbannedMessage: UnBanTOMessage = JSON.parse(
						parsedEvent.data
					);
					dispatch(
						MessageActionsFunc.modMessage({
							type: "unban",
							channelSlug: channelName,
							created_at: new Date().getTime(),
							id: parsedUnbannedMessage.id,
							unbanned_by: parsedUnbannedMessage.unbanned_by,
							user: parsedUnbannedMessage.user,
						})
					);
					break;
				case "App\\Events\\FollowersUpdated":
					break;
				case "App\\Events\\StreamHostEvent":
					const parsedHostInfo: HostInfo = JSON.parse(parsedEvent.data);
					dispatch(
						MessageActionsFunc.setHostInfo({
							host_username: parsedHostInfo.host_username,
							channelSlug: channelName,
							number_viewers: parsedHostInfo.number_viewers,
							optional_message: parsedHostInfo.optional_message,
						})
					);
					break;
				default:
					break;
				}
			} catch (err) {
				console.log("Kick websocket event parse failed", parsedEvent.event, err);
			}
		});
	};
};
