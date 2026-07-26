/**
 * Sprint 61 — Bahis oyunu motoru.
 *
 * chatConnection.ts her chat mesajı için `evaluateGameMessage()` çağırır.
 * Motor:
 *   1) Ayarı in-memory cache'ler (localStorage'dan auto-refresh — rutin deseni).
 *   2) Mesaj id'siyle dedup yapar (reconnect'te aynı mesaj iki kez gelebilir).
 *   3) Oturumu çözer (yeni yayın → sıfırla, kısa kopma → sürdür).
 *   4) Komutu uygular ve cevabı KUYRUĞA atar.
 *   5) Kuyruğu toplu (batch) gönderir — Kick rate-limit koruması.
 *
 * Rate-limit notu: aktif bir yayında her bahse ayrı mesaj atmak saniyede
 * birden fazla sendChatMessage demektir → bot susturma riski. Bu yüzden
 * VARSAYILAN mod "batch": biriken sonuçlar tek mesajda özetlenir.
 */

import { GamePlayer, settleBet, validateBet } from "./gameEconomy";
import {
	PRIVILEGED_COMMANDS,
	parseGameCommand,
	primaryCommandName,
	resolveBetAmount,
} from "./gameCommands";
import {
	GAME_CONFIG_CHANGED,
	GameConfig,
	GameSession,
	createSession,
	gameAppliesToChannel,
	getOrCreatePlayer,
	getSession,
	hasJoined,
	leaderboard,
	loadGameConfig,
	loadSessions,
	putPlayer,
	putSession,
	resolveSession,
	rollLuckCycle,
	saveSessions,
} from "./gameStorage";

// ─── Ayar cache ──────────────────────────────────────────────────────────────

let cachedConfig: GameConfig | undefined;
let initialized = false;

const config = (): GameConfig => {
	if (!cachedConfig) cachedConfig = loadGameConfig();
	return cachedConfig;
};

const refreshConfig = () => {
	cachedConfig = loadGameConfig();
};

const ensureInitialized = () => {
	if (initialized) return;
	initialized = true;
	refreshConfig();
	startLiveWatcher();
	try {
		window.addEventListener(GAME_CONFIG_CHANGED, refreshConfig);
		window.addEventListener("storage", (e) => {
			if (e.key === "chatViewGameConfig") refreshConfig();
		});
	} catch {
		/* ignore */
	}
};

// ─── Mesaj dedup ─────────────────────────────────────────────────────────────

const SEEN_LIMIT = 500;
const seenMessageIds: string[] = [];
const seenMessageSet = new Set<string>();

/** Aynı mesaj daha önce işlendiyse true (ve işaretlemez). */
const alreadyProcessed = (messageId: string | undefined): boolean => {
	if (!messageId) return false;
	if (seenMessageSet.has(messageId)) return true;
	seenMessageSet.add(messageId);
	seenMessageIds.push(messageId);
	if (seenMessageIds.length > SEEN_LIMIT) {
		const dropped = seenMessageIds.shift();
		if (dropped) seenMessageSet.delete(dropped);
	}
	return false;
};

// ─── Kick kanal bilgisi (broadcaster id + livestream id) ─────────────────────

interface ChannelInfo {
	broadcasterId?: number;
	streamId: string;
	/** Yayın şu an açık mı — `liveOnly` sıfırlaması buna bakar. */
	isLive: boolean;
	fetchedAt: number;
}

const CHANNEL_TTL_MS = 60 * 1000;
const channelInfoCache = new Map<string, ChannelInfo>();

