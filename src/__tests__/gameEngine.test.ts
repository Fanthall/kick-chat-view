/**
 * Sprint 61 — Bahis oyunu motoru testleri.
 *
 * Strateji: window.electron.kick mock'lanır → evaluateGameMessage çağrılır →
 * kuyruk flush edilip sendChatMessage çağrıları kontrol edilir.
 *
 * Kritik davranışlar: dedup, DRY-RUN, toplu cevap, sessiz mod, kapalı oyun.
 */

import {
	__flushQueuesForTest,
	__resetGameEngineForTest,
	__seedChannelInfoForTest,
	evaluateGameMessage,
	fillGameTemplate,
	formatBatch,
	peekSession,
} from "../renderer/util/gameEngine";
import {
	DEFAULT_GAME_CONFIG,
	GameConfig,
	saveGameConfig,
} from "../renderer/util/gameStorage";

const sendChatMessageMock = jest.fn((_req: any) => Promise.resolve());
const getChannelBySlugMock = jest.fn((_slug: string) =>
	Promise.resolve({
		data: [{ broadcaster_user_id: 42, stream: { id: 900, is_live: true } }],
	})
);

beforeAll(() => {
	(window as any).electron = {
		kick: {
			getChannelBySlug: getChannelBySlugMock,
			sendChatMessage: sendChatMessageMock,
		},
	};
});

const CHANNEL = "fanthal";

/**
 * Oyunu açık + canlı gönderim modunda kurar.
 * `requireJoin` varsayılan olarak KAPATILIR ki bahis/cevap testleri katılım
 * kapısına takılmasın; kapının kendi testleri ayrı describe'da.
 */
const setupConfig = (overrides: Partial<GameConfig> = {}) => {
	const config: GameConfig = {
		...DEFAULT_GAME_CONFIG,
		enabled: true,
		requireJoin: false,
		...overrides,
	};
	saveGameConfig(config);
	return config;
};

let messageCounter = 0;
const nextId = () => `msg-${++messageCounter}`;

beforeEach(() => {
	localStorage.clear();
	sendChatMessageMock.mockClear();
	getChannelBySlugMock.mockClear();
	__resetGameEngineForTest();
	__seedChannelInfoForTest(CHANNEL, { broadcasterId: 42, streamId: "900" });
});

const sentTexts = () =>
	sendChatMessageMock.mock.calls.map((call) => call[0].content as string);

describe("kapsam kontrolü", () => {
	test("oyun kapalıyken hiçbir şey olmaz", async () => {
		saveGameConfig({ ...DEFAULT_GAME_CONFIG, enabled: false });
		evaluateGameMessage(CHANNEL, "ali", "!bahis 500", nextId());
		await __flushQueuesForTest(CHANNEL);
		expect(sendChatMessageMock).not.toHaveBeenCalled();
	});

	test("komut olmayan mesaj yok sayılır", async () => {
		setupConfig();
		evaluateGameMessage(CHANNEL, "ali", "merhaba nasılsınız", nextId());
		await __flushQueuesForTest(CHANNEL);
		expect(sendChatMessageMock).not.toHaveBeenCalled();
		expect(peekSession(CHANNEL)).toBeUndefined();
	});

	test("yapılandırılmamış kanalda çalışmaz", async () => {
		setupConfig({ channelSlugs: ["baskakanal"] });
		evaluateGameMessage(CHANNEL, "ali", "!bahis 500", nextId());
		await __flushQueuesForTest(CHANNEL);
		expect(sendChatMessageMock).not.toHaveBeenCalled();
	});
});

