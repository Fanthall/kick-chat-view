/**
 * Sprint 58b — Gift recipient filtresi.
 *
 * GiftedSubscriptionsEvent ile alıcılar cache'lenir, hemen ardından
 * SubscriptionEvent gelirse (alıcı için) — includeGifted=false rule
 * tetiklenmez; gerçek (kendi parasıyla) sub gelirse tetiklenir.
 */

import {
	__resetGiftRecipientCacheForTest,
	evaluateGiftSubEvent,
	evaluateSubEvent,
} from "../renderer/util/automationRulesEngine";
import {
	saveAutomationRules,
	loadAutomationRules,
} from "../renderer/util/automationRulesStorage";
import { ChannelRule, createBlankRule } from "../renderer/util/automationRules";
import { enrichLegacyGiftedSubscriptionsPayload } from "../renderer/util/legacyPusherBridge";

// react-toastify ESM ile geliyor — sadece toast objesini stub'la.
jest.mock("react-toastify", () => ({
	toast: Object.assign(jest.fn(), {
		success: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	}),
}));

const buildSubRule = (overrides?: Partial<ChannelRule>): ChannelRule => ({
	...createBlankRule(),
	name: "test sub",
	channelSlugs: [],
	enabled: true,
	cooldownSec: 0,
	trigger: { type: "sub_event", includeGifted: false },
	action: { type: "send_toast", content: "hi {username}" },
	...overrides,
});

describe("automation gift recipient filter (Sprint 58b)", () => {
	beforeEach(() => {
		localStorage.clear();
		__resetGiftRecipientCacheForTest();
	});

	test("hediye alan kullanıcı için sub_event tetiklenmez (includeGifted=false)", () => {
		const rule = buildSubRule();
		saveAutomationRules([rule]);
		// rule cache'i refresh için yeniden initialize tetikle.
		// (engine ilk evaluate çağrısında loadAutomationRules okur)
		const { toast } = require("react-toastify");
		(toast as jest.Mock).mockClear();

		// Önce gift event: alice ve bob hediye sub aldı
		evaluateGiftSubEvent("kanal", "gifter", 2, ["alice", "bob"]);

		// Hemen ardından SubscriptionEvent — alice için (Kick'in çift yayını)
		evaluateSubEvent("kanal", "alice", 1);

		// includeGifted=false olduğu için tetiklenmemeli
		expect(toast).not.toHaveBeenCalled();
	});

	test("gerçek (kendi parasıyla) sub için tetiklenir", () => {
		saveAutomationRules([buildSubRule()]);
		const { toast } = require("react-toastify");
		(toast as jest.Mock).mockClear();

		// Cache boş — hiç gift yok.
		evaluateSubEvent("kanal", "charlie", 1);

		expect(toast).toHaveBeenCalledTimes(1);
		expect((toast as jest.Mock).mock.calls[0][0]).toContain("charlie");
	});

	test("includeGifted=true ise hediye alan da tetiklenir", () => {
		saveAutomationRules([
			buildSubRule({
				trigger: { type: "sub_event", includeGifted: true },
			}),
		]);
		const { toast } = require("react-toastify");
		(toast as jest.Mock).mockClear();

		evaluateGiftSubEvent("kanal", "gifter", 1, ["alice"]);
		evaluateSubEvent("kanal", "alice", 1);

		expect(toast).toHaveBeenCalledTimes(1);
	});

	test("farklı kanaldaki gift, başka kanalın sub_event'ini engellemez", () => {
		saveAutomationRules([buildSubRule({ channelSlugs: [] })]);
		const { toast } = require("react-toastify");
		(toast as jest.Mock).mockClear();

		evaluateGiftSubEvent("kanalA", "gifter", 1, ["alice"]);
		// alice "kanalB"'de SubscriptionEvent atarsa (farklı kanal) tetiklenmeli
		evaluateSubEvent("kanalB", "alice", 1);

		expect(toast).toHaveBeenCalledTimes(1);
	});

	test("disabled rule hiçbir durumda tetiklenmez", () => {
		saveAutomationRules([buildSubRule({ enabled: false })]);
		const { toast } = require("react-toastify");
		(toast as jest.Mock).mockClear();

		evaluateSubEvent("kanal", "charlie", 1);

		expect(toast).not.toHaveBeenCalled();
	});

	// FIX-GIFT-AUTOMATION regresyonu: Kick alıcı listesini `gifted_usernames`
	// yerine `gifted_users[]` / `usernames` / tekil `gifted_username` ile
	// gönderebiliyor. chatConnection artık otomasyona enrich edilmiş payload'ın
	// listesini geçiyor — bu sözleşme delinirse alıcılar işaretlenmez ve
	// sub_event rutini hediye alanlar için de chate mesaj atar.
	test("standart dışı gift payload'u (gifted_users) enrich edilince alıcı yine filtrelenir", () => {
		saveAutomationRules([buildSubRule()]);
		const { toast } = require("react-toastify");
		(toast as jest.Mock).mockClear();

		// Kick'in alternatif payload şekli — ham gifted_usernames YOK.
		const enriched = enrichLegacyGiftedSubscriptionsPayload({
			gifter: { username: "gifter" },
			gifted_users: [{ username: "alice" }, { username: "bob" }],
		} as any);
		expect(enriched.gifted_usernames).toEqual(["alice", "bob"]);

		// chatConnection call-site sözleşmesi: enriched liste otomasyona geçer.
		evaluateGiftSubEvent(
			"kanal",
			enriched.gifter_username,
			enriched.gifted_usernames.length,
			enriched.gifted_usernames
		);

		// Alıcı için gelen SubscriptionEvent rutini tetiklememeli.
		evaluateSubEvent("kanal", "alice", 1);
		evaluateSubEvent("kanal", "bob", 1);
		expect(toast).not.toHaveBeenCalled();

		// Gerçek sub hâlâ tetiklenir.
		evaluateSubEvent("kanal", "charlie", 1);
		expect(toast).toHaveBeenCalledTimes(1);
	});

	test("storage roundtrip — includeGifted persist eder", () => {
		const rule = buildSubRule({
			trigger: { type: "sub_event", includeGifted: true },
		});
		saveAutomationRules([rule]);
		const loaded = loadAutomationRules();
		expect(loaded).toHaveLength(1);
		const trig = loaded[0].trigger;
		expect(trig.type).toBe("sub_event");
		if (trig.type === "sub_event") {
			expect(trig.includeGifted).toBe(true);
		}
	});
});
