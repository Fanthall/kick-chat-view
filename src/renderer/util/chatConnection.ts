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
// Sprint 58: otomasyon rutini engine — event noktalarında çağırılır.
import {
	evaluateChatMessage,
	evaluateFollowEvent,
	evaluateGiftSubEvent,
	evaluateHostEvent,
	evaluateKicksEvent,
	evaluateRewardEvent,
	evaluateSubEvent,
} from "./automationRulesEngine";
// Sprint 61: bahis oyunu motoru — chat komutlarını işler.
import { evaluateGameMessage } from "./gameEngine";
// FIX-GIFT-DUP (2026-07-05): tek hediyenin çift event'le iki kez işlenmesini önler.
import { isDuplicateGift } from "./giftDedup";
// FIX-GIFT-LEADERBOARD (2026-07-06): GiftsLeaderboardUpdated'i gift sanmayı önler.
import { looksLikeGiftEvent } from "./giftEventClassify";
import type { KickRealtimeConnection } from "../../shared/kickRealtime";
import {
	buildConnectFrame,
	buildRefreshFrame,
	CONNECT_COMMAND_ID,
	isEventAllowedOnChannel,
	isServerPing,
	KickEvent,
	kickRealtimeChannels,
	parseRealtimeFrames,
	toKickEvent,
	tokenRefreshDelayMs,
} from "./kickRealtime";
import { MainProcessSocket, SOCKET_OPEN } from "./realtimeSocket";
import {
	parseGoal,
	parseNewSubscriber,
	parsePinnedMessage,
	parseStreamHosted,
} from "./kickPayloads";

const activeSockets = new Map<string, MainProcessSocket>();
const channelEmoteLoaders = new Set<string>();
// Sprint 46: per-channel last followers count cache for delta computation.
const lastFollowersCount = new Map<string, number>();
const channelEmoteLoadedAt = new Map<string, number>();
const channelEmoteUserIds = new Map<string, number>();
const channelSevenTvSetIds = new Map<string, Set<string>>();
const sevenTvSetSubscribed = new Set<string>();
const sevenTvRefreshDebounce = new Map<string, ReturnType<typeof setTimeout>>();
const streamMetaPollers = new Map<string, ReturnType<typeof setInterval>>();
const CHANNEL_EMOTE_TTL_MS = 10 * 60 * 1000;
const SEVENTV_REFRESH_DEBOUNCE_MS = 750;
// FIX (2026-07-04): topbar canli verisi (izleyici/CANLI/baslik/uptime) guncel gorunsun
// diye 60sn -> 30sn. Poll her seferinde resmi API'yi, basarisizsa OAuth'suz getChannelData
// fallback'ini dener; boylece OAuth olmadan da topbar surekli tazelenir.
const STREAM_META_POLL_MS = 30 * 1000;

// ─── Kick canli soketi (Centrifugo): heartbeat + backoff reconnect ───────────
// Sunucu `connect` cevabindaki `ping` (sn) araliginda `{}` yollar; istemci `{}`
// ile cevap vermezse sunucu socket'i kapatir. Istemci-tarafli watchdog, hic
// cerceve gelmeyen olu socket'i kapatip reconnect tetikler.
// `connect` cevabi gelene kadar varsayilan ping araligi (Kick: 25 sn).
const REALTIME_DEFAULT_PING_S = 25;
// Watchdog kontrol araligi.
const WATCHDOG_TICK_MS = 30 * 1000;
// Pong/aktivite icin verilen ek tolerans; bu sureyi de asarsa socket olu sayilir.
const WATCHDOG_GRACE_MS = 30 * 1000;
// FIX-2: sevenTvEvents.ts deseni — exponential backoff gecikmeleri.
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];

// Per-channel watchdog interval id'leri (heartbeat). close/yeni socket'te clear.
const watchdogTimers = new Map<string, ReturnType<typeof setInterval>>();
// Per-channel son aktivite (herhangi bir mesaj) zaman damgasi (ms).
const lastActivityAt = new Map<string, number>();
// Per-channel sunucunun ping araligi (ms).
const channelActivityTimeoutMs = new Map<string, number>();
// Per-channel bekleyen jeton yenileme timer'i (Centrifugo jetonu ~45 dk gecerli).
const tokenRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Per-channel baglanti denemesi sayaci; asenkron pazarlik sirasinda gelen yeni
// deneme eskisini gecersiz kilar.
const connectGenerations = new Map<string, number>();
// FIX-2: per-channel reconnect denemesi sayaci + bekleyen reconnect timer.
const reconnectAttempts = new Map<string, number>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
// FIX-2: kullanici/sistem tarafindan bilincli kapatilan kanallar — reconnect
// tetiklenmemeli (kanal listeden cikarildi / disconnect dendi).
const intentionalClose = new Set<string>();

const verboseLog = (...args: unknown[]) => {
	if (localStorage.getItem("chatViewVerboseLogging") === "true") {
		console.log(...args);
	}
};

const clearWatchdog = (channelName: string) => {
	const timer = watchdogTimers.get(channelName);
	if (timer) {
		clearInterval(timer);
		watchdogTimers.delete(channelName);
	}
};

