/**
 * Sprint 61 — Bahis oyunu kalıcılık katmanı.
 *
 * İki ayrı anahtar:
 *   chatViewGameConfig  → kullanıcının ayarları (kalıcı, yayınlar arası korunur)
 *   chatViewGameSession → o yayına ait oyuncu bakiyeleri (yayın değişince sıfırlanır)
 *
 * Desen `automationRulesStorage.ts` ile birebir aynıdır: localStorage + CustomEvent.
 *
 * Oturum kuralı (kullanıcı kararı 2026-07-23):
 *   - Yeni yayın kimliği (livestreamId) → bakiyeler SIFIRLANIR.
 *   - Yayın kısa süreli koparsa (≤ graceMinutes) aynı oturum DEVAM eder;
 *     internet/OBS kesintisi yüzünden herkesin puanı uçmasın.
 *   - Uygulama kapanıp açılsa bile oturum localStorage'dan geri yüklenir.
 */

import {
	DEFAULT_ECONOMY,
	GameEconomyConfig,
	GamePlayer,
	createPlayer,
} from "./gameEconomy";
import { DEFAULT_COMMANDS, GameCommandConfig } from "./gameCommands";
import { dict, getLanguage } from "./i18n";

const CONFIG_KEY = "chatViewGameConfig";
const SESSION_KEY = "chatViewGameSession";

export const GAME_CONFIG_CHANGED = "chat-view-game-config-changed";
export const GAME_SESSION_CHANGED = "chat-view-game-session-changed";

// ─── Ayar modeli ─────────────────────────────────────────────────────────────

export type ReplyMode = "batch" | "each" | "silent";

export interface GameReplyConfig {
	mode: ReplyMode;
	/** batch modunda biriktirme penceresi (saniye). */
	batchSeconds: number;
	/** Toplu özet mesajının başına eklenen metin. */
	batchPrefix: string;
	/** Tek tek cevapta kazanç şablonu. Placeholder: {username} {amount} {balance} */
	winTemplate: string;
	lossTemplate: string;
	balanceTemplate: string;
	/** {top} placeholder'ı sıralama listesiyle değişir. */
	topTemplate: string;
	helpTemplate: string;
	/** Oyuncu {joinCommand} yazıp oyuna girdiğinde. */
	joinTemplate: string;
	/** Zaten katılmış oyuncu tekrar katılmaya çalışırsa. */
	alreadyJoinedTemplate: string;
	/** Katılmamış oyuncu bahis/bakiye denerse. */
	notJoinedTemplate: string;
	/** Oturum sıfırlandığında chate duyurulur. */
	resetTemplate: string;
	/** Şans döngüsü yenilendiğinde chate duyurulur (boş = duyurma). */
	cycleTemplate: string;
}

export interface GameConfig {
	/**
	 * Ayar şeması sürümü. Eski kayıtlara tek seferlik geçiş uygulamak için
	 * kullanılır (bkz. mergeConfig). 2 = "test modu" kaldırıldı, cevap modu
	 * `each`, minBet 1.
	 */
	schemaVersion: number;
	enabled: boolean;
	/** Boş = tüm kanallar; doluysa yalnız bu slug'lar (rutinlerdeki mantık). */
	channelSlugs: string[];
	/**
	 * true (varsayılan): oyuncu {joinCommand} yazmadan puan almaz, bahis oynayamaz.
	 * Sohbeti izleyen herkese otomatik hesap açılmasını önler.
	 */
	requireJoin: boolean;
	/**
	 * true (varsayılan): oyun YALNIZ yayın açıkken çalışır; yayın kapanınca
	 * oturum sıfırlanır ve yeni yayın sıfırdan başlar (kullanıcı kararı 2026-07-24).
	 */
	liveOnly: boolean;
	/** Yayın koptuğunda oturumun korunacağı süre (dakika). */
	sessionGraceMinutes: number;
	economy: GameEconomyConfig;
	commands: GameCommandConfig;
	reply: GameReplyConfig;
}

