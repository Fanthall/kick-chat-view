/**
 * Sprint 61 — Bahis oyunu kalıcılık + oturum yaşam döngüsü testleri.
 */

import {
	DEFAULT_GAME_CONFIG,
	GameSession,
	createSession,
	gameAppliesToChannel,
	getOrCreatePlayer,
	hasJoined,
	leaderboard,
	rollLuckCycle,
	loadGameConfig,
	loadSessions,
	putPlayer,
	putSession,
	resetSession,
	resolveSession,
	saveGameConfig,
	saveSessions,
} from "../renderer/util/gameStorage";
import { createPlayer } from "../renderer/util/gameEconomy";

const NOW = 1_700_000_000_000;
const MINUTE = 60 * 1000;

beforeEach(() => {
	localStorage.clear();
});

describe("config I/O", () => {
	test("kayıt yokken varsayılan döner", () => {
		const config = loadGameConfig();
		expect(config.enabled).toBe(false);
		expect(config.economy.startingBalance).toBe(10000);
	});

	test("ilk kurulumda DRY-RUN açıktır (kazara canlı spam olmasın)", () => {
		expect(DEFAULT_GAME_CONFIG.dryRun).toBe(true);
	});

	test("kaydedilen ayar geri yüklenir", () => {
		saveGameConfig({
			...DEFAULT_GAME_CONFIG,
			enabled: true,
			economy: { ...DEFAULT_GAME_CONFIG.economy, startingBalance: 5000 },
		});
		const loaded = loadGameConfig();
		expect(loaded.enabled).toBe(true);
		expect(loaded.economy.startingBalance).toBe(5000);
	});

	test("eksik alanlar varsayılanla tamamlanır (eski kayıt bozulmaz)", () => {
		localStorage.setItem(
			"chatViewGameConfig",
			JSON.stringify({ enabled: true, economy: { startingBalance: 777 } })
		);
		const loaded = loadGameConfig();
		expect(loaded.economy.startingBalance).toBe(777);
		// Yazılmamış alanlar varsayılandan gelir
		expect(loaded.economy.curve.base).toBe(DEFAULT_GAME_CONFIG.economy.curve.base);
		expect(loaded.reply.mode).toBe("batch");
		expect(loaded.commands.prefix).toBe("!");
	});

	// Regresyon: şablonlar bir ara sabit Türkçe idi ve İngilizce arayüzde
	// "(bakiye: {balance})" diye görünüyordu (i18n kapsama ihlali).
	test("varsayılan chat şablonları arayüz dilini takip eder", () => {
		localStorage.setItem("chatViewLanguage", "en");
		const en = loadGameConfig();
		expect(en.reply.winTemplate).toContain("balance:");
		expect(en.reply.helpTemplate).toContain("just for fun");

		localStorage.setItem("chatViewLanguage", "tr");
		const tr = loadGameConfig();
		expect(tr.reply.winTemplate).toContain("bakiye:");
		expect(tr.reply.helpTemplate).toContain("eğlence amaçlıdır");
	});

	test("şablonlarda dile bakılmaksızın yer tutucular korunur", () => {
		["tr", "en"].forEach((lang) => {
			localStorage.setItem("chatViewLanguage", lang);
			const cfg = loadGameConfig();
			["{username}", "{amount}", "{balance}"].forEach((ph) => {
				expect(cfg.reply.winTemplate).toContain(ph);
			});
			expect(cfg.reply.topTemplate).toContain("{top}");
			expect(cfg.reply.helpTemplate).toContain("{betCommand}");
		});
	});

	test("bozuk JSON varsayılana düşer, patlamaz", () => {
		localStorage.setItem("chatViewGameConfig", "{bozuk");
		expect(loadGameConfig().enabled).toBe(false);
	});

	test("kaydetme değişiklik olayı yayar", () => {
		const listener = jest.fn();
		window.addEventListener("chat-view-game-config-changed", listener);
		saveGameConfig(DEFAULT_GAME_CONFIG);
		expect(listener).toHaveBeenCalled();
		window.removeEventListener("chat-view-game-config-changed", listener);
	});
});