const clearTokenRefresh = (channelName: string) => {
	const timer = tokenRefreshTimers.get(channelName);
	if (timer) {
		clearTimeout(timer);
		tokenRefreshTimers.delete(channelName);
	}
};

const clearReconnectTimer = (channelName: string) => {
	const timer = reconnectTimers.get(channelName);
	if (timer) {
		clearTimeout(timer);
		reconnectTimers.delete(channelName);
	}
};

// FIX-2: backoff ile chatListener'i tekrar dispatch et. Kanal bilincli
// kapatildiysa veya bu socket artik aktif degilse reconnect yapma.
const scheduleReconnect = (
	dispatch: FanthalDispatch,
	channelName: string,
	listenerFactory: (slug?: string) => (dispatch: FanthalDispatch) => void
) => {
	if (intentionalClose.has(channelName)) {
		return;
	}
	// Zaten bekleyen bir reconnect varsa cift planlama yapma.
	if (reconnectTimers.has(channelName)) {
		return;
	}
	const attempt = reconnectAttempts.get(channelName) ?? 0;
	const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
	reconnectAttempts.set(channelName, attempt + 1);
	verboseLog(
		"[chat reconnect] schedule",
		channelName,
		`attempt=${attempt + 1}`,
		`delay=${delay}ms`
	);
	const timer = setTimeout(() => {
		reconnectTimers.delete(channelName);
		if (intentionalClose.has(channelName)) {
			return;
		}
		dispatch(listenerFactory(channelName));
	}, delay);
	reconnectTimers.set(channelName, timer);
};

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
			// FIX (2026-07-04): Resmi API (OAuth) yok/başarısızsa, OAuth'SUZ public
			// endpoint'ten (getChannelData = kick.com/api/v2 — chat bootstrap'ı zaten
			// bununla çalışıyor) canlı bilgisini doldur. Böylece topbar CANLI / izleyici /
			// başlık / kategori OAuth olmadan da gösterilir; poller bunu N sn'de tazeler.
			getChannelData(channelSlug)
				.then((res) => {
					const ls = res?.data?.livestream;
					const cat = ls?.categories?.[0];
					dispatch(
						MessageActionsFunc.setStreamMeta({
							channelSlug,
							broadcasterUserId: res?.data?.user_id,
							streamTitle: ls?.session_title,
							category: cat
								? { id: cat.id, name: cat.name, thumbnail: undefined }
								: undefined,
							viewerCount: ls?.viewer_count,
							isLive: !!ls?.is_live,
							startedAt: ls?.start_time,
							updatedAt: Date.now(),
						})
					);
				})
				.catch(() => {
					// noop: iki kaynak da başarısız
				});
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

		// FIX-2: yeni baglanti istegi = bilincli kapatma durumunu sifirla.
		// (Kanal yeniden izlenmeye basladi; reconnect tekrar serbest.)
		intentionalClose.delete(channelName);
		// FIX-1/FIX-2: onceki socket'e ait timer'lari temizle (leak guard).
		clearWatchdog(channelName);
		clearReconnectTimer(channelName);
		clearTokenRefresh(channelName);

		const existingSocket = activeSockets.get(channelName);
		if (existingSocket) {
			existingSocket.close();
			activeSockets.delete(channelName);
		}

		// Kanal bilgisi + soket pazarligi asenkron; bu arada ayni kanal icin yeni
		// bir chatListener ya da disconnect gelirse eski deneme sessizce biter.
		const generation = (connectGenerations.get(channelName) ?? 0) + 1;
		connectGenerations.set(channelName, generation);
		const isCurrentAttempt = () =>
			connectGenerations.get(channelName) === generation &&
			!intentionalClose.has(channelName);

		dispatch(MessageActionsFunc.setConnectionStatus("connecting", channelName));

		// Kick olayini isler. Govde Pusher donemiyle ayni (event adi + JSON
		// string data); Centrifugo zarfi `toKickEvent` ile bu sekle cevrilir.
		const handleKickEvent = (parsedEvent: KickEvent) => {
			try {
				switch (parsedEvent.event) {
					case "App\\Events\\ChatMessageEvent":
						const parsedMessage: UserMessage = JSON.parse(parsedEvent.data);
						dispatch(
							MessageActionsFunc.newMessage({
								...parsedMessage,
								channelSlug: channelName,
							})
						);
						// Sprint 58: chat_match + mention triggers
						try {
							evaluateChatMessage(
								channelName,
								parsedMessage?.sender?.username || "",
								parsedMessage?.content || ""
							);
						} catch (autoErr) {
							console.log("automation chat eval failed", autoErr);
						}
						// Sprint 61: bahis oyunu komutları (!joingame / !bahis / !puan / !top).
						// Oyun kapalıysa veya mesaj komut değilse ucuz no-op.
						try {
							// Yetkili = yayıncı veya moderatör (rozetten) ya da kanalın
							// sahibi. `!reset` gibi komutlar yalnız bunlara açıktır.
							const senderBadges =
								parsedMessage?.sender?.identity?.badges || [];
							const senderName = parsedMessage?.sender?.username || "";
							const isPrivileged =
								senderBadges.some((b: any) => {
									const type = String(b?.type).toLowerCase();
									return type === "broadcaster" || type === "moderator";
								}) ||
								senderName.trim().toLowerCase() ===
									channelName.trim().toLowerCase();

							evaluateGameMessage(
								channelName,
								senderName,
								parsedMessage?.content || "",
								parsedMessage?.id,
								isPrivileged
							);
						} catch (gameErr) {
							console.log("game chat eval failed", gameErr);
						}
						// FIX-2: celebration (re-sub) chat mesaji = sub event de.
						// Reducer banner+activity uretir; otomasyon tetigini burada
						// (event noktasi) cagiriyoruz. months: metadata.celebration
						// .total_months ?? subscriber badge count.
						try {
							if (parsedMessage?.type === "celebration") {
								const celeb = (parsedMessage as any)?.metadata
									?.celebration;
								const badge = parsedMessage?.sender?.identity?.badges?.find(
									(b: any) =>
										String(b?.type).toLowerCase() === "subscriber"
								);
								const celebMonths =
									typeof celeb?.total_months === "number"
										? celeb.total_months
										: typeof badge?.count === "number"
										? badge.count
										: undefined;
								const celebIsRenewal =
									celebMonths === undefined || celebMonths > 1;
								evaluateSubEvent(
									channelName,
									parsedMessage?.sender?.username,
									celebMonths,
									celebIsRenewal
								);
							}
						} catch (autoErr) {
							console.log(
								"automation celebration sub eval failed",
								autoErr
							);
						}
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
					// Sprint 58 + FIX-3: sub_event trigger. months>1 → yenileme.
					// streak destekçi sinyal (bazı kanallarda months yok).
					try {
						const subMonthsRaw =
							(parsedSubMessage as any)?.months;
						const subStreakRaw =
							(parsedSubMessage as any)?.streak;
						const subMonths =
							typeof subMonthsRaw === "number"
								? subMonthsRaw
								: Number(subMonthsRaw);
						const subStreak = Number(subStreakRaw);
						const subIsRenewal =
							(Number.isFinite(subMonths) && subMonths > 1) ||
							(Number.isFinite(subStreak) && subStreak > 1);
						evaluateSubEvent(
							channelName,
							(parsedSubMessage as any)?.username,
							Number.isFinite(subMonths) ? subMonths : undefined,
							subIsRenewal
						);
					} catch (autoErr) {
						console.log("automation sub eval failed", autoErr);
					}
					break;
				// Ilk kez abone olan: Kick artik bunu kanal akisi olayiyla bildiriyor.
				// Ayni yoldan (subMessage) gecer: aktivite, bant, cift kayit ve hediye
				// alicisi bastirma korumalari aynen gecerli.
				case "App\\Events\\NewActivityFeedEvent": {
					const newSubscriber = parseNewSubscriber(parsedEvent.data);
					if (!newSubscriber) break;
					dispatch(
						MessageActionsFunc.subMessage(
							enrichLegacySubscriptionPayload({
								chatroom_id: 0,
								username: newSubscriber.username,
								months: 1,
								channelSlug: channelName,
								create_at: newSubscriber.createdAt,
							})
						)
					);
					try {
						evaluateSubEvent(channelName, newSubscriber.username, 1, false);
					} catch (autoErr) {
						console.log("automation new subscriber eval failed", autoErr);
					}
					break;
				}
				// Ayni aboneligin tekrarlari; NewActivityFeedEvent isleniyor.
				case "App\\Events\\ChannelSubscriptionEvent":
				case "App\\Events\\NewSubscriberUpdatedEvent":
					break;
				case "App\\Events\\GiftedSubscriptionsEvent": {
					const parsedGiftSubMessage: LegacyGiftedSubscriptionsPayload = JSON.parse(
						parsedEvent.data
					);
					// FIX-GIFT-AUTOMATION: enrich SONUCU hem dispatch hem otomasyon
					// için ortak kullanılır. Önceden otomasyona ham payload'ın
					// `gifted_usernames` alanı geçiyordu; Kick alıcıları
					// `usernames` / `gifted_users[]` / `gifted_username` ile
					// gönderdiğinde liste boş kalıyor, alıcılar gift-recipient
					// cache'ine işaretlenmiyor ve arkadan gelen SubscriptionEvent
					// sub_event rutinini alıcı için de tetikliyordu.
					const enrichedGiftSub = enrichLegacyGiftedSubscriptionsPayload({
						...parsedGiftSubMessage,
						channelSlug: channelName,
						create_at: new Date().getTime(),
					});
					// FIX-GIFT-DUP: aynı gifter'dan pencere içinde ikinci hediye
					// event'i (aşağıdaki fallback yakalaması dahil) duplike sayılır;
					// hem aktivite dispatch'i hem otomasyon atlanır.
					if (
						isDuplicateGift(
							channelName,
							enrichedGiftSub.gifter_username
						)
					) {
						console.log(
							"[gift-dedup] duplike hediye atlandı (resmî event):",
							enrichedGiftSub.gifter_username
						);
						break;
					}
					dispatch(MessageActionsFunc.gifSubMessage(enrichedGiftSub));
					// Sprint 58 + 58b: gift_sub_event trigger + recipient cache
					try {
						const recipients: string[] =
							enrichedGiftSub.gifted_usernames ?? [];
						const giftCount =
							recipients.length ||
							(parsedGiftSubMessage as any)?.amount;
						evaluateGiftSubEvent(
							channelName,
							enrichedGiftSub.gifter_username,
							giftCount,
							recipients
						);
					} catch (autoErr) {
						console.log("automation gift sub eval failed", autoErr);
					}
					break;
				}
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
				case "App\\Events\\FollowersUpdated": {
					// Sprint 46: Pusher chatroom Pusher'ı FollowersUpdated
					// event'i yayınlıyor. Çoğu kanal sadece toplam count
					// veriyor (bireysel isim yok). Delta hesabıyla "+N
					// takipçi" notification basabiliyoruz; ancak isim
					// genelde gelmez (webhook channel.followed gerekir).
					try {
						const payload = JSON.parse(parsedEvent.data || "{}");
						// Olası alanlar: followersCount, followers, count
						const newCount: number | undefined =
							payload?.followersCount ??
							payload?.followers_count ??
							payload?.count ??
							payload?.followers;
						const prev = lastFollowersCount.get(channelName);
						if (typeof newCount === "number" && Number.isFinite(newCount)) {
							const delta =
								typeof prev === "number" ? newCount - prev : 0;
							lastFollowersCount.set(channelName, newCount);
							// Settings'te kapalıysa hiç dispatch yapma.
							const showFollowers =
								localStorage.getItem("chatViewShowFollowers") !==
								"false";
							if (showFollowers && delta > 0) {
								// Sprint 58: follow_event trigger
								try {
									evaluateFollowEvent(channelName, delta);
								} catch (autoErr) {
									console.log("automation follow eval failed", autoErr);
								}
								const now = Date.now();
								const id = `follow-count-${channelName}-${now}`;
								const text =
									delta === 1
										? `Yeni takipçi geldi (toplam ${newCount})`
										: `+${delta} takipçi (toplam ${newCount})`;
								dispatch(
									MessageActionsFunc.addActivity({
										id,
										channelSlug: channelName,
										kind: "follow",
										actor: { username: "Yeni takipçi" },
										username: "Yeni takipçi",
										amount: delta,
										message: `Toplam: ${newCount}`,
										createdAt: now,
										create_at: now,
										raw: payload,
									})
								);
								dispatch(
									MessageActionsFunc.newMessage({
										id: `follow-banner-${id}`,
										channelSlug: channelName,
										chatroom_id: 0,
										content: text,
										type: "follow-banner",
										created_at: new Date(now).toISOString(),
										sender: {
											id: 0,
											username: "Yeni takipçi",
											slug: "yeni-takipci",
											identity: {
												color: "#22d3ee",
												badges: [],
											},
										},
									} as any)
								);
							}
						}
						if (
							localStorage.getItem("chatViewVerboseLogging") === "true"
						) {
							console.log(
								"[FollowersUpdated]",
								channelName,
								"payload:",
								payload
							);
						}
					} catch (followErr) {
						console.log("FollowersUpdated parse failed", followErr);
					}
					break;
				}
				// Host/raid: Kick artik `StreamHostedEvent` adiyla ve `chatrooms.<id>`
				// kanalinda yayinliyor (eski `StreamHostEvent` gelmiyor).
				case "App\\Events\\StreamHostedEvent":
					const parsedHostInfo: HostInfo = parseStreamHosted(parsedEvent.data);
					if (!parsedHostInfo.host_username) break;
					dispatch(
						MessageActionsFunc.setHostInfo({
							host_username: parsedHostInfo.host_username,
							channelSlug: channelName,
							number_viewers: parsedHostInfo.number_viewers,
							optional_message: parsedHostInfo.optional_message,
						})
					);
					// Sprint 58: host_event trigger
					try {
						evaluateHostEvent(
							channelName,
							parsedHostInfo.host_username,
							parsedHostInfo.number_viewers
						);
					} catch (autoErr) {
						console.log("automation host eval failed", autoErr);
					}
					break;
				// Yayin basladi/bitti: ust bardaki CANLI/izleyici/baslik 30 sn'lik
				// yoklamayi beklemeden hemen tazelenir.
				case "App\\Events\\StreamerIsLive":
				case "App\\Events\\StopStreamBroadcast":
					dispatch(refreshStreamMeta(channelName));
					break;
				// Moderator sohbeti temizledi.
				case "App\\Events\\ChatroomClearEvent":
					dispatch(MessageActionsFunc.clearChannelMessages(channelName));
					break;
				case "App\\Events\\PinnedMessageCreatedEvent": {
					const pinned = parsePinnedMessage(JSON.parse(parsedEvent.data || "{}"));
					if (pinned) {
						dispatch(
							MessageActionsFunc.setPinnedMessage(channelName, {
								...pinned,
								message: { ...pinned.message, channelSlug: channelName },
							})
						);
					}
					break;
				}
				case "App\\Events\\PinnedMessageDeletedEvent":
					dispatch(MessageActionsFunc.setPinnedMessage(channelName, null));
					break;
				// Hedef tamamlandi → aktivite. Ilerleme dakikada birkac kez geldigi
				// icin akisi doldurmasin diye diger hedef olaylari sessiz gecilir.
				case "GoalAchievedEvent": {
					const goal = parseGoal(parsedEvent.data);
					if (goal) {
						const achievedAt = Date.now();
						dispatch(
							MessageActionsFunc.addActivity({
								id: `goal-${goal.id}`,
								channelSlug: channelName,
								kind: "goal_achieved",
								actor: { username: channelName },
								amount: goal.targetValue,
								title: goal.type,
								createdAt: achievedAt,
								create_at: achievedAt,
								raw: goal,
							})
						);
					}
					break;
				}
				// Bilinen ama uygulamada karsiligi olmayan olaylar: "bilinmeyen olay"
				// loguna dusmesin.
				case "GoalCreatedEvent":
				case "GoalUpdatedEvent":
				case "GoalProgressUpdateEvent":
				case "GoalCanceledEvent":
				case "KicksLeaderboardUpdated":
				case "GiftsLeaderboardUpdated":
					break;
				case "RewardRedeemedEvent": {
					// Sprint 49: chatroom_<id> kanalında reward redemption.
					try {
						const p = JSON.parse(parsedEvent.data || "{}");
						const username: string = p?.username || "Anonim";
						const userId: number | undefined =
							typeof p?.user_id === "number" ? p.user_id : undefined;
						const createdMs = Date.now();
						const id = `reward-${channelName}-${userId || username}-${createdMs}`;
						// Sprint 58: reward_redeemed trigger
						try {
							evaluateRewardEvent(channelName, username, p?.reward_title);
						} catch (autoErr) {
							console.log("automation reward eval failed", autoErr);
						}
						dispatch(
							MessageActionsFunc.addActivity({
								id,
								channelSlug: channelName,
								kind: "reward_redemption",
								actor: { id: userId, username },
								username,
								title: p?.reward_title,
								message: p?.user_input,
								status: "pending",
								createdAt: createdMs,
								create_at: createdMs,
								raw: p,
							})
						);
						if (
							localStorage.getItem("chatViewVerboseLogging") === "true"
						) {
							console.log(
								"[RewardRedeemed]",
								channelName,
								p?.reward_title,
								username
							);
						}
					} catch (rewErr) {
						console.log("RewardRedeemedEvent parse failed", rewErr);
					}
					break;
				}
				case "KicksGifted": {
					// Sprint 45: channel_<id> Pusher kanalında bireysel KICKs
					// gönderim event'i. Webhook gerek yok, multi-channel çalışır.
					try {
						const p = JSON.parse(parsedEvent.data || "{}");
						const sender = p?.sender || {};
						const gift = p?.gift || {};
						const createdMs = p?.created_at
							? new Date(p.created_at).getTime()
							: Date.now();
						const id =
							p?.gift_transaction_id ||
							`kicks-${channelName}-${sender.id}-${createdMs}`;
						const username: string = sender.username || "Anonim";
						const amount: number =
							typeof gift.amount === "number" ? gift.amount : 0;
						const message: string | undefined = p?.message;
						// Sprint 58: kicks_event trigger
						try {
							evaluateKicksEvent(channelName, username, amount);
						} catch (autoErr) {
							console.log("automation kicks eval failed", autoErr);
						}
						dispatch(
							MessageActionsFunc.addActivity({
								id,
								channelSlug: channelName,
								kind: "kicks_gifted",
								actor: {
									id: sender.id,
									username,
									profilePicture: sender.profile_picture,
								},
								username,
								amount,
								giftName: gift.name,
								giftType: gift.type,
								giftTier: gift.tier,
								pinnedTimeSeconds:
									typeof gift.pinned_time === "number"
										? Math.round(gift.pinned_time / 1_000_000_000)
										: undefined,
								message,
								createdAt: createdMs,
								create_at: createdMs,
								raw: p,
							})
						);
						const banner = {
							id: `kicks-banner-${id}`,
							channelSlug: channelName,
							chatroom_id: 0,
							content:
								`${username}, ${amount} KICKs gönderdi` +
								(gift.name ? ` — ${gift.name}` : "") +
								(message ? `: ${message}` : ""),
							type: "kicks-banner",
							created_at: new Date(createdMs).toISOString(),
							sender: {
								id: sender.id ?? 0,
								username,
								slug: username.toLowerCase(),
								identity: {
									color: sender.username_color || "#61a8ff",
									badges: [],
								},
							},
						};
						dispatch(MessageActionsFunc.newMessage(banner as any));
					} catch (kicksErr) {
						console.log("KicksGifted parse failed", kicksErr);
					}
					break;
				}
				default: {
					// Sprint 49: reward redemption event'i Pusher'da
					// belgelenmedi; payload'da reward + user var mı diye
					// proaktif kontrol et. Belirsiz isimli event'leri
					// verbose log'a yaz.
					try {
						const evtName: string = parsedEvent.event || "";
						const p = JSON.parse(parsedEvent.data || "{}");
						// FIX-GIFT-CAPTURE: Gift event bazı kanallarda resmi
						// "App\\Events\\GiftedSubscriptionsEvent" adıyla GELMİYOR
						// (farklı event adı / payload şekli). Bu yüzden gift hem
						// activity'de görünmüyor hem rutin tetiklenmiyordu (ikisi
						// de bu case'e düştüğü için sessizce kayboluyordu). Burada
						// gift-benzeri her event'i (ad veya gifter/gifted alanları)
						// yakalayıp resmi gift yoluna sokuyoruz; gerçek event adını
						// da flag'tan BAĞIMSIZ logluyoruz (tek canlı gift ile teyit).
						// FIX-GIFT-LEADERBOARD: leaderboard/ranking event'leri (adında
						// "gift" geçse bile) gift sayılmaz — bkz. giftEventClassify.ts.
						const looksLikeGift = looksLikeGiftEvent(evtName, p);
						if (looksLikeGift) {
							console.log(
								"[GiftLikeEvent] yakalandı — event adı:",
								evtName,
								"payload:",
								p
							);
							// FIX-GIFT-AUTOMATION: resmi path ile aynı — otomasyon
							// alıcı listesini enrich edilmiş (normalize) payload'dan
							// alır; ham `gifted_usernames` farklı şekillerde
							// gelebildiği için alıcı işaretleme deliniyordu.
							const enrichedGiftLike =
								enrichLegacyGiftedSubscriptionsPayload({
									...p,
									channelSlug: channelName,
									create_at: new Date().getTime(),
								});
							// FIX-GIFT-DUP: resmî GiftedSubscriptionsEvent bu hediyeyi
							// zaten işlediyse (aynı gifter, pencere içinde) burada
							// tekrar dispatch + otomasyon YAPMA. Resmî event'i
							// göndermeyen kanallarda ilk gelen bu olur ve işlenir.
							if (
								isDuplicateGift(
									channelName,
									enrichedGiftLike.gifter_username
								)
							) {
								console.log(
									"[gift-dedup] duplike hediye atlandı (fallback):",
									enrichedGiftLike.gifter_username,
									"event:",
									evtName
								);
								break;
							}
							dispatch(
								MessageActionsFunc.gifSubMessage(enrichedGiftLike)
							);
							try {
								const recipients: string[] =
									enrichedGiftLike.gifted_usernames ?? [];
								const giftCount = recipients.length || p?.amount;
								evaluateGiftSubEvent(
									channelName,
									enrichedGiftLike.gifter_username,
									giftCount,
									recipients
								);
							} catch (autoErr) {
								console.log(
									"automation gift-like eval failed",
									autoErr
								);
							}
							break;
						}
						const isReward =
							/reward|redemption/i.test(evtName) ||
							(p?.reward && (p?.user || p?.redeemer)) ||
							!!p?.redemption;
						if (isReward) {
							const user = p?.user || p?.redeemer || {};
							const reward = p?.reward || {};
							const redemption = p?.redemption || {};
							const username: string =
								user.username || user.name || "Anonim";
							const createdMs = p?.created_at
								? new Date(p.created_at).getTime()
								: Date.now();
							const id =
								redemption.id ||
								p?.id ||
								`reward-${channelName}-${username}-${createdMs}`;
							dispatch(
								MessageActionsFunc.addActivity({
									id,
									channelSlug: channelName,
									kind: "reward_redemption",
									actor: {
										id: user.id || user.user_id,
										username,
									},
									username,
									amount: reward.cost,
									title: reward.title,
									message:
										redemption.user_input || p?.user_input,
									status:
										redemption.status === "accepted" ||
										redemption.status === "rejected"
											? redemption.status
											: "pending",
									createdAt: createdMs,
									create_at: createdMs,
									raw: p,
								})
							);
							if (
								localStorage.getItem("chatViewVerboseLogging") ===
								"true"
							) {
								console.log(
									"[Reward realtime]",
									channelName,
									"event:",
									evtName,
									"payload:",
									p
								);
							}
							break;
						}
					} catch {
						/* fall through */
					}
					if (
						localStorage.getItem("chatViewVerboseLogging") === "true"
					) {
						console.log(
							"[Kick realtime unknown event]",
							parsedEvent.event,
							parsedEvent.channel,
							parsedEvent.data.slice(0, 800)
						);
					}
					break;
				}
				}
			} catch (err) {
				console.log("Kick websocket event parse failed", parsedEvent.event, err);
			}
		};

		// Centrifugo soketi (main process'te acilir, MainProcessSocket vekiliyle
		// konusulur): ac → connect + abonelikler → sunucunun `{}` ping'ine
		// `{}` ile cevap → jeton suresi dolmadan `refresh`. Kopunca backoff ile
		// bastan (kanal bilgisi + yeni jeton) baglanilir.
		const openRealtimeSocket = (
			realtime: KickRealtimeConnection,
			channelId: number,
			chatroomId: number
		) => {
			const socket = new MainProcessSocket(realtime.url);
			activeSockets.set(channelName, socket);
			const subscriptions = kickRealtimeChannels(channelId, chatroomId);
			let nextCommandId = CONNECT_COMMAND_ID + subscriptions.length + 1;
			lastActivityAt.set(channelName, Date.now());
			channelActivityTimeoutMs.set(
				channelName,
				REALTIME_DEFAULT_PING_S * 1000
			);

			// Watchdog: sunucu `ping` saniyede bir `{}` yollar. ping + tolerans
			// boyunca hic cerceve gelmezse socket olu sayilir ve kapatilir (close
			// handler yeniden baglanir). Centrifugo'da istemci ping'i yok.
			const watchdog = setInterval(() => {
				if (activeSockets.get(channelName) !== socket) {
					clearInterval(watchdog);
					return;
				}
				if (socket.readyState !== SOCKET_OPEN) {
					return;
				}
				const now = Date.now();
				const silence = now - (lastActivityAt.get(channelName) ?? now);
				const timeout =
					channelActivityTimeoutMs.get(channelName) ??
					REALTIME_DEFAULT_PING_S * 1000;
				if (silence > timeout + WATCHDOG_GRACE_MS) {
					verboseLog(
						"[chat watchdog] no activity, closing dead socket",
						channelName,
						`silence=${silence}ms`
					);
					try {
						socket.close();
					} catch {
						// noop
					}
				}
			}, WATCHDOG_TICK_MS);
			watchdogTimers.set(channelName, watchdog);

			const scheduleTokenRefresh = (ttlSeconds?: number) => {
				clearTokenRefresh(channelName);
				if (!ttlSeconds || ttlSeconds <= 0) return;
				const timer = setTimeout(() => {
					tokenRefreshTimers.delete(channelName);
					window.electron.kick
						.getRealtimeToken(realtime.clientId)
						.then((token) => {
							if (
								activeSockets.get(channelName) !== socket ||
								socket.readyState !== SOCKET_OPEN
							) {
								return;
							}
							socket.send(buildRefreshFrame(token, nextCommandId));
							nextCommandId += 1;
						})
						.catch((err) => {
							// Yenilenemezse temiz baslangic: close handler yeniden baglanir.
							console.log("Kick realtime token refresh failed", err);
							if (activeSockets.get(channelName) === socket) {
								socket.close();
							}
						});
				}, tokenRefreshDelayMs(ttlSeconds));
				tokenRefreshTimers.set(channelName, timer);
			};

			socket.addEventListener("open", () => {
				socket.send(buildConnectFrame(realtime.token, subscriptions));
			});

			socket.addEventListener("close", () => {
				// Stale-socket guard: yalnizca hala aktif olan socket'in close'u
				// state'i degistirir / reconnect tetikler. Eski socket'in gec gelen
				// close'u yeni baglantiyi bozmamali.
				if (activeSockets.get(channelName) === socket) {
					activeSockets.delete(channelName);
					stopStreamMetaPolling(channelName);
					clearWatchdog(channelName);
					clearTokenRefresh(channelName);
					dispatch(
						MessageActionsFunc.setConnectionStatus("disconnected", channelName)
					);
					// Kanal hala izleniyorsa (bilincli kapatma degilse) backoff ile
					// yeniden baglan.
					scheduleReconnect(dispatch, channelName, chatListener);
				}
			});

			socket.addEventListener("error", () => {
				if (activeSockets.get(channelName) === socket) {
					dispatch(
						MessageActionsFunc.setConnectionStatus("disconnected", channelName)
					);
					// Reconnect burada planlanmaz: "error" sonrasi tarayici daima
					// "close" da yayar; reconnect tek noktada (close) tetiklenir.
				}
			});

			socket.addEventListener("message", (event) => {
				if (activeSockets.get(channelName) !== socket) {
					return;
				}
				// Herhangi bir cerceve = aktivite. Watchdog bunu kullanir.
				lastActivityAt.set(channelName, Date.now());
				for (const reply of parseRealtimeFrames(event.data)) {
					if (isServerPing(reply)) {
						// Cevapsiz ping'de sunucu baglantiyi kapatir.
						try {
							socket.send("{}");
						} catch {
							// noop
						}
						continue;
					}
					if (reply.error) {
						console.log("Kick realtime error", reply.id, reply.error);
						// connect reddedildiyse socket ise yaramaz; bastan baglan.
						if (reply.id === CONNECT_COMMAND_ID) {
							socket.close();
						}
						continue;
					}
					if (reply.connect) {
						const pingS = Number(reply.connect.ping);
						if (Number.isFinite(pingS) && pingS > 0) {
							channelActivityTimeoutMs.set(channelName, pingS * 1000);
						}
						if (reply.connect.expires) {
							scheduleTokenRefresh(reply.connect.ttl);
						}
						continue;
					}
					if (reply.refresh) {
						if (reply.refresh.expires) {
							scheduleTokenRefresh(reply.refresh.ttl);
						}
						continue;
					}
					if (reply.subscribe) {
						// Basarili abonelik = saglikli baglanti; backoff sifirlanir
						// (bir sonraki kopusta tekrar 1 sn'den baslar).
						reconnectAttempts.set(channelName, 0);
						dispatch(
							MessageActionsFunc.setConnectionStatus("connected", channelName)
						);
						continue;
					}
					if (reply.push?.disconnect) {
						verboseLog(
							"[chat] server disconnect",
							channelName,
							reply.push.disconnect
						);
						socket.close();
						continue;
					}
					const kickEvent = toKickEvent(reply);
					if (kickEvent && isEventAllowedOnChannel(kickEvent)) {
						handleKickEvent(kickEvent);
					}
				}
			});
		};

		getChannelData(channelName)
			.then((res) => {
				if (!isCurrentAttempt()) return;
				const channelId = res.data.id;
				const chatroomId = res.data.chatroom.id;
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
						if (isCurrentAttempt()) {
							const pinned = parsePinnedMessage(historyRes.data.data.pinned_message);
							dispatch(
								MessageActionsFunc.setPinnedMessage(
									channelName,
									pinned
										? {
												...pinned,
												message: { ...pinned.message, channelSlug: channelName },
										  }
										: null
								)
							);
						}
						const historyMessages = historyRes.data.data.messages || [];
						historyMessages
							.slice()
							.sort(
								(a, b) =>
									new Date(a.created_at).getTime() -
									new Date(b.created_at).getTime()
							)
							.forEach((message) => {
								if (isCurrentAttempt()) {
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

				window.electron.kick
					.getRealtimeConnection(channelId)
					.then((realtime) => {
						if (!isCurrentAttempt()) return;
						openRealtimeSocket(realtime, channelId, chatroomId);
					})
					.catch((err) => {
						// Ag ya da Kick tarafi gecici hata: backoff ile yeniden dene.
						console.log("Kick realtime connection failed", err);
						if (!isCurrentAttempt()) return;
						stopStreamMetaPolling(channelName);
						dispatch(
							MessageActionsFunc.setConnectionStatus("disconnected", channelName)
						);
						scheduleReconnect(dispatch, channelName, chatListener);
					});
			})
			.catch((err) => {
				// Kanal bulunamadi / Kick API hatasi: eskisi gibi yeniden denenmez.
				console.log("Kick channel load failed", err);
				if (!isCurrentAttempt()) return;
				dispatch(
					MessageActionsFunc.setConnectionStatus("disconnected", channelName)
				);
			});
	};
};

// ─── FIX-2: Kanal disconnect (bilincli kapatma) ──────────────────────────────
// Kullanici bir kanali listeden cikardiginda / disconnect dediginde cagrilir.
// intentionalClose isaretler (reconnect tetiklenmez), tum timer'lari temizler ve
// socket'i kapatir. Mevcut "kanal kapatinca socket acik kaliyor" leak'ini de
// kapatir.
export const disconnectChannel = (slug?: string) => {
	const channelName = slug?.trim().toLowerCase();
	if (!channelName) return;
	intentionalClose.add(channelName);
	clearWatchdog(channelName);
	clearReconnectTimer(channelName);
	clearTokenRefresh(channelName);
	reconnectAttempts.delete(channelName);
	stopStreamMetaPolling(channelName);
	const socket = activeSockets.get(channelName);
	if (socket) {
		activeSockets.delete(channelName);
		try {
			socket.close();
		} catch {
			// noop
		}
	}
};

// ─── FIX-4: Online/offline reconnect (shell-agnostic) ────────────────────────
// Classic Layout.tsx'te olan ag listener'i modern shell'e tasinmamisti
// (regresyon). Burada modul seviyesinde, bir kez kurulur → shell degisse de
// yasar. online → izlenen tum kanallar icin reconnect; offline → status
// disconnected. LayoutModern'a koymadan, tek-kanal sinirina takilmadan calisir.
let networkListenersInstalled = false;

export const installNetworkResilience = (dispatch: FanthalDispatch) => {
	if (networkListenersInstalled) return;
	if (typeof window === "undefined") return;
	networkListenersInstalled = true;

	const handleOnline = () => {
		verboseLog("[chat] network online — reconnecting watched channels");
		// Izlenen (bilincli kapatilmamis) tum kanallar icin reconnect.
		// activeSockets + reconnect bekleyen kanallar birlikte dusunulur.
		const channels = new Set<string>([
			...activeSockets.keys(),
			...reconnectTimers.keys(),
			...watchdogTimers.keys(),
		]);
		for (const channelName of channels) {
			if (intentionalClose.has(channelName)) continue;
			// Reconnect bekleyen timer'i iptal et, aninda yeniden baglan.
			clearReconnectTimer(channelName);
			reconnectAttempts.set(channelName, 0);
			dispatch(chatListener(channelName));
		}
	};

	const handleOffline = () => {
		verboseLog("[chat] network offline — marking channels disconnected");
		for (const channelName of activeSockets.keys()) {
			dispatch(
				MessageActionsFunc.setConnectionStatus("disconnected", channelName)
			);
		}
	};

	window.addEventListener("online", handleOnline);
	window.addEventListener("offline", handleOffline);
};
