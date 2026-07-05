/**
 * FIX-GIFT-DUP (2026-07-05) — tek hediyenin çift Pusher event'iyle iki kez
 * işlenmesini engelleyen kısa pencereli dedup.
 *
 * Senaryo (kullanıcı ekran görüntüsü): tek Styrande hediyesi hem resmî
 * GiftedSubscriptionsEvent (alıcı=DasCarnifex) hem fallback gift-benzeri event
 * (alıcı boş → "birine") olarak geliyor; ikisi de dispatch + otomasyon
 * yapınca aktivite çift kayıt + chate çift mesaj oluyordu.
 */

import {
	isDuplicateGift,
	__resetGiftDedupForTest,
	GIFT_DEDUP_WINDOW_MS,
} from "../renderer/util/giftDedup";

describe("gift dedup (FIX-GIFT-DUP)", () => {
	beforeEach(() => {
		__resetGiftDedupForTest();
	});

	test("aynı gifter'dan pencere içinde ikinci hediye event'i duplike sayılır", () => {
		// 1. event (resmî, isimli alıcı) — işlenir.
		expect(isDuplicateGift("kanal", "Styrande", 1000)).toBe(false);
		// 2. event (fallback, isimsiz) hemen ardından — duplike, atlanır.
		expect(isDuplicateGift("kanal", "Styrande", 1200)).toBe(true);
	});

	test("gifter adı büyük/küçük harf farkı dedup'ı bozmaz", () => {
		expect(isDuplicateGift("Kanal", "Styrande", 1000)).toBe(false);
		expect(isDuplicateGift("kanal", "styrande", 1300)).toBe(true);
	});

	test("pencere geçtikten sonra aynı gifter yeniden işlenir (gerçek 2. hediye)", () => {
		expect(isDuplicateGift("kanal", "Styrande", 1000)).toBe(false);
		expect(
			isDuplicateGift("kanal", "Styrande", 1000 + GIFT_DEDUP_WINDOW_MS + 1)
		).toBe(false);
	});

	test("farklı gifter'lar birbirini bastırmaz (aynı anda)", () => {
		expect(isDuplicateGift("kanal", "Styrande", 1000)).toBe(false);
		expect(isDuplicateGift("kanal", "CypTrophy", 1050)).toBe(false);
	});

	test("farklı kanaldaki aynı gifter bağımsızdır", () => {
		expect(isDuplicateGift("kanalA", "Styrande", 1000)).toBe(false);
		expect(isDuplicateGift("kanalB", "Styrande", 1050)).toBe(false);
	});

	test("isimsiz (anon) gifter'da da pencere çalışır", () => {
		expect(isDuplicateGift("kanal", undefined, 1000)).toBe(false);
		expect(isDuplicateGift("kanal", undefined, 1200)).toBe(true);
	});
});
