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
interface EventType {
	channel: string;
	data: string;
	event: string;
}

const activeSockets = new Map<string, WebSocket>();
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
const STREAM_META_POLL_MS = 60 * 1000;

// ─── FIX-1/FIX-2: Pusher heartbeat (ping/pong) + backoff reconnect ───────────
// Pusher protokolu: bagli istemci sunucudan `pusher:ping` alir ve
// `pusher:pong` ile cevap vermek zorundadir; yoksa sunucu `activity_timeout`
// (genelde 120sn) sonra socket'i kapatir. Ayrica istemci-tarafli watchdog ile
// trafik durdugunda proaktif ping atip, hic aktivite yoksa olu socket'i kapatip
// reconnect tetikliyoruz.
const PUSHER_DEFAULT_ACTIVITY_TIMEOUT_S = 120;
// Watchdog tick: bu sureden uzun sessizlikte proaktif ping at.
const WATCHDOG_TICK_MS = 30 * 1000;
// Pong/aktivite icin verilen ek tolerans; bu sureyi de asarsa socket olu sayilir.
const WATCHDOG_GRACE_MS = 30 * 1000;
// FIX-2: sevenTvEvents.ts deseni — exponential backoff gecikmeleri.
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];

// Per-channel watchdog interval id'leri (heartbeat). close/yeni socket'te clear.
const watchdogTimers = new Map<string, ReturnType<typeof setInterval>>();
// Per-channel son aktivite (herhangi bir mesaj) zaman damgasi (ms).
const lastActivityAt = new Map<string, number>();
// Per-channel sunucudan gelen activity_timeout (ms).
const channelActivityTimeoutMs = new Map<string, number>();
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

		// FIX-2: yeni baglanti istegi = bilincli kapatma durumunu sifirla.
		// (Kanal yeniden izlenmeye basladi; reconnect tekrar serbest.)
		intentionalClose.delete(channelName);
		// FIX-1/FIX-2: onceki socket'e ait timer'lari temizle (leak guard).
		clearWatchdog(channelName);
		clearReconnectTimer(channelName);

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
		// FIX-1: watchdog baz degerleri.
		lastActivityAt.set(channelName, Date.now());
		channelActivityTimeoutMs.set(
			channelName,
			PUSHER_DEFAULT_ACTIVITY_TIMEOUT_S * 1000
		);

		// FIX-1: istemci-tarafli heartbeat watchdog. Trafik durdugunda proaktif
		// ping atar; hic aktivite yoksa olu socket'i kapatir (close handler
		// FIX-2 reconnect'i tetikler). Per-channel; close/yeni socket'te temizlenir.
		const watchdog = setInterval(() => {
			// Stale guard: bu interval artik aktif olmayan bir socket'e aitse dur.
			if (activeSockets.get(channelName) !== socket) {
				clearInterval(watchdog);
				return;
			}
			if (socket.readyState !== WebSocket.OPEN) {
				return;
			}
			const now = Date.now();
			const last = lastActivityAt.get(channelName) ?? now;
			const timeout =
				channelActivityTimeoutMs.get(channelName) ??
				PUSHER_DEFAULT_ACTIVITY_TIMEOUT_S * 1000;
			const silence = now - last;
			// timeout + grace boyunca hic aktivite yoksa socket olu say.
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
				return;
			}
			// Sessizlik WATCHDOG_TICK_MS'i astiysa proaktif ping at.
			if (silence >= WATCHDOG_TICK_MS) {
				try {
					socket.send('{"event":"pusher:ping","data":{}}');
					verboseLog("[chat watchdog] proactive ping", channelName);
				} catch {
					// noop
				}
			}
		}, WATCHDOG_TICK_MS);
		watchdogTimers.set(channelName, watchdog);

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
						// Sprint 45: channel_<id> Pusher kanalında KicksGifted
						// event'i yayınlanıyor (gift_transaction_id + sender +
						// gift.amount + mesaj). Multi-channel — tüm izlenen
						// kanallar için çalışır.
						socket.send(
							`{"event":"pusher:subscribe","data":{"auth":"","channel":"channel_${res.data.id}"}}`
						);
						// Sprint 49: chatroom_<chatroom_id> Pusher kanalında
						// RewardRedeemedEvent yayınlanıyor. Multi-channel.
						socket.send(
							`{"event":"pusher:subscribe","data":{"auth":"","channel":"chatroom_${res.data.chatroom.id}"}}`
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
			// Stale-socket guard: yalnizca hala aktif olan socket'in close'u
			// state'i degistirir / reconnect tetikler. Eski socket'in gec gelen
			// close'u yeni baglantiyi bozmamali.
			if (activeSockets.get(channelName) === socket) {
				activeSockets.delete(channelName);
				stopStreamMetaPolling(channelName);
				// FIX-1: bu socket'e ait watchdog'u temizle (leak guard).
				clearWatchdog(channelName);
				dispatch(
					MessageActionsFunc.setConnectionStatus("disconnected", channelName)
				);
				// FIX-2: kanal hala izleniyorsa (bilincli kapatma degilse) backoff
				// ile yeniden baglan.
				scheduleReconnect(dispatch, channelName, chatListener);
			}
		});

		socket.addEventListener("error", () => {
			if (activeSockets.get(channelName) === socket) {
				dispatch(
					MessageActionsFunc.setConnectionStatus("disconnected", channelName)
				);
				// Not: reconnect'i burada planlamiyoruz; "error" sonrasi tarayici
				// daima "close" event'i de yayar ve reconnect orada (tek noktada)
				// tetiklenir. Bu, cift reconnect planlamasini onler.
			}
		});

		// Listen for messages
		socket.addEventListener("message", (event) => {
			if (activeSockets.get(channelName) !== socket) {
				return;
			}
			// FIX-1: herhangi bir mesaj = aktivite. Watchdog bunu kullanir.
			lastActivityAt.set(channelName, Date.now());
			let parsedEvent: EventType;
			try {
				parsedEvent = JSON.parse(event.data);
			} catch (err) {
				console.log("Kick websocket parse failed", err);
				return;
			}
			try {
				switch (parsedEvent.event) {
					// FIX-1: Pusher protokol mesajlari ────────────────────────
					case "pusher:connection_established": {
						// data.activity_timeout (sn) — watchdog bunu baz alir.
						try {
							const payload = JSON.parse(parsedEvent.data || "{}");
							const timeoutS = Number(payload?.activity_timeout);
							if (Number.isFinite(timeoutS) && timeoutS > 0) {
								channelActivityTimeoutMs.set(
									channelName,
									timeoutS * 1000
								);
								verboseLog(
									"[chat] connection_established",
									channelName,
									`activity_timeout=${timeoutS}s`
								);
							}
						} catch {
							// noop: timeout okunamazsa default kalir
						}
						break;
					}
					case "pusher:ping":
						// Sunucu ping atti — derhal pong ile cevapla, yoksa
						// activity_timeout sonra socket kapanir.
						try {
							socket.send('{"event":"pusher:pong","data":{}}');
							verboseLog("[chat] pong sent", channelName);
						} catch {
							// noop
						}
						break;
					case "pusher:pong":
						// Bizim proaktif ping'imize sunucu yaniti — sadece aktivite
						// (yukarida lastActivityAt guncellendi). Ek is yok.
						break;
					case "pusher_internal:subscription_succeeded":
						// FIX-2: basarili abonelik = saglikli baglanti, backoff sayacini
						// sifirla. (Bir sonraki kopusta tekrar 1sn'den baslar.)
						reconnectAttempts.set(channelName, 0);
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
						const looksLikeGift =
							/gift/i.test(evtName) ||
							p?.gifter_username != null ||
							p?.gifter != null ||
							Array.isArray(p?.gifted_usernames) ||
							Array.isArray(p?.gifted_users) ||
							p?.gifted_username != null;
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
									"[Reward Pusher]",
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
						console.log("[Pusher unknown event]", parsedEvent.event);
					}
					break;
				}
				}
			} catch (err) {
				console.log("Kick websocket event parse failed", parsedEvent.event, err);
			}
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