/** Sözlükten aktif dildeki metni al (t() hook'u burada kullanılamaz). */
const text = (key: string): string => {
	const entry = dict[key];
	if (!entry) return "";
	return entry[getLanguage()] || entry.tr || "";
};

/**
 * Varsayılan cevap şablonları AKTİF DİLE göre kurulur. Sabit Türkçe bırakılırsa
 * İngilizce arayüzde "(bakiye: ...)" gibi karışık metinler çıkıyor.
 */
export const defaultReply = (): GameReplyConfig => ({
	// Varsayılan "each": her komut sahibine AYRI cevap gider; ancak böyle kişiyi
	// etiketleyip mesajına reply atabiliriz. Toplu özet (batch) tek mesajda
	// birleştirdiği için ne tag ne reply mümkün olur.
	mode: "each",
	batchSeconds: 8,
	batchPrefix: "🎲",
	winTemplate: text("game.default.win"),
	lossTemplate: text("game.default.loss"),
	balanceTemplate: text("game.default.balance"),
	topTemplate: text("game.default.top"),
	helpTemplate: text("game.default.help"),
	joinTemplate: text("game.default.join"),
	alreadyJoinedTemplate: text("game.default.already-joined"),
	notJoinedTemplate: text("game.default.not-joined"),
	resetTemplate: text("game.default.reset"),
	cycleTemplate: text("game.default.cycle"),
});

export const defaultGameConfig = (): GameConfig => ({
	schemaVersion: 2,
	// Oyun kutudan çıktığı gibi çalışır ve chate YAZAR. Ara "test modu" yoktur:
	// susturmak isteyen ya oyunu kapatır ya cevap modunu «sessiz» yapar.
	enabled: true,
	channelSlugs: [],
	requireJoin: true,
	liveOnly: true,
	sessionGraceMinutes: 30,
	economy: DEFAULT_ECONOMY,
	commands: DEFAULT_COMMANDS,
	reply: defaultReply(),
});

export const DEFAULT_REPLY: GameReplyConfig = defaultReply();
export const DEFAULT_GAME_CONFIG: GameConfig = defaultGameConfig();

// ─── Ayar I/O ────────────────────────────────────────────────────────────────

/**
 * Kaydedilmiş ayarı varsayılanla derin birleştirir. Yeni alan eklendiğinde eski
 * kayıtlar bozulmaz (migration gerekmez).
 */
const mergeConfig = (raw: unknown): GameConfig => {
	const base = defaultGameConfig();
	if (!raw || typeof raw !== "object") return base;
	// `dryRun` artık şemada yok; eski kayıtlardan gelen değer spread ile geri
	// sızmasın diye burada ayıklanır.
	const { dryRun: _removedDryRun, ...input } = raw as Partial<GameConfig> & {
		dryRun?: boolean;
	};

	/**
	 * v2 geçişi (tek seferlik). "Test modu" kaldırıldı; eski kayıtlarda
	 * `dryRun: true` durduğu için güncelleme sonrası bot yine susardı. Ayrıca
	 * kişiyi etiketleyip reply atabilmek `each` modunu, kullanıcı kararı da
	 * `minBet: 1`i gerektiriyor. Bunlar bir kez uygulanır; sonrasında kullanıcı
	 * ne seçerse o kalır (schemaVersion tekrar çalışmasını engeller).
	 */
	const needsV2Migration = (input.schemaVersion ?? 1) < 2;
	const migratedReply = needsV2Migration
		? { ...(input.reply || {}), mode: "each" as ReplyMode }
		: input.reply || {};
	const migratedEconomy = needsV2Migration
		? { ...(input.economy || {}), minBet: 1 }
		: input.economy || {};

	return {
		...base,
		...input,
		schemaVersion: 2,
		channelSlugs: Array.isArray(input.channelSlugs)
			? input.channelSlugs.filter((s) => typeof s === "string" && s.trim())
			: [],
		economy: {
			...DEFAULT_ECONOMY,
			...migratedEconomy,
			// Ödeme kademeleri artık ayarlanabilir değil — her zaman güncel
			// varsayılan tablo kullanılır (eski kayıttaki payoutMultiplier yok sayılır).
			payout: DEFAULT_ECONOMY.payout,
			curve: {
				...DEFAULT_ECONOMY.curve,
				...((input.economy || {}).curve || {}),
			},
		},
		commands: {
			...DEFAULT_COMMANDS,
			...(input.commands || {}),
			commands: {
				...DEFAULT_COMMANDS.commands,
				...((input.commands || {}).commands || {}),
			},
		},
		reply: { ...base.reply, ...migratedReply },
	};
};