describe("gameAppliesToChannel", () => {
	test("kapalıyken hiçbir kanalda çalışmaz", () => {
		expect(gameAppliesToChannel(DEFAULT_GAME_CONFIG, "fanthal")).toBe(false);
	});

	test("kanal listesi boşsa tüm kanallarda çalışır", () => {
		const config = { ...DEFAULT_GAME_CONFIG, enabled: true };
		expect(gameAppliesToChannel(config, "fanthal")).toBe(true);
	});

	test("kanal listesi doluysa yalnız o kanallarda çalışır", () => {
		const config = {
			...DEFAULT_GAME_CONFIG,
			enabled: true,
			channelSlugs: ["Fanthal"],
		};
		expect(gameAppliesToChannel(config, "fanthal")).toBe(true);
		expect(gameAppliesToChannel(config, "baskakanal")).toBe(false);
	});
});

describe("resolveSession — yayın başına sıfırlama", () => {
	test("kayıtlı oturum yoksa yeni oturum açılır", () => {
		const { session, reset } = resolveSession(undefined, "fanthal", "s1", 30, NOW);
		expect(reset).toBe(true);
		expect(session.streamId).toBe("s1");
	});

	test("yeni yayın kimliği bakiyeleri sıfırlar", () => {
		const old = createSession("fanthal", "s1", NOW);
		const { session, reset } = resolveSession(old, "fanthal", "s2", 30, NOW + MINUTE);
		expect(reset).toBe(true);
		expect(session.streamId).toBe("s2");
		expect(session.players).toEqual({});
	});

	test("aynı yayın kimliği uzun aradan sonra bile oturumu sürdürür", () => {
		let old = createSession("fanthal", "s1", NOW);
		old = putPlayer(old, createPlayer("ali", 10000));
		const { session, reset } = resolveSession(
			old,
			"fanthal",
			"s1",
			30,
			NOW + 5 * 60 * MINUTE
		);
		expect(reset).toBe(false);
		expect(session.players.ali).toBeDefined();
	});

	test("kimlik bilinmiyorken kısa kopma oturumu KORUR", () => {
		let old = createSession("fanthal", "", NOW);
		old = putPlayer(old, createPlayer("ali", 10000));
		const { session, reset } = resolveSession(
			{ ...old, lastActiveAt: NOW },
			"fanthal",
			"",
			30,
			NOW + 10 * MINUTE
		);
		expect(reset).toBe(false);
		expect(session.players.ali).toBeDefined();
	});

	test("kimlik bilinmiyorken tolerans aşılırsa sıfırlanır", () => {
		let old = createSession("fanthal", "", NOW);
		old = putPlayer(old, createPlayer("ali", 10000));
		const { session, reset } = resolveSession(
			{ ...old, lastActiveAt: NOW },
			"fanthal",
			"",
			30,
			NOW + 31 * MINUTE
		);
		expect(reset).toBe(true);
		expect(session.players).toEqual({});
	});

	test("kimlik sonradan öğrenilirse oturuma yazılır, sıfırlanmaz", () => {
		const old = { ...createSession("fanthal", "", NOW), lastActiveAt: NOW };
		const { session, reset } = resolveSession(
			old,
			"fanthal",
			"s9",
			30,
			NOW + MINUTE
		);
		expect(reset).toBe(false);
		expect(session.streamId).toBe("s9");
	});
});

describe("oyuncu yönetimi", () => {
	test("bilinmeyen oyuncu başlangıç bakiyesiyle oluşturulur", () => {
		const session = createSession("fanthal", "s1", NOW);
		const { player, session: next } = getOrCreatePlayer(session, "Ali", 10000);
		expect(player.balance).toBe(10000);
		expect(next.players.ali).toBeDefined();
	});

	test("kullanıcı adı büyük/küçük harften bağımsız aynı oyuncudur", () => {
		let session = createSession("fanthal", "s1", NOW);
		session = getOrCreatePlayer(session, "Ali", 10000).session;
		session = putPlayer(session, {
			...createPlayer("Ali", 10000),
			balance: 4242,
		});
		const { player } = getOrCreatePlayer(session, "ALI", 10000);
		expect(player.balance).toBe(4242);
	});

	test("leaderboard bakiyeye göre sıralar ve hiç oynamayanı elemez", () => {
		let session: GameSession = createSession("fanthal", "s1", NOW);
		session = putPlayer(session, { ...createPlayer("ali", 5000), betCount: 3 });
		session = putPlayer(session, { ...createPlayer("veli", 9000), betCount: 1 });
		session = putPlayer(session, { ...createPlayer("izleyici", 10000) });
		const top = leaderboard(session, 5);
		expect(top.map((p) => p.username)).toEqual(["veli", "ali"]);
	});
});

