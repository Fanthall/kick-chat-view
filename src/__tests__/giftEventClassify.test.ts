/**
 * FIX-GIFT-LEADERBOARD (2026-07-06) — GiftsLeaderboardUpdated'in gift sanılması.
 *
 * Canlı logda (ilkerfirat) her gerçek hediyede şu görüldü:
 *   [GiftLikeEvent] GiftsLeaderboardUpdated  → sahte "Gift Sub" rutini ateşledi
 *   [GiftLikeEvent] GiftedSubscriptionsEvent → gerçek hediye dedup'la düştü
 * Neden: looksLikeGift, /gift/i ile "Gift"sLeaderboard'ı da yakalıyordu.
 */

import { looksLikeGiftEvent } from "../renderer/util/giftEventClassify";

describe("looksLikeGiftEvent (FIX-GIFT-LEADERBOARD)", () => {
	test("GiftsLeaderboardUpdated gift SAYILMAZ (payload'da gifter olsa bile)", () => {
		expect(
			looksLikeGiftEvent("GiftsLeaderboardUpdated", {
				gifter: { username: "KayzerSoze06" },
				leaderboard: [{ username: "KayzerSoze06", amount: 100 }],
			})
		).toBe(false);
	});

	test("düz isimli leaderboard event'i de gift değil", () => {
		expect(looksLikeGiftEvent("GiftLeaderboard", {})).toBe(false);
		expect(looksLikeGiftEvent("SomethingRankingUpdated", {})).toBe(false);
	});

	test("gerçek GiftedSubscriptionsEvent gift SAYILIR (kısa ve prefixli)", () => {
		expect(looksLikeGiftEvent("GiftedSubscriptionsEvent", {})).toBe(true);
		expect(
			looksLikeGiftEvent("App\\Events\\GiftedSubscriptionsEvent", {})
		).toBe(true);
	});

	test("adı gift içermese de gift alanları varsa gift sayılır", () => {
		expect(
			looksLikeGiftEvent("SomeCustomEvent", { gifter_username: "x" })
		).toBe(true);
		expect(
			looksLikeGiftEvent("SomeCustomEvent", {
				gifted_users: [{ username: "a" }],
			})
		).toBe(true);
		expect(
			looksLikeGiftEvent("SomeCustomEvent", { gifted_usernames: ["a"] })
		).toBe(true);
	});

	test("alakasız event gift değil", () => {
		expect(looksLikeGiftEvent("ChatMessageEvent", { content: "hi" })).toBe(
			false
		);
		expect(looksLikeGiftEvent(undefined, undefined)).toBe(false);
	});
});
