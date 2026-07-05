/**
 * 3. göz kalite kontrolü — engine'in her trigger tipinin gerçekten ateşlediğini
 * ve filter/cooldown mantığının doğru çalıştığını doğrular.
 *
 * Test stratejisi:
 *   - toast'u mock'la → fireAction → send_toast çağrıldığında yakalanır
 *   - sendChatMessage'i mock'la → send_message için
 *   - localStorage state'e rule yaz → evaluate çağır → mock'ları kontrol et
 */

import {
	__resetGiftRecipientCacheForTest,
	__resetSchedulersForTest,
	evaluateChatMessage,
	evaluateFollowEvent,
	evaluateGiftSubEvent,
	evaluateHostEvent,
	evaluateKicksEvent,
	evaluateRewardEvent,
	evaluateSubEvent,
} from "../renderer/util/automationRulesEngine";
import { saveAutomationRules } from "../renderer/util/automationRulesStorage";
import { ChannelRule, createBlankRule } from "../renderer/util/automationRules";

jest.mock("react-toastify", () => ({
	toast: Object.assign(jest.fn(), {
		success: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	}),
}));

const sendChatMessageMock = jest.fn((_req: any) => Promise.resolve());
const getChannelBySlugMock = jest.fn((_slug: string) =>
	Promise.resolve({
		data: [{ broadcaster_user_id: 42, stream: { is_live: true } }],
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

const { toast } = require("react-toastify");

const buildRule = (overrides: Partial<ChannelRule> = {}): ChannelRule => ({
	...createBlankRule(),
	name: "test",
	enabled: true,
	channelSlugs: [],
	cooldownSec: 0,
	action: { type: "send_toast", content: "fired" },
	...overrides,
});

beforeEach(() => {
	localStorage.clear();
	__resetGiftRecipientCacheForTest();
	__resetSchedulersForTest();
	(toast as jest.Mock).mockClear();
	sendChatMessageMock.mockClear();
	getChannelBySlugMock.mockClear();
});

// ─── chat_match ─────────────────────────────────────────────────────────────

describe("Trigger: chat_match", () => {
	test("substring eşleşince tetiklenir", () => {
		saveAutomationRules([
			buildRule({
				trigger: { type: "chat_match", pattern: "merhaba", caseInsensitive: true },
			}),
		]);
		evaluateChatMessage("kanal", "alice", "Merhaba abi!");
		expect(toast).toHaveBeenCalledTimes(1);
	});

	test("pattern uyuşmazsa tetiklenmez", () => {
		saveAutomationRules([
			buildRule({
				trigger: { type: "chat_match", pattern: "merhaba", caseInsensitive: true },
			}),
		]);
		evaluateChatMessage("kanal", "alice", "selam");
		expect(toast).not.toHaveBeenCalled();
	});

	test("regex mode çalışır", () => {
		saveAutomationRules([
			buildRule({
				trigger: {
					type: "chat_match",
					pattern: "^!discord$",
					isRegex: true,
					caseInsensitive: true,
				},
			}),
		]);
		evaluateChatMessage("kanal", "alice", "!discord");
		expect(toast).toHaveBeenCalledTimes(1);
		evaluateChatMessage("kanal", "bob", "lütfen !discord linki");
		// Regex anchor varsa eşleşmemeli
		expect(toast).toHaveBeenCalledTimes(1);
	});

	test("kullanıcı kendi mesajını yazınca tetiklenmez (loop önlemi)", () => {
		localStorage.setItem("username", "fanthal");
		saveAutomationRules([
			buildRule({
				trigger: { type: "chat_match", pattern: "test", caseInsensitive: true },
			}),
		]);
		// Kendisi yazınca → skip
		evaluateChatMessage("kanal", "fanthal", "test mesajı");
		expect(toast).not.toHaveBeenCalled();
		// Başkası yazınca → fire
		evaluateChatMessage("kanal", "alice", "test mesajı");
		expect(toast).toHaveBeenCalledTimes(1);
	});

	test("case-insensitive false ise büyük/küçük harf önemli", () => {
		saveAutomationRules([
			buildRule({
				trigger: {
					type: "chat_match",
					pattern: "merhaba",
					caseInsensitive: false,
				},
			}),
		]);
		evaluateChatMessage("kanal", "alice", "MERHABA");
		expect(toast).not.toHaveBeenCalled();
		evaluateChatMessage("kanal", "alice", "merhaba");
		expect(toast).toHaveBeenCalledTimes(1);
	});
});

// ─── mention ────────────────────────────────────────────────────────────────

describe("Trigger: mention", () => {
	test("kendi adın etiketleninince tetiklenir (default)", () => {
		localStorage.setItem("username", "Fanthal");
		saveAutomationRules([
			buildRule({
				trigger: { type: "mention" }, // usernames boş = kendi adın
			}),
		]);
		evaluateChatMessage("kanal", "alice", "@fanthal selam!");
		expect(toast).toHaveBeenCalledTimes(1);
	});

	test("özel kullanıcı listesi (botRix vs.)", () => {
		saveAutomationRules([
			buildRule({
				trigger: { type: "mention", usernames: ["BotRix"] },
			}),
		]);
		evaluateChatMessage("kanal", "alice", "@botrix help");
		expect(toast).toHaveBeenCalledTimes(1);
		evaluateChatMessage("kanal", "alice", "@başkası");
		expect(toast).toHaveBeenCalledTimes(1); // değişmedi
	});
});

// ─── sub_event ──────────────────────────────────────────────────────────────

describe("Trigger: sub_event", () => {
	test("yeni sub geldiğinde tetiklenir", () => {
		saveAutomationRules([
			buildRule({ trigger: { type: "sub_event", includeGifted: false } }),
		]);
		evaluateSubEvent("kanal", "alice", 3);
		expect(toast).toHaveBeenCalledTimes(1);
	});

	test("placeholder doğru doldurulur — {username}, {months}", () => {
		saveAutomationRules([
			buildRule({
				trigger: { type: "sub_event", includeGifted: false },
				action: { type: "send_toast", content: "{username} - {months} ay" },
			}),
		]);
		evaluateSubEvent("kanal", "Alice", 7);
		expect(toast).toHaveBeenCalledTimes(1);
		const arg = (toast as jest.Mock).mock.calls[0][0];
		expect(arg).toContain("Alice");
		expect(arg).toContain("7");
	});

	test("hediye-sub alıcısı için sub_event tetiklenmez (default filter)", () => {
		saveAutomationRules([
			buildRule({ trigger: { type: "sub_event", includeGifted: false } }),
		]);
		evaluateGiftSubEvent("kanal", "gifter", 1, ["alice"]);
		(toast as jest.Mock).mockClear();
		evaluateSubEvent("kanal", "alice", 1);
		expect(toast).not.toHaveBeenCalled();
	});

	test("includeGifted=true ile hediye alan da tetikler", () => {
		saveAutomationRules([
			buildRule({ trigger: { type: "sub_event", includeGifted: true } }),
		]);
		evaluateGiftSubEvent("kanal", "gifter", 1, ["alice"]);
		(toast as jest.Mock).mockClear();
		evaluateSubEvent("kanal", "alice", 1);
		expect(toast).toHaveBeenCalledTimes(1);
	});
});

// ─── gift_sub_event ─────────────────────────────────────────────────────────

describe("Trigger: gift_sub_event", () => {
	test("hediye sub geldiğinde gifter için tetiklenir", () => {
		saveAutomationRules([
			buildRule({
				trigger: { type: "gift_sub_event" },
				action: { type: "send_toast", content: "{username} {amount} sub hediye etti" },
			}),
		]);
		evaluateGiftSubEvent("kanal", "Bob", 5, ["a", "b", "c", "d", "e"]);
		expect(toast).toHaveBeenCalledTimes(1);
		const arg = (toast as jest.Mock).mock.calls[0][0];
		expect(arg).toContain("Bob");
		expect(arg).toContain("5");
	});
});

// ─── follow_event ───────────────────────────────────────────────────────────

describe("Trigger: follow_event", () => {
	test("yeni takipçi delta'sında tetiklenir", () => {
		saveAutomationRules([buildRule({ trigger: { type: "follow_event" } })]);
		evaluateFollowEvent("kanal", 1);
		expect(toast).toHaveBeenCalledTimes(1);
	});
});

// ─── kicks_event ────────────────────────────────────────────────────────────

describe("Trigger: kicks_event", () => {
	test("KICKs geldiğinde tetiklenir", () => {
		saveAutomationRules([
			buildRule({ trigger: { type: "kicks_event", minAmount: 0 } }),
		]);
		evaluateKicksEvent("kanal", "alice", 100);
		expect(toast).toHaveBeenCalledTimes(1);
	});

	test("minAmount altındaki tutar tetiklemez", () => {
		saveAutomationRules([
			buildRule({ trigger: { type: "kicks_event", minAmount: 1000 } }),
		]);
		evaluateKicksEvent("kanal", "alice", 100);
		expect(toast).not.toHaveBeenCalled();
	});

	test("minAmount üstü tetikler", () => {
		saveAutomationRules([
			buildRule({ trigger: { type: "kicks_event", minAmount: 1000 } }),
		]);
		evaluateKicksEvent("kanal", "alice", 1500);
		expect(toast).toHaveBeenCalledTimes(1);
	});
});

// ─── host_event ─────────────────────────────────────────────────────────────

describe("Trigger: host_event", () => {
	test("host geldiğinde tetiklenir", () => {
		saveAutomationRules([buildRule({ trigger: { type: "host_event" } })]);
		evaluateHostEvent("kanal", "hostuser", 250);
		expect(toast).toHaveBeenCalledTimes(1);
	});
});

// ─── reward_redeemed ────────────────────────────────────────────────────────

describe("Trigger: reward_redeemed", () => {
	test("reward title yoksa tüm rewardlar tetikler", () => {
		saveAutomationRules([
			buildRule({ trigger: { type: "reward_redeemed", rewardTitle: "" } }),
		]);
		evaluateRewardEvent("kanal", "alice", "Highlight My Message");
		expect(toast).toHaveBeenCalledTimes(1);
	});

	test("reward title filter doğru çalışır", () => {
		saveAutomationRules([
			buildRule({
				trigger: { type: "reward_redeemed", rewardTitle: "Highlight" },
			}),
		]);
		evaluateRewardEvent("kanal", "alice", "Highlight My Message");
		expect(toast).toHaveBeenCalledTimes(1);
		evaluateRewardEvent("kanal", "alice", "Skip Song");
		expect(toast).toHaveBeenCalledTimes(1); // değişmedi
	});
});

// ─── Cooldown ───────────────────────────────────────────────────────────────

describe("Cooldown", () => {
	test("cooldown süresinde 2. tetikleme atlar", () => {
		saveAutomationRules([
			buildRule({
				cooldownSec: 30,
				trigger: { type: "chat_match", pattern: "test", caseInsensitive: true },
			}),
		]);
		evaluateChatMessage("kanal", "alice", "test");
		evaluateChatMessage("kanal", "bob", "test"); // hemen sonra
		expect(toast).toHaveBeenCalledTimes(1);
	});

	test("cooldown=0 ise her seferinde tetikler", () => {
		saveAutomationRules([
			buildRule({
				cooldownSec: 0,
				trigger: { type: "chat_match", pattern: "test", caseInsensitive: true },
			}),
		]);
		evaluateChatMessage("kanal", "alice", "test");
		evaluateChatMessage("kanal", "bob", "test");
		evaluateChatMessage("kanal", "charlie", "test");
		expect(toast).toHaveBeenCalledTimes(3);
	});
});

// ─── Channel scope ──────────────────────────────────────────────────────────

describe("Per-channel scope", () => {
	test("boş channelSlugs = tüm kanallarda çalışır", () => {
		saveAutomationRules([
			buildRule({
				channelSlugs: [],
				trigger: { type: "chat_match", pattern: "x", caseInsensitive: true },
			}),
		]);
		evaluateChatMessage("kanalA", "alice", "x");
		evaluateChatMessage("kanalB", "alice", "x");
		expect(toast).toHaveBeenCalledTimes(2);
	});

	test("seçili kanal scope dışındaki event'i atlar", () => {
		saveAutomationRules([
			buildRule({
				channelSlugs: ["KanalA"],
				trigger: { type: "chat_match", pattern: "x", caseInsensitive: true },
			}),
		]);
		evaluateChatMessage("kanalA", "alice", "x");
		evaluateChatMessage("kanalB", "alice", "x");
		expect(toast).toHaveBeenCalledTimes(1);
	});
});

// ─── send_message action ────────────────────────────────────────────────────

describe("Action: send_message", () => {
	test("send_message → window.electron.kick.sendChatMessage çağrılır", async () => {
		saveAutomationRules([
			buildRule({
				trigger: { type: "chat_match", pattern: "hi", caseInsensitive: true },
				action: { type: "send_message", content: "Hello {username}!" },
			}),
		]);
		evaluateChatMessage("kanal", "alice", "hi there");
		// fireAction async → promise queue'u boşalt
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));
		expect(sendChatMessageMock).toHaveBeenCalledTimes(1);
		const call = sendChatMessageMock.mock.calls[0][0] as any;
		expect(call.broadcaster_user_id).toBe(42);
		expect(call.content).toBe("Hello alice!");
		expect(call.type).toBe("user");
	});

	// FIX-GIFT (2026-07-04): tiered repeat — hediye adedine göre çok mesaj (maxCount tavanlı).
	test("send_message repeat(tiered) → amount'a göre çok mesaj (delaySec=0)", async () => {
		saveAutomationRules([
			buildRule({
				trigger: { type: "gift_sub_event" },
				action: {
					type: "send_message",
					content: "tebrikler {username}",
					repeat: {
						mode: "tiered",
						delaySec: 0,
						maxCount: 5,
						tiers: [
							{ minAmount: 1, count: 1 },
							{ minAmount: 5, count: 2 },
							{ minAmount: 10, count: 3 },
						],
					},
				},
			}),
		]);
		evaluateGiftSubEvent("kanal", "Bob", 10, []); // amount=10 → tier count 3
		for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
		expect(sendChatMessageMock).toHaveBeenCalledTimes(3);
	});

	test("send_message repeat(tiered) maxCount tavanı aşılmaz", async () => {
		saveAutomationRules([
			buildRule({
				trigger: { type: "gift_sub_event" },
				action: {
					type: "send_message",
					content: "x",
					repeat: {
						mode: "tiered",
						delaySec: 0,
						maxCount: 5,
						tiers: [{ minAmount: 1, count: 99 }], // count tavanı aşıyor
					},
				},
			}),
		]);
		evaluateGiftSubEvent("kanal", "Bob", 100, []);
		for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
		expect(sendChatMessageMock).toHaveBeenCalledTimes(5); // maxCount
	});

	test("send_message repeat YOKSA tek mesaj (default — adet fark etmez)", async () => {
		saveAutomationRules([
			buildRule({
				trigger: { type: "gift_sub_event" },
				action: { type: "send_message", content: "tek" },
			}),
		]);
		evaluateGiftSubEvent("kanal", "Bob", 50, []);
		for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
		expect(sendChatMessageMock).toHaveBeenCalledTimes(1);
	});
});

// ─── Disabled rule ──────────────────────────────────────────────────────────

describe("Disabled rule", () => {
	test("enabled=false → tetiklenmez", () => {
		saveAutomationRules([
			buildRule({
				enabled: false,
				trigger: { type: "chat_match", pattern: "test", caseInsensitive: true },
			}),
		]);
		evaluateChatMessage("kanal", "alice", "test");
		expect(toast).not.toHaveBeenCalled();
	});
});