export const loadGameConfig = (): GameConfig => {
	try {
		const raw = localStorage.getItem(CONFIG_KEY);
		// Varsayılan her seferinde TAZE kurulur; dil değişmişse şablonlar da değişsin.
		if (!raw) return defaultGameConfig();
		return mergeConfig(JSON.parse(raw));
	} catch {
		return defaultGameConfig();
	}
};

export const saveGameConfig = (config: GameConfig): void => {
	try {
		localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
		try {
			window.dispatchEvent(new CustomEvent(GAME_CONFIG_CHANGED));
		} catch {
			/* ignore */
		}
	} catch (err) {
		console.log("[game] config kaydedilemedi", err);
	}
};

/** Oyun bu kanalda aktif mi? (rutinlerdeki `ruleAppliesToChannel` mantığı) */
export const gameAppliesToChannel = (
	config: GameConfig,
	channelSlug: string
): boolean => {
	if (!config.enabled) return false;
	if (!config.channelSlugs || config.channelSlugs.length === 0) return true;
	return config.channelSlugs
		.map((s) => s.toLowerCase())
		.includes(channelSlug.toLowerCase());
};

// ─── Oturum modeli ───────────────────────────────────────────────────────────

export interface GameSession {
	channelSlug: string;
	/** Kick livestream id'si; bilinmiyorsa boş — o zaman zaman toleransı devreye girer. */
	streamId: string;
	startedAt: number;
	/** Oyunla ilgili son etkileşim/canlılık zamanı (epoch ms). */
	lastActiveAt: number;
	/** İçinde bulunulan şans döngüsünün başlangıcı (epoch ms). */
	cycleStartedAt: number;
	players: Record<string, GamePlayer>;
	totalBets: number;
}

/** Tüm kanalların oturumları. */
export type GameSessionMap = Record<string, GameSession>;

const sessionKey = (channelSlug: string) => channelSlug.trim().toLowerCase();

export const createSession = (
	channelSlug: string,
	streamId: string,
	now: number
): GameSession => ({
	channelSlug: sessionKey(channelSlug),
	streamId: streamId || "",
	startedAt: now,
	lastActiveAt: now,
	cycleStartedAt: now,
	players: {},
	totalBets: 0,
});

