/**
 * Sohbet ödülü (pasif kazanç) testleri.
 *
 * Sözleşme (kullanıcı kararı 2026-07-26):
 *   - Chate yazan oyuncu SESSİZCE puan kazanır; bot hiçbir şey yazmaz.
 *   - Spam koruması YOK: her mesaj kazandırır, bekleme/uzunluk şartı yoktur.
 *   - Tek sınır oturum tavanıdır ("çok yüksek de kazanmasın").
 *   - Yalnız oyuna KATILMIŞ oyuncular kazanır.
 */

import {
	DEFAULT_ECONOMY,
	applyChatReward,
	createPlayer,
} from "../renderer/util/gameEconomy";
import {
	__flushQueuesForTest,
	__resetGameEngineForTest,
	__seedChannelInfoForTest,
	evaluateGameMessage,
	peekSession,
} from "../renderer/util/gameEngine";
import {
	DEFAULT_GAME_CONFIG,
	GameConfig,
	saveGameConfig,
} from "../renderer/util/gameStorage";

const sendChatMessageMock = jest.fn((_req: any) => Promise.resolve());

beforeAll(() => {
	(window as any).electron = {
		kick: {
			getChannelBySlug: jest.fn(() =>
				Promise.resolve({
					data: [{ broadcaster_user_id: 42, stream: { id: 900, is_live: true } }],
				})
			),
			sendChatMessage: sendChatMessageMock,
		},
	};
});

const CHANNEL = "fanthal";
let counter = 0;
const nextId = () => `rw-${++counter}`;

const setup = (overrides: Partial<GameConfig> = {}) =>
	saveGameConfig({ ...DEFAULT_GAME_CONFIG, enabled: true, ...overrides });

beforeEach(() => {
	localStorage.clear();
	sendChatMessageMock.mockClear();
	__resetGameEngineForTest();
	__seedChannelInfoForTest(CHANNEL, { broadcasterId: 42, streamId: "900" });
});

describe("applyChatReward", () => {
	const reward = DEFAULT_ECONOMY.chatReward;

	test("her mesaj puan kazandırır — bekleme veya uzunluk şartı yok", () => {
		let player = createPlayer("ali", 1000);
		for (let i = 0; i < 5; i++) {
			const next = applyChatReward(player, reward, 1_000_000);
			expect(next).toBeDefined();
			player = next!;
		}
		expect(player.balance).toBe(1000 + 5 * reward.perMessage);
		expect(player.chatEarned).toBe(5 * reward.perMessage);
	});

	test("tek karakterlik mesaj bile kazandırır (spam koruması yok)", () => {
		const player = createPlayer("ali", 1000);
		expect(applyChatReward(player, reward, 1)).toBeDefined();
	});

	test("oturum tavanına ulaşınca durur", () => {
		const config = { enabled: true, perMessage: 100, maxPerSession: 250 };
		let player = createPlayer("ali", 0);
		for (let i = 0; i < 10; i++) {
			const next = applyChatReward(player, config, 1_000_000);
			if (!next) break;
			player = next;
		}
		expect(player.chatEarned).toBe(250);
		expect(player.balance).toBe(250);
		// Tavan dolduktan sonra hiçbir şey dönmez → çağıran diske yazmaz.
		expect(applyChatReward(player, config, 2_000_000)).toBeUndefined();
	});

	test("son ödül tavanı AŞMAZ, kalan kadar verilir", () => {
		const config = { enabled: true, perMessage: 100, maxPerSession: 250 };
		let player = createPlayer("ali", 0);
		player = applyChatReward(player, config, 1)!;
		player = applyChatReward(player, config, 2)!;
		const last = applyChatReward(player, config, 3)!;
		expect(last.chatEarned).toBe(250); // 100 + 100 + 50
	});

	test("kapalıyken hiç kazandırmaz", () => {
		const player = createPlayer("ali", 1000);
		expect(
			applyChatReward(player, { ...reward, enabled: false }, 1)
		).toBeUndefined();
	});

	test("tavan 0 ise sınırsızdır", () => {
		const config = { enabled: true, perMessage: 10, maxPerSession: 0 };
		let player = createPlayer("ali", 0);
		for (let i = 0; i < 100; i++) player = applyChatReward(player, config, i)!;
		expect(player.chatEarned).toBe(1000);
	});

	test("peakBalance ödülle birlikte yükselir", () => {
		const player = createPlayer("ali", 100);
		const next = applyChatReward(player, reward, 1)!;
		expect(next.peakBalance).toBe(next.balance);
	});
});

describe("motor entegrasyonu", () => {
	test("katılmış oyuncu chate yazınca SESSİZCE kazanır", async () => {
		setup({ requireJoin: true });
		evaluateGameMessage(CHANNEL, "ali", "!joingame", nextId());
		await __flushQueuesForTest(CHANNEL);
		const before = peekSession(CHANNEL)!.players.ali.balance;
		sendChatMessageMock.mockClear();

		evaluateGameMessage(CHANNEL, "ali", "merhaba nasilsiniz", nextId());
		await __flushQueuesForTest(CHANNEL);

		const after = peekSession(CHANNEL)!.players.ali;
		expect(after.balance).toBe(before + DEFAULT_ECONOMY.chatReward.perMessage);
		expect(after.chatEarned).toBe(DEFAULT_ECONOMY.chatReward.perMessage);
		// Kritik: pasif kazanç chate DUYURULMAZ.
		expect(sendChatMessageMock).not.toHaveBeenCalled();
	});

	test("katılmamış izleyiciye hesap AÇILMAZ", async () => {
		setup({ requireJoin: true });
		evaluateGameMessage(CHANNEL, "yabanci", "selam millet", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(peekSession(CHANNEL)?.players.yabanci).toBeUndefined();
		expect(sendChatMessageMock).not.toHaveBeenCalled();
	});

	test("yayın kesin kapalıysa ödül verilmez", async () => {
		setup({ requireJoin: true, liveOnly: true });
		evaluateGameMessage(CHANNEL, "ali", "!joingame", nextId());
		await __flushQueuesForTest(CHANNEL);
		const before = peekSession(CHANNEL)!.players.ali.balance;

		__seedChannelInfoForTest(CHANNEL, {
			broadcasterId: 42,
			isLive: false,
			liveKnown: true,
		});
		evaluateGameMessage(CHANNEL, "ali", "hala buradayim", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(peekSession(CHANNEL)!.players.ali.balance).toBe(before);
	});

	test("komut mesajı ödül yoluna girmez (çift kazanç olmaz)", async () => {
		setup({ requireJoin: true });
		evaluateGameMessage(CHANNEL, "ali", "!joingame", nextId());
		await __flushQueuesForTest(CHANNEL);
		const before = peekSession(CHANNEL)!.players.ali.balance;

		evaluateGameMessage(CHANNEL, "ali", "!puan", nextId());
		await __flushQueuesForTest(CHANNEL);

		expect(peekSession(CHANNEL)!.players.ali.balance).toBe(before);
	});
});