const fetchChannelInfo = async (channelSlug: string): Promise<ChannelInfo> => {
	const key = channelSlug.toLowerCase();
	const cached = channelInfoCache.get(key);
	if (cached && Date.now() - cached.fetchedAt < CHANNEL_TTL_MS) return cached;

	let info: ChannelInfo = { streamId: "", isLive: false, fetchedAt: Date.now() };
	try {
		const w = window as any;
		const res = await w.electron.kick.getChannelBySlug(channelSlug);
		const ch = res?.data?.[0];
		const stream = ch?.stream || ch?.livestream;
		info = {
			broadcasterId: ch?.broadcaster_user_id,
			streamId: stream?.id ? String(stream.id) : "",
			isLive: Boolean(stream?.is_live ?? ch?.is_live),
			fetchedAt: Date.now(),
		};
		// Yayın kapandıysa oturum burada da temizlenir: chate hiç komut gelmese
		// bile (yayın bitti, sohbet sustu) puanlar bir sonraki yayına sarkmasın.
		if (!info.isLive) clearSessionIfOffline(channelSlug);
	} catch {
		// Kanal bilgisi alınamadıysa oyun yine çalışır; oturum kimliği boş kalır
		// ve zaman toleransı devreye girer.
		if (cached) return cached;
	}
	channelInfoCache.set(key, info);
	return info;
};

// ─── Cevap kuyruğu ───────────────────────────────────────────────────────────

interface PendingReply {
	channelSlug: string;
	text: string;
	/** Toplu özette kısa biçim; yoksa `text` kullanılır. */
	compact?: string;
}

const queues = new Map<string, PendingReply[]>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const formatBatch = (
	prefix: string,
	items: string[],
	maxLength = 480
): string[] => {
	const messages: string[] = [];
	let current = "";
	for (const item of items) {
		const candidate = current ? `${current} · ${item}` : item;
		const withPrefix = prefix ? `${prefix} ${candidate}` : candidate;
		if (withPrefix.length > maxLength && current) {
			messages.push(prefix ? `${prefix} ${current}` : current);
			current = item;
		} else {
			current = candidate;
		}
	}
	if (current) messages.push(prefix ? `${prefix} ${current}` : current);
	return messages;
};

const deliver = async (channelSlug: string, text: string) => {
	const cfg = config();
	if (!text.trim()) return;

	if (cfg.dryRun) {
		console.log(
			`[game][DRYRUN] chate GÖNDERİLMEDİ (test modu) | kanal=${channelSlug}: ${text}`
		);
		return;
	}

	const info = await fetchChannelInfo(channelSlug);
	if (!info.broadcasterId) {
		console.log("[game] broadcaster id çözülemedi", channelSlug);
		return;
	}
	try {
		const w = window as any;
		await w.electron.kick.sendChatMessage({
			broadcaster_user_id: info.broadcasterId,
			content: text,
			type: "user",
		});
	} catch (err) {
		console.log("[game] sendChatMessage başarısız", err);
	}
};

const flushQueue = async (channelSlug: string) => {
	const cfg = config();
	const pending = queues.get(channelSlug) || [];
	queues.set(channelSlug, []);
	flushTimers.delete(channelSlug);
	if (pending.length === 0) return;

	const items = pending.map((p) => p.compact || p.text);
	const messages = formatBatch(cfg.reply.batchPrefix, items);
	for (const message of messages) {
		// eslint-disable-next-line no-await-in-loop
		await deliver(channelSlug, message);
	}
};

const enqueue = (reply: PendingReply) => {
	const cfg = config();
	if (cfg.reply.mode === "silent") return;

	if (cfg.reply.mode === "each") {
		deliver(reply.channelSlug, reply.text);
		return;
	}

	const list = queues.get(reply.channelSlug) || [];
	list.push(reply);
	queues.set(reply.channelSlug, list);

	if (!flushTimers.has(reply.channelSlug)) {
		const delay = Math.max(1, cfg.reply.batchSeconds) * 1000;
		flushTimers.set(
			reply.channelSlug,
			setTimeout(() => {
				flushQueue(reply.channelSlug);
			}, delay)
		);
	}
};

// ─── Şablon doldurma ─────────────────────────────────────────────────────────

const formatNumber = (value: number): string =>
	Math.round(value).toLocaleString("tr-TR");

export const fillGameTemplate = (
	template: string,
	values: Record<string, string>
): string =>
	template.replace(/\{(\w+)\}/g, (match, key) =>
		Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
	);

const commandNames = (cfg: GameConfig): Record<string, string> => ({
	joinCommand: primaryCommandName(cfg.commands, "join"),
	betCommand: primaryCommandName(cfg.commands, "bet"),
	balanceCommand: primaryCommandName(cfg.commands, "balance"),
	topCommand: primaryCommandName(cfg.commands, "top"),
	helpCommand: primaryCommandName(cfg.commands, "help"),
	resetCommand: primaryCommandName(cfg.commands, "reset"),
});