export const loadSessions = (): GameSessionMap => {
	try {
		const raw = localStorage.getItem(SESSION_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		return parsed as GameSessionMap;
	} catch {
		return {};
	}
};

export const saveSessions = (sessions: GameSessionMap): void => {
	try {
		localStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
		try {
			window.dispatchEvent(new CustomEvent(GAME_SESSION_CHANGED));
		} catch {
			/* ignore */
		}
	} catch (err) {
		console.log("[game] oturum kaydedilemedi", err);
	}
};

/**
 * Yayın kimliği / zaman toleransına göre oturumun devam mı edeceğini yoksa
 * sıfırlanacağını mı belirler. SAF fonksiyon — test edilebilir.
 *
 *   - Kayıtlı oturum yoksa       → yeni
 *   - streamId ikisinde de var ve FARKLI → yeni (yeni yayın)
 *   - streamId aynı              → devam (süre ne olursa olsun)
 *   - streamId bilinmiyorsa      → son etkinlikten bu yana graceMinutes geçtiyse yeni
 */
export const resolveSession = (
	existing: GameSession | undefined,
	channelSlug: string,
	streamId: string,
	graceMinutes: number,
	now: number
): { session: GameSession; reset: boolean } => {
	if (!existing) {
		return { session: createSession(channelSlug, streamId, now), reset: true };
	}

	if (existing.streamId && streamId && existing.streamId !== streamId) {
		return { session: createSession(channelSlug, streamId, now), reset: true };
	}

	if (!existing.streamId || !streamId) {
		const graceMs = Math.max(0, graceMinutes) * 60 * 1000;
		if (now - existing.lastActiveAt > graceMs) {
			return { session: createSession(channelSlug, streamId, now), reset: true };
		}
	}

	return {
		session: {
			...existing,
			// Kimlik sonradan öğrenildiyse oturuma yaz.
			streamId: existing.streamId || streamId || "",
			lastActiveAt: now,
		},
		reset: false,
	};
};

/** Oyuncu bu oturuma katılmış mı? (`requireJoin` açıkken kapı bu.) */
export const hasJoined = (session: GameSession, username: string): boolean =>
	Boolean(session.players[username.trim().toLowerCase()]);

/**
 * Şans döngüsü dolduysa TÜM oyuncuların derinlik sayacını sıfırlar.
 * Bakiye/istatistik korunur — sıfırlanan yalnız kazanma eğrisinin derinliğidir,
 * böylece kimse yayının sonuna kadar dipte kalmaz. SAF fonksiyon.
 */
export const rollLuckCycle = (
	session: GameSession,
	luckCycleMinutes: number,
	now: number
): { session: GameSession; rolled: boolean } => {
	if (luckCycleMinutes <= 0) return { session, rolled: false };
	const cycleMs = luckCycleMinutes * 60 * 1000;
	if (now - session.cycleStartedAt < cycleMs) return { session, rolled: false };

	const players: Record<string, GamePlayer> = {};
	let hadProgress = false;
	for (const [key, player] of Object.entries(session.players)) {
		if (player.cycleBets > 0) hadProgress = true;
		players[key] = { ...player, cycleBets: 0 };
	}
	return {
		session: { ...session, cycleStartedAt: now, players },
		// Kimse oynamadıysa "döngü yenilendi" duyurusu yapmanın anlamı yok.
		rolled: hadProgress,
	};
};

/** Oyuncuyu getirir; yoksa başlangıç bakiyesiyle oluşturur (mutasyon yok). */
export const getOrCreatePlayer = (
	session: GameSession,
	username: string,
	startingBalance: number
): { session: GameSession; player: GamePlayer } => {
	const key = username.trim().toLowerCase();
	const found = session.players[key];
	if (found) return { session, player: found };

	const player = createPlayer(username.trim(), startingBalance);
	return {
		session: { ...session, players: { ...session.players, [key]: player } },
		player,
	};
};

/** Oyuncuyu oturuma yazar (mutasyon yok). */
export const putPlayer = (
	session: GameSession,
	player: GamePlayer
): GameSession => ({
	...session,
	players: {
		...session.players,
		[player.username.trim().toLowerCase()]: player,
	},
});

/** Bakiyeye göre azalan sıralama — `!top` komutu ve panel önizlemesi için. */
export const leaderboard = (
	session: GameSession,
	limit: number
): GamePlayer[] =>
	Object.values(session.players)
		.filter((p) => p.betCount > 0)
		.sort((a, b) => b.balance - a.balance || a.username.localeCompare(b.username))
		.slice(0, Math.max(1, limit));

export const getSession = (
	sessions: GameSessionMap,
	channelSlug: string
): GameSession | undefined => sessions[sessionKey(channelSlug)];

export const putSession = (
	sessions: GameSessionMap,
	session: GameSession
): GameSessionMap => ({ ...sessions, [sessionKey(session.channelSlug)]: session });

/** Kanalın oturumunu elle sıfırlar (panel butonu). */
export const resetSession = (
	sessions: GameSessionMap,
	channelSlug: string,
	now: number
): GameSessionMap => {
	const existing = getSession(sessions, channelSlug);
	return putSession(
		sessions,
		createSession(channelSlug, existing?.streamId || "", now)
	);
};