describe("bahis akışı", () => {
	test("geçerli bahis oyuncu oluşturur ve bakiyeyi değiştirir", async () => {
		setupConfig();
		evaluateGameMessage(CHANNEL, "Ali", "!bahis 1000", nextId());
		await __flushQueuesForTest(CHANNEL);

		const session = peekSession(CHANNEL);
		expect(session?.players.ali).toBeDefined();
		expect(session?.players.ali.betCount).toBe(1);
		// Sonuç ödeme kademesinden çekilir; tek bir bakiye beklenemez. Varsayılan
		// tabloda kayıp en fazla bahsin tamamı (9000), kazanç en fazla 5 katı
		// (10000 − 1000 + 5000 = 14000) eder.
		const balance = session?.players.ali.balance ?? -1;
		expect(balance).toBeGreaterThanOrEqual(9000);
		expect(balance).toBeLessThanOrEqual(14000);
		expect(balance).not.toBe(10000); // bahis mutlaka bir sonuç doğurdu
		expect(session?.totalBets).toBe(1);
		expect(sendChatMessageMock).toHaveBeenCalledTimes(1);
	});

	/**
	 * REGRESYON (2026-07-26): Kick `/public/v1/channels` yanıtında `stream`
	 * alanı opsiyoneldir ve üst seviyede `is_live` yoktur. Alan gelmediğinde
	 * `Boolean(undefined)` false olur; kod bunu "yayın kapalı" sanıp `liveOnly`
	 * açıkken oyunu TAMAMEN susturuyordu (automation çalışırken oyun botu
	 * yazmıyordu). "Bilinmiyor" artık susma sebebi değildir.
	 */
	test("canlılık BİLİNMİYORSA liveOnly oyunu susturmaz", async () => {
		setupConfig({ liveOnly: true });
		// `stream` alanı hiç gelmemiş durum: isLive false ama liveKnown false.
		__seedChannelInfoForTest(CHANNEL, {
			broadcasterId: 42,
			isLive: false,
			liveKnown: false,
		});

		evaluateGameMessage(CHANNEL, "ali", "!puan", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(sendChatMessageMock).toHaveBeenCalled();
	});

	test("yayın KESİN kapalıysa (is_live=false) oyun susar", async () => {
		setupConfig({ liveOnly: true });
		__seedChannelInfoForTest(CHANNEL, {
			broadcasterId: 42,
			isLive: false,
			liveKnown: true,
		});

		evaluateGameMessage(CHANNEL, "ali", "!puan", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(sendChatMessageMock).not.toHaveBeenCalled();
	});

	// Cevap, komutu yazan kişinin mesajına REPLY olarak gitmeli — akan chatte
	// oyuncu kendi sonucunu bulabilsin diye.
	test("each modunda cevap tetikleyen mesaja reply olarak gider", async () => {
		setupConfig({ reply: { ...DEFAULT_GAME_CONFIG.reply, mode: "each" } });
		const triggerId = nextId();
		evaluateGameMessage(CHANNEL, "ali", "!puan", triggerId);
		await __flushQueuesForTest(CHANNEL);

		expect(sendChatMessageMock).toHaveBeenCalledTimes(1);
		expect(sendChatMessageMock.mock.calls[0][0].reply_to_message_id).toBe(
			triggerId
		);
	});

	// Toplu özette birden fazla oyuncu olabilir; kime reply atılacağı belirsiz.
	test("batch modunda özet mesajı reply olarak gitmez", async () => {
		setupConfig({ reply: { ...DEFAULT_GAME_CONFIG.reply, mode: "batch" } });
		evaluateGameMessage(CHANNEL, "ali", "!puan", nextId());
		evaluateGameMessage(CHANNEL, "veli", "!puan", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(sendChatMessageMock).toHaveBeenCalled();
		for (const call of sendChatMessageMock.mock.calls) {
			expect(call[0].reply_to_message_id).toBeUndefined();
		}
	});

	/**
	 * REGRESYON (2026-07-26): Kick özel karakter yoğun mesajı reddediyor ve bot
	 * hiç yazamıyordu. Reddedilen metin aşama aşama sadeleştirilip yeniden
	 * denenmeli; ilk kabul eden seviye kanal için hatırlanmalı.
	 */
	test("Kick özel karakter derse metin sadeleştirilip yeniden gönderilir", async () => {
		setupConfig({
			reply: {
				...DEFAULT_GAME_CONFIG.reply,
				mode: "each",
				balanceTemplate: "@{username} 🎲 bakiyen (({balance}))",
			},
		});
		const specialErr = new Error(
			'Kick API request failed: 400 {"data":"MAX_SPECIAL_CHARS_ERROR"}'
		);
		// İlk deneme reddedilir, sadeleştirilmiş ikinci deneme kabul edilir.
		sendChatMessageMock.mockRejectedValueOnce(specialErr as any);

		evaluateGameMessage(CHANNEL, "ali", "!puan", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(sendChatMessageMock).toHaveBeenCalledTimes(2);
		const secondTry = sendChatMessageMock.mock.calls[1][0].content as string;
		expect(secondTry).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
		expect(secondTry).toContain("ali");
	});

	test("özel karakter dışındaki hatada boşuna yeniden denenmez", async () => {
		setupConfig({ reply: { ...DEFAULT_GAME_CONFIG.reply, mode: "each" } });
		sendChatMessageMock.mockRejectedValueOnce(
			new Error("401 Unauthorized") as any
		);

		evaluateGameMessage(CHANNEL, "ali", "!puan", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(sendChatMessageMock).toHaveBeenCalledTimes(1);
	});

	test("bakiyeden fazla bahis reddedilir, bakiye korunur", async () => {
		setupConfig();
		evaluateGameMessage(CHANNEL, "ali", "!bahis 999999", nextId());
		await __flushQueuesForTest(CHANNEL);

		const session = peekSession(CHANNEL);
		expect(session?.players.ali.balance).toBe(10000);
		expect(session?.players.ali.betCount).toBe(0);
		expect(sentTexts().join(" ")).toContain("bakiyen yetmiyor");
	});

	test("cooldown dolmadan ikinci bahis reddedilir", async () => {
		setupConfig();
		evaluateGameMessage(CHANNEL, "ali", "!bahis 500", nextId());
		evaluateGameMessage(CHANNEL, "ali", "!bahis 500", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(peekSession(CHANNEL)?.players.ali.betCount).toBe(1);
		expect(sentTexts().join(" ")).toMatch(/sn bekle/);
	});

	test("geçersiz miktar kullanım örneğiyle cevaplanır", async () => {
		setupConfig();
		evaluateGameMessage(CHANNEL, "ali", "!bahis abc", nextId());
		await __flushQueuesForTest(CHANNEL);
		expect(sentTexts().join(" ")).toContain("geçersiz miktar");
		expect(peekSession(CHANNEL)?.players.ali.betCount).toBe(0);
	});

	// Varsayılan minBet 1'dir; sınır davranışı için açıkça yükseltiyoruz.
	test("min bahis altı reddedilir", async () => {
		setupConfig({
			economy: { ...DEFAULT_GAME_CONFIG.economy, minBet: 100 },
		});
		evaluateGameMessage(CHANNEL, "ali", "!bahis 10", nextId());
		await __flushQueuesForTest(CHANNEL);
		expect(sentTexts().join(" ")).toContain("en az");
	});

	test("varsayılan minBet 1 — 1 puanlık bahis kabul edilir", async () => {
		setupConfig();
		evaluateGameMessage(CHANNEL, "ali", "!bahis 1", nextId());
		await __flushQueuesForTest(CHANNEL);
		expect(sentTexts().join(" ")).not.toContain("en az");
		expect(peekSession(CHANNEL)?.players.ali.betCount).toBe(1);
	});
});

describe("dedup", () => {
	test("aynı mesaj id iki kez işlenmez (reconnect koruması)", async () => {
		setupConfig();
		const id = nextId();
		evaluateGameMessage(CHANNEL, "ali", "!bahis 1000", id);
		evaluateGameMessage(CHANNEL, "ali", "!bahis 1000", id);
		await __flushQueuesForTest(CHANNEL);

		expect(peekSession(CHANNEL)?.players.ali.betCount).toBe(1);
	});

	test("farklı kullanıcılar birbirini engellemez", async () => {
		setupConfig();
		evaluateGameMessage(CHANNEL, "ali", "!bahis 1000", nextId());
		evaluateGameMessage(CHANNEL, "veli", "!bahis 1000", nextId());
		await __flushQueuesForTest(CHANNEL);

		const session = peekSession(CHANNEL);
		expect(session?.players.ali.betCount).toBe(1);
		expect(session?.players.veli.betCount).toBe(1);
	});
});

describe("cevap modları", () => {
	// Varsayılan artık "each" (tag + reply için); batch açıkça seçilir.
	test("batch: birden çok sonuç TEK mesajda toplanır (rate-limit koruması)", async () => {
		setupConfig({ reply: { ...DEFAULT_GAME_CONFIG.reply, mode: "batch" } });
		["ali", "veli", "ayse", "mehmet"].forEach((user) => {
			evaluateGameMessage(CHANNEL, user, "!bahis 500", nextId());
		});
		await __flushQueuesForTest(CHANNEL);

		expect(sendChatMessageMock).toHaveBeenCalledTimes(1);
		const text = sentTexts()[0];
		["ali", "veli", "ayse", "mehmet"].forEach((user) => {
			expect(text).toContain(user);
		});
	});

	test("each: her bahse ayrı mesaj gider", async () => {
		setupConfig({ reply: { ...DEFAULT_GAME_CONFIG.reply, mode: "each" } });
		evaluateGameMessage(CHANNEL, "ali", "!bahis 500", nextId());
		evaluateGameMessage(CHANNEL, "veli", "!bahis 500", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(sendChatMessageMock).toHaveBeenCalledTimes(2);
	});

	test("silent: chate hiç mesaj gitmez ama bakiye işlenir", async () => {
		setupConfig({ reply: { ...DEFAULT_GAME_CONFIG.reply, mode: "silent" } });
		evaluateGameMessage(CHANNEL, "ali", "!bahis 1000", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(sendChatMessageMock).not.toHaveBeenCalled();
		expect(peekSession(CHANNEL)?.players.ali.betCount).toBe(1);
	});

	// Susturmanın tek yolu artık cevap modu; ara bir "test modu" yok.
	test("sessiz modda bakiye işlenir ama chate mesaj GİTMEZ", async () => {
		setupConfig({
			reply: { ...DEFAULT_GAME_CONFIG.reply, mode: "silent" },
		});
		evaluateGameMessage(CHANNEL, "ali", "!bahis 1000", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(sendChatMessageMock).not.toHaveBeenCalled();
		expect(peekSession(CHANNEL)?.players.ali.betCount).toBe(1);
	});
});

describe("bilgi komutları", () => {
	test("!puan bakiyeyi bildirir, bahis saymaz", async () => {
		setupConfig();
		evaluateGameMessage(CHANNEL, "ali", "!puan", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(sentTexts().join(" ")).toContain("10.000");
		expect(peekSession(CHANNEL)?.players.ali.betCount).toBe(0);
	});

	test("!top kimse oynamadıysa bunu söyler", async () => {
		setupConfig();
		evaluateGameMessage(CHANNEL, "ali", "!top", nextId());
		await __flushQueuesForTest(CHANNEL);
		expect(sentTexts().join(" ")).toContain("henüz kimse oynamadı");
	});

	test("!oyun yardım metni komut adlarını doldurur", async () => {
		setupConfig();
		evaluateGameMessage(CHANNEL, "ali", "!oyun", nextId());
		await __flushQueuesForTest(CHANNEL);
		const text = sentTexts().join(" ");
		expect(text).toContain("!bahis");
		expect(text).toContain("sıralama");
	});
});

describe("katılım kapısı (requireJoin)", () => {
	test("katılmadan bahis oynanamaz ve hesap AÇILMAZ", async () => {
		setupConfig({ requireJoin: true });
		evaluateGameMessage(CHANNEL, "ali", "!bahis 500", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(peekSession(CHANNEL)?.players.ali).toBeUndefined();
		expect(sentTexts().join(" ")).toContain("!joingame");
	});

	test("katılmadan bakiye sorulamaz", async () => {
		setupConfig({ requireJoin: true });
		evaluateGameMessage(CHANNEL, "ali", "!puan", nextId());
		await __flushQueuesForTest(CHANNEL);
		expect(peekSession(CHANNEL)?.players.ali).toBeUndefined();
	});

	test("!joingame hesabı başlangıç puanıyla açar", async () => {
		setupConfig({ requireJoin: true });
		evaluateGameMessage(CHANNEL, "Ali", "!joingame", nextId());
		await __flushQueuesForTest(CHANNEL);

		const player = peekSession(CHANNEL)?.players.ali;
		expect(player?.balance).toBe(10000);
		expect(player?.betCount).toBe(0);
		expect(sentTexts().join(" ")).toContain("10.000");
	});

	test("katıldıktan sonra bahis oynanabilir", async () => {
		setupConfig({ requireJoin: true });
		evaluateGameMessage(CHANNEL, "ali", "!joingame", nextId());
		evaluateGameMessage(CHANNEL, "ali", "!bahis 1000", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(peekSession(CHANNEL)?.players.ali.betCount).toBe(1);
	});

	test("ikinci kez katılmak bakiyeyi SIFIRLAMAZ", async () => {
		setupConfig({ requireJoin: true });
		evaluateGameMessage(CHANNEL, "ali", "!joingame", nextId());
		evaluateGameMessage(CHANNEL, "ali", "!bahis 1000", nextId());
		const balanceAfterBet = peekSession(CHANNEL)!.players.ali.balance;

		evaluateGameMessage(CHANNEL, "ali", "!joingame", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(peekSession(CHANNEL)?.players.ali.balance).toBe(balanceAfterBet);
		expect(sentTexts().join(" ")).toContain("zaten oyundasın");
	});

	test("sıralama ve yardım katılım istemez", async () => {
		setupConfig({ requireJoin: true });
		evaluateGameMessage(CHANNEL, "ali", "!top", nextId());
		evaluateGameMessage(CHANNEL, "ali", "!oyun", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(peekSession(CHANNEL)?.players.ali).toBeUndefined();
		expect(sendChatMessageMock).toHaveBeenCalled();
	});

	test("requireJoin kapalıyken eski davranış sürer (otomatik hesap)", async () => {
		setupConfig({ requireJoin: false });
		evaluateGameMessage(CHANNEL, "ali", "!bahis 1000", nextId());
		await __flushQueuesForTest(CHANNEL);
		expect(peekSession(CHANNEL)?.players.ali.betCount).toBe(1);
	});
});

describe("!reset — yalnız yayıncı/moderatör", () => {
	/** Bir oyuncu yaratır ve kuyruğu boşaltır — bekleyen mesaj sonraki
	 *  assertion'a sızmasın (mockClear tek başına yetmiyor). */
	const seedPlayer = async () => {
		evaluateGameMessage(CHANNEL, "ali", "!bahis 1000", nextId());
		await __flushQueuesForTest(CHANNEL);
		expect(peekSession(CHANNEL)?.players.ali).toBeDefined();
	};

	test("yetkili reset oyuncuları temizler ve duyurur", async () => {
		setupConfig();
		await seedPlayer();
		evaluateGameMessage(CHANNEL, "fanthal", "!reset", nextId(), true);
		await __flushQueuesForTest(CHANNEL);

		expect(peekSession(CHANNEL)?.players).toEqual({});
		expect(peekSession(CHANNEL)?.totalBets).toBe(0);
		expect(sentTexts().join(" ")).toContain("sıfırlandı");
	});

	test("yetkisiz reset SESSİZCE yok sayılır (bot tetiklenmez)", async () => {
		setupConfig();
		await seedPlayer();
		sendChatMessageMock.mockClear();
		evaluateGameMessage(CHANNEL, "troll", "!reset", nextId(), false);
		await __flushQueuesForTest(CHANNEL);

		expect(peekSession(CHANNEL)?.players.ali).toBeDefined();
		expect(sendChatMessageMock).not.toHaveBeenCalled();
	});

	test("yetki bayrağı hiç verilmezse reset çalışmaz", async () => {
		setupConfig();
		await seedPlayer();
		evaluateGameMessage(CHANNEL, "ali", "!reset", nextId());
		await __flushQueuesForTest(CHANNEL);
		expect(peekSession(CHANNEL)?.players.ali).toBeDefined();
	});
});

describe("yayın kapalıyken (liveOnly)", () => {
	test("komut işlenmez ve oturum sıfırlanır", async () => {
		setupConfig({ liveOnly: true });
		evaluateGameMessage(CHANNEL, "ali", "!bahis 1000", nextId());
		await __flushQueuesForTest(CHANNEL);
		expect(peekSession(CHANNEL)?.players.ali).toBeDefined();

		// Yayın kapandı
		__seedChannelInfoForTest(CHANNEL, { broadcasterId: 42, isLive: false });
		sendChatMessageMock.mockClear();
		evaluateGameMessage(CHANNEL, "veli", "!bahis 1000", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(peekSession(CHANNEL)?.players).toEqual({});
		// Yayın dışında bot chate konuşmaz.
		expect(sendChatMessageMock).not.toHaveBeenCalled();
	});

	test("liveOnly kapalıyken yayın kapalı olsa da oynanır", async () => {
		setupConfig({ liveOnly: false });
		__seedChannelInfoForTest(CHANNEL, { broadcasterId: 42, isLive: false });
		evaluateGameMessage(CHANNEL, "ali", "!bahis 1000", nextId());
		await __flushQueuesForTest(CHANNEL);
		expect(peekSession(CHANNEL)?.players.ali.betCount).toBe(1);
	});
});

describe("formatBatch", () => {
	test("kısa liste tek mesajda kalır", () => {
		expect(formatBatch("Zar:", ["a +1", "b -2"])).toEqual(["Zar: a +1 | b -2"]);
	});

	test("uzun liste birden çok mesaja bölünür", () => {
		const items = Array.from({ length: 40 }, (_, i) => `oyuncu${i} +1000 (11.000)`);
		const messages = formatBatch("Zar:", items);
		expect(messages.length).toBeGreaterThan(1);
		messages.forEach((m) => expect(m.length).toBeLessThanOrEqual(500));
	});

	test("boş liste boş dizi döner", () => {
		expect(formatBatch("🎲", [])).toEqual([]);
	});
});

describe("fillGameTemplate", () => {
	test("bilinen placeholder değişir, bilinmeyen olduğu gibi kalır", () => {
		expect(
			fillGameTemplate("{username} → {balance} · {yok}", {
				username: "ali",
				balance: "9.500",
			})
		).toBe("ali → 9.500 · {yok}");
	});
});