// ─── Oturum yardımcıları ─────────────────────────────────────────────────────

const persist = (session: GameSession) => {
	saveSessions(putSession(loadSessions(), session));
};

/**
 * Yayın kapalıyken oturumu düşürür (kullanıcı kararı: "yayın kapalıysa
 * sıfırlanmalı, yayın açılırsa sıfırdan başlamalı"). Zaten boşsa dokunmaz —
 * her canlılık yoklamasında gereksiz yazma yapmamak için.
 */
const clearSessionIfOffline = (channelSlug: string) => {
	if (!config().liveOnly) return;
	const sessions = loadSessions();
	const existing = getSession(sessions, channelSlug);
	if (!existing) return;
	if (Object.keys(existing.players).length === 0 && existing.totalBets === 0) {
		return;
	}
	saveSessions(putSession(sessions, createSession(channelSlug, "", Date.now())));
	console.log(`[game] yayın kapalı — ${channelSlug} oturumu sıfırlandı`);
};

// ─── Yayın kapanışını chat trafiği olmadan da yakalayan yoklama ──────────────

const LIVE_WATCH_MS = 2 * 60 * 1000;
let liveWatcher: ReturnType<typeof setInterval> | undefined;

const startLiveWatcher = () => {
	if (liveWatcher) return;
	liveWatcher = setInterval(() => {
		const cfg = config();
		if (!cfg.enabled || !cfg.liveOnly) return;
		// Yalnız oturumu OLAN kanallar yoklanır — boşuna API çağrısı yapılmaz.
		const sessions = loadSessions();
		for (const session of Object.values(sessions)) {
			if (Object.keys(session.players).length === 0) continue;
			// fetchChannelInfo canlı değilse oturumu kendisi temizler.
			channelInfoCache.delete(session.channelSlug.toLowerCase());
			fetchChannelInfo(session.channelSlug);
		}
	}, LIVE_WATCH_MS);
};

/**
 * Kanalın güncel oturumunu döndürür. Yayın kimliği bilinmiyorsa (kanal bilgisi
 * henüz gelmemişse) boş kimlikle çalışır — zaman toleransı devreye girer.
 */
const currentSession = (channelSlug: string, streamId: string): GameSession => {
	const cfg = config();
	const sessions = loadSessions();
	const existing = getSession(sessions, channelSlug);
	const { session, reset } = resolveSession(
		existing,
		channelSlug,
		streamId,
		cfg.sessionGraceMinutes,
		Date.now()
	);
	if (reset || session !== existing) {
		saveSessions(putSession(sessions, session));
	}
	return session;
};

// ─── Komut işleyicileri ──────────────────────────────────────────────────────

const handleBet = (
	cfg: GameConfig,
	session: GameSession,
	player: GamePlayer,
	amountSpec: NonNullable<ReturnType<typeof parseGameCommand>>["amount"],
	channelSlug: string
): GameSession => {
	const names = commandNames(cfg);

	if (!amountSpec || amountSpec.kind === "invalid") {
		enqueue({
			channelSlug,
			// Hata cevapları toplu modda da KISALTILMAZ: oyuncunun bahsinin neden
			// işlenmediğini bilmesi gerekir, "ali ❓" hiçbir şey anlatmaz.
			text: fillGameTemplate(
				"{username} geçersiz miktar. Örnek: {betCommand} 500 · {betCommand} %50 · {betCommand} hepsi",
				{ username: player.username, ...names }
			),
		});
		return session;
	}

	const requested = resolveBetAmount(amountSpec, player.balance);
	const rejection = validateBet(player, requested, cfg.economy, Date.now());

	if (rejection) {
		const reasonText: Record<typeof rejection.reason, string> = {
			below_min: `en az ${formatNumber(cfg.economy.minBet)} puan`,
			above_max: `en fazla ${formatNumber(cfg.economy.maxBet)} puan`,
			insufficient_balance: `bakiyen yetmiyor (${formatNumber(player.balance)})`,
			cooldown: `${rejection.detail ?? 0} sn bekle`,
			session_limit: "bu yayın için bahis hakkın doldu",
		};
		// Ret sebebi bilgi taşır — toplu modda da tam metin gönderilir.
		enqueue({
			channelSlug,
			text: `${player.username} ${reasonText[rejection.reason]}`,
		});
		return session;
	}

	const result = settleBet(player, requested, cfg.economy, Math.random, Date.now());
	const values = {
		username: player.username,
		amount: formatNumber(Math.abs(result.delta)),
		balance: formatNumber(result.balanceAfter),
		...commandNames(cfg),
	};

	enqueue({
		channelSlug,
		text: fillGameTemplate(
			result.won ? cfg.reply.winTemplate : cfg.reply.lossTemplate,
			values
		),
		compact: `${player.username} ${result.won ? "+" : "-"}${formatNumber(
			Math.abs(result.delta)
		)} (${formatNumber(result.balanceAfter)})`,
	});

	return {
		...putPlayer(session, result.player),
		totalBets: session.totalBets + 1,
	};
};