describe("şans döngüsü (rollLuckCycle)", () => {
	const withPlayers = () => {
		let session = createSession("fanthal", "s1", NOW);
		session = putPlayer(session, {
			...createPlayer("ali", 4000),
			betCount: 14,
			cycleBets: 14,
		});
		session = putPlayer(session, {
			...createPlayer("veli", 12000),
			betCount: 6,
			cycleBets: 6,
		});
		return session;
	};

	test("süre dolmadan sayaçlara dokunulmaz", () => {
		const { session, rolled } = rollLuckCycle(withPlayers(), 30, NOW + 29 * MINUTE);
		expect(rolled).toBe(false);
		expect(session.players.ali.cycleBets).toBe(14);
	});

	test("süre dolunca derinlik sayaçları sıfırlanır", () => {
		const { session, rolled } = rollLuckCycle(withPlayers(), 30, NOW + 30 * MINUTE);
		expect(rolled).toBe(true);
		expect(session.players.ali.cycleBets).toBe(0);
		expect(session.players.veli.cycleBets).toBe(0);
		expect(session.cycleStartedAt).toBe(NOW + 30 * MINUTE);
	});

	test("BAKİYE ve toplam istatistik korunur — sıfırlanan yalnız şanstır", () => {
		const { session } = rollLuckCycle(withPlayers(), 30, NOW + 31 * MINUTE);
		expect(session.players.ali.balance).toBe(4000);
		expect(session.players.ali.betCount).toBe(14);
		expect(session.players.veli.balance).toBe(12000);
	});

	test("kimse oynamadıysa 'yenilendi' duyurusu yapılmaz", () => {
		const idle = createSession("fanthal", "s1", NOW);
		const { rolled } = rollLuckCycle(idle, 30, NOW + 60 * MINUTE);
		expect(rolled).toBe(false);
	});

	test("0 dakika = döngü kapalı, sayaç hiç sıfırlanmaz", () => {
		const { session, rolled } = rollLuckCycle(withPlayers(), 0, NOW + 999 * MINUTE);
		expect(rolled).toBe(false);
		expect(session.players.ali.cycleBets).toBe(14);
	});
});

describe("hasJoined", () => {
	test("oyuncu yoksa false, varsa true (büyük/küçük harf duyarsız)", () => {
		let session = createSession("fanthal", "s1", NOW);
		expect(hasJoined(session, "ali")).toBe(false);
		session = putPlayer(session, createPlayer("Ali", 10000));
		expect(hasJoined(session, "ALI")).toBe(true);
	});
});

describe("oturum kalıcılığı", () => {
	test("kaydedilen oturum geri yüklenir (uygulama kapanıp açılsa da)", () => {
		let session = createSession("fanthal", "s1", NOW);
		session = putPlayer(session, { ...createPlayer("ali", 7777), betCount: 2 });
		saveSessions(putSession({}, session));

		const loaded = loadSessions();
		expect(loaded.fanthal.players.ali.balance).toBe(7777);
	});

	test("elle sıfırlama oyuncuları temizler ama yayın kimliğini korur", () => {
		let session = createSession("fanthal", "s1", NOW);
		session = putPlayer(session, createPlayer("ali", 10000));
		const sessions = resetSession(putSession({}, session), "fanthal", NOW + 1000);
		expect(sessions.fanthal.players).toEqual({});
		expect(sessions.fanthal.streamId).toBe("s1");
	});

	test("bozuk oturum verisi boş haritaya düşer", () => {
		localStorage.setItem("chatViewGameSession", "[]");
		expect(loadSessions()).toEqual({});
	});
});
