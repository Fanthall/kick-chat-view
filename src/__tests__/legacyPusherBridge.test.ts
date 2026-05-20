import {
	enrichLegacyGiftedSubscriptionsPayload,
	enrichLegacySubscriptionPayload,
	LegacyGiftedSubscriptionsPayload,
	LegacySubscriptionPayload,
} from "../renderer/util/legacyPusherBridge";

// WI-1.5 acceptance:
// - Legacy SubscriptionEvent / GiftedSubscriptionsEvent payload'lari icin enrichment.
// - eventType etiketi eklenir.
// - expires_at varsa epoch ms'e parse edilir.
// - Anonymous gifter tespiti: is_anonymous=true VEYA gifter_username "anonymous" / bos.
// - Legacy alanlar (months, streak, gifted_usernames, gifter_username) korunur. CONSTRAINT-3.

describe("enrichLegacySubscriptionPayload > legacy SubscriptionEvent", () => {
	const base: LegacySubscriptionPayload = {
		chatroom_id: 99,
		username: "subscriberX",
		months: 3,
		create_at: 1716210000000,
	};

	it("eventType etiketi + legacy field'lar korunur (months/streak)", () => {
		const out = enrichLegacySubscriptionPayload({
			...base,
			streak: 2,
		});
		expect(out.eventType).toBe("App\\Events\\SubscriptionEvent");
		// CONSTRAINT-3: legacy alanlar olduğu gibi
		expect(out.username).toBe("subscriberX");
		expect(out.months).toBe(3);
		expect(out.streak).toBe(2);
		expect(out.chatroom_id).toBe(99);
		expect(out.create_at).toBe(1716210000000);
	});

	it("ISO expires_at -> epoch ms", () => {
		const out = enrichLegacySubscriptionPayload({
			...base,
			expires_at: "2026-06-20T12:00:00Z",
		});
		expect(out.expiresAt).toBe(new Date("2026-06-20T12:00:00Z").getTime());
	});

	it("expires_at yoksa expiresAt undefined", () => {
		const out = enrichLegacySubscriptionPayload(base);
		expect(out.expiresAt).toBeUndefined();
	});

	it("expires_at numeric -> oldugu gibi", () => {
		const out = enrichLegacySubscriptionPayload({
			...base,
			expires_at: 1716296400000 as any,
		});
		expect(out.expiresAt).toBe(1716296400000);
	});

	it("gecersiz expires_at string -> undefined, hata yok", () => {
		const out = enrichLegacySubscriptionPayload({
			...base,
			expires_at: "not-a-date",
		});
		expect(out.expiresAt).toBeUndefined();
	});
});

describe("enrichLegacyGiftedSubscriptionsPayload > legacy GiftedSubscriptionsEvent", () => {
	const base: LegacyGiftedSubscriptionsPayload = {
		chatroom_id: 99,
		gifter_username: "BigGifter",
		gifted_usernames: ["a", "b", "c"],
		create_at: 1716210000000,
	};

	it("eventType etiketi + legacy alanlar korunur", () => {
		const out = enrichLegacyGiftedSubscriptionsPayload(base);
		expect(out.eventType).toBe("App\\Events\\GiftedSubscriptionsEvent");
		expect(out.gifter_username).toBe("BigGifter");
		expect(out.gifted_usernames).toEqual(["a", "b", "c"]);
	});

	it("is_anonymous=true -> anonymous true", () => {
		const out = enrichLegacyGiftedSubscriptionsPayload({
			...base,
			is_anonymous: true,
		});
		expect(out.anonymous).toBe(true);
	});

	it("gifter_username 'anonymous' (case-insensitive) -> anonymous true", () => {
		const out = enrichLegacyGiftedSubscriptionsPayload({
			...base,
			gifter_username: "Anonymous",
		});
		expect(out.anonymous).toBe(true);
	});

	it("gifter_username bos string -> anonymous true", () => {
		const out = enrichLegacyGiftedSubscriptionsPayload({
			...base,
			gifter_username: "   ",
		});
		expect(out.anonymous).toBe(true);
	});

	it("normal gifter -> anonymous undefined (NOT false; uniform with optional-field policy)", () => {
		const out = enrichLegacyGiftedSubscriptionsPayload(base);
		expect(out.anonymous).toBeUndefined();
	});

	it("expires_at ISO -> epoch ms", () => {
		const out = enrichLegacyGiftedSubscriptionsPayload({
			...base,
			expires_at: "2026-06-20T12:00:00Z",
		});
		expect(out.expiresAt).toBe(new Date("2026-06-20T12:00:00Z").getTime());
	});
});

describe("Bridge enrichment > smoke: legacy + new normalizer ayni eventType keyword'unu paylasmiyor", () => {
	// Sanity: webhook normalizer "channel.subscription.new" emit eder; legacy bridge
	// "App\\Events\\SubscriptionEvent" emit eder. UI filter ikisini ayri ayri tanimali.
	it("legacy etiketi 'App\\\\Events\\\\' prefix'iyle baslar", () => {
		const sub = enrichLegacySubscriptionPayload({
			chatroom_id: 1,
			username: "u",
			months: 1,
			create_at: 0,
		});
		const gift = enrichLegacyGiftedSubscriptionsPayload({
			chatroom_id: 1,
			gifter_username: "g",
			gifted_usernames: [],
			create_at: 0,
		});
		expect(sub.eventType?.startsWith("App\\Events\\")).toBe(true);
		expect(gift.eventType?.startsWith("App\\Events\\")).toBe(true);
	});
});