// ─── Genel giriş noktası ─────────────────────────────────────────────────────

/**
 * chatConnection.ts her ChatMessageEvent için bunu çağırır.
 * Oyun kapalıysa / komut değilse hiçbir şey yapmaz (sessiz, ucuz).
 */
export const evaluateGameMessage = (
	channelSlug: string,
	username: string,
	content: string,
	messageId?: string,
	/** Yayıncı veya moderatör mü — `reset` gibi yetkili komutlar için. */
	isPrivileged?: boolean
): void => {
	ensureInitialized();
	const cfg = config();
	if (!gameAppliesToChannel(cfg, channelSlug)) return;
	if (!username || !content) return;

	const parsed = parseGameCommand(content, cfg.commands);
	if (!parsed) return;
	if (alreadyProcessed(messageId)) return;

	// Kanal bilgisi asenkron gelir; ilk mesajda kimlik boş olabilir — sorun değil,
	// oturum zaman toleransıyla çözülür ve kimlik öğrenilince oturuma yazılır.
	const cached = channelInfoCache.get(channelSlug.toLowerCase());
	if (!cached || Date.now() - cached.fetchedAt >= CHANNEL_TTL_MS) {
		fetchChannelInfo(channelSlug);
	}
	const streamId = cached?.streamId || "";

	// Yayın kapalıyken oyun çalışmaz ve oturum düşer. Chate cevap da yazılmaz —
	// yayın dışında bot konuşmasın.
	if (cfg.liveOnly && cached && !cached.isLive) {
		clearSessionIfOffline(channelSlug);
		return;
	}

	// Yetkili komutu yetkisiz kişi denerse SESSİZCE yok sayılır; "yetkin yok"
	// cevabı yazmak troll'e ücretsiz bot tetiği vermek olur.
	if (PRIVILEGED_COMMANDS.includes(parsed.kind) && !isPrivileged) return;

	let session = currentSession(channelSlug, streamId);
	const names = commandNames(cfg);
	const startingBalance = formatNumber(cfg.economy.startingBalance);

	// Şans döngüsü: süresi dolduysa herkesin derinlik sayacı sıfırlanır.
	const cycle = rollLuckCycle(session, cfg.economy.luckCycleMinutes, Date.now());
	session = cycle.session;
	if (cycle.rolled && cfg.reply.cycleTemplate.trim()) {
		enqueue({
			channelSlug,
			text: fillGameTemplate(cfg.reply.cycleTemplate, { ...names }),
		});
	}

	// Yayıncı/mod chatten sıfırlama attı.
	if (parsed.kind === "reset") {
		const fresh = createSession(channelSlug, streamId, Date.now());
		saveSessions(putSession(loadSessions(), fresh));
		enqueue({
			channelSlug,
			text: fillGameTemplate(cfg.reply.resetTemplate, {
				username,
				balance: startingBalance,
				...names,
			}),
		});
		return;
	}

	// Katılım kapısı: oyuncu {joinCommand} yazmadan hesap AÇILMAZ.
	const joined = hasJoined(session, username);

	if (parsed.kind === "join") {
		if (joined) {
			const existing = session.players[username.trim().toLowerCase()];
			enqueue({
				channelSlug,
				// Bakiye bilgisi taşıdığı için toplu modda da KISALTILMAZ.
				text: fillGameTemplate(cfg.reply.alreadyJoinedTemplate, {
					username: existing.username,
					balance: formatNumber(existing.balance),
					...names,
				}),
			});
		} else {
			const created = getOrCreatePlayer(
				session,
				username,
				cfg.economy.startingBalance
			);
			session = created.session;
			enqueue({
				channelSlug,
				text: fillGameTemplate(cfg.reply.joinTemplate, {
					username: created.player.username,
					balance: formatNumber(created.player.balance),
					...names,
				}),
				compact: `${created.player.username} 🎮 ${startingBalance}`,
			});
		}
		persist({ ...session, lastActiveAt: Date.now() });
		return;
	}

	// Bahis ve bakiye katılım ister; sıralama/yardım herkese açıktır.
	const needsAccount = parsed.kind === "bet" || parsed.kind === "balance";
	if (needsAccount && cfg.requireJoin && !joined) {
		enqueue({
			channelSlug,
			text: fillGameTemplate(cfg.reply.notJoinedTemplate, {
				username,
				...names,
			}),
		});
		persist({ ...session, lastActiveAt: Date.now() });
		return;
	}

	// Hesap YALNIZ gerçekten gereken komutlarda açılır. Aksi halde `!top` yazan
	// herkese hesap açılır ve katılım kapısı anlamsızlaşır.
	let player: GamePlayer | undefined;
	if (needsAccount) {
		const created = getOrCreatePlayer(
			session,
			username,
			cfg.economy.startingBalance
		);
		session = created.session;
		player = created.player;
	}

	switch (parsed.kind) {
		case "bet":
			if (player) {
				session = handleBet(cfg, session, player, parsed.amount, channelSlug);
			}
			break;

		case "balance":
			if (player) {
				enqueue({
					channelSlug,
					text: fillGameTemplate(cfg.reply.balanceTemplate, {
						username: player.username,
						balance: formatNumber(player.balance),
						...names,
					}),
					compact: `${player.username}: ${formatNumber(player.balance)}`,
				});
			}
			break;

		case "top": {
			const top = leaderboard(session, 5);
			const list = top.length
				? top
						.map((p, i) => `${i + 1}. ${p.username} ${formatNumber(p.balance)}`)
						.join(" · ")
				: "henüz kimse oynamadı";
			enqueue({
				channelSlug,
				text: fillGameTemplate(cfg.reply.topTemplate, { top: list, ...names }),
			});
			break;
		}

		case "help":
			enqueue({
				channelSlug,
				// Yardım herkese açık — hesabı olmayan da sorabilir, o yüzden
				// bakiye yerine başlangıç puanı gösterilir.
				text: fillGameTemplate(cfg.reply.helpTemplate, {
					username,
					balance: startingBalance,
					...names,
				}),
			});
			break;

		default:
			break;
	}

	session = { ...session, lastActiveAt: Date.now() };
	persist(session);
};

/** Panelin "şu an ne oluyor" göstergesi için. */
export const peekSession = (channelSlug: string): GameSession | undefined =>
	getSession(loadSessions(), channelSlug);

// ─── Test yardımcıları ───────────────────────────────────────────────────────

export const __resetGameEngineForTest = () => {
	cachedConfig = undefined;
	initialized = false;
	seenMessageIds.length = 0;
	seenMessageSet.clear();
	channelInfoCache.clear();
	queues.clear();
	for (const timer of flushTimers.values()) clearTimeout(timer);
	flushTimers.clear();
};

export const __flushQueuesForTest = async (channelSlug: string) => {
	const timer = flushTimers.get(channelSlug);
	if (timer) clearTimeout(timer);
	await flushQueue(channelSlug);
};

export const __seedChannelInfoForTest = (
	channelSlug: string,
	info: { broadcasterId?: number; streamId?: string; isLive?: boolean }
) => {
	channelInfoCache.set(channelSlug.toLowerCase(), {
		broadcasterId: info.broadcasterId,
		streamId: info.streamId || "",
		isLive: info.isLive !== false,
		fetchedAt: Date.now(),
	});
};
