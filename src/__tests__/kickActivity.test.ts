import { normalizeKickWebhookActivity } from "../renderer/util/kickActivity";

// Test contract: REQ-3 (sub new/renewal + expires_at), REQ-4 (giftees + anonymous fallback),
// REQ-5 (KICKs tier/pinned/name/type/message/amount), CONSTRAINT-3 (legacy payload tolerance).

describe("normalizeKickWebhookActivity > sub-new", () => {
	const payload = {
		id: "evt-sub-new-1",
		broadcaster: { channel_slug: "demo-channel" },
		subscriber: {
			user_id: 42,
			username: "newSubUser",
			channel_slug: "newsubuser",
			profile_picture: "https://example.test/avatar.png",
		},
		subscription: {
			id: "sub-1",
			duration: 1,
			expires_at: "2026-06-20T12:00:00Z",
		},
		created_at: "2026-05-20T10:00:00Z",
	};

	it("maps subscription_new with actor, months, expiresAt, eventType", () => {
		const item = normalizeKickWebhookActivity("channel.subscription.new", payload);
		expect(item).toBeDefined();
		expect(item!.kind).toBe("subscription_new");
		expect(item!.eventType).toBe("channel.subscription.new");
		expect(item!.actor.username).toBe("newSubUser");
		expect(item!.actor.id).toBe(42);
		expect(item!.months).toBe(1);
		expect(item!.expiresAt).toBe(new Date("2026-06-20T12:00:00Z").getTime());
		expect(item!.channelSlug).toBe("demo-channel");
		expect(item!.createdAt).toBe(new Date("2026-05-20T10:00:00Z").getTime());
		// backward compat: legacy fields still populated
		expect(item!.username).toBe("newSubUser");
		expect(item!.create_at).toBe(item!.createdAt);
	});

	it("tolerates missing subscription.expires_at (returns undefined, no throw)", () => {
		const noExpiry = { ...payload, subscription: { id: "sub-1", duration: 1 } };
		const item = normalizeKickWebhookActivity("channel.subscription.new", noExpiry);
		expect(item).toBeDefined();
		expect(item!.expiresAt).toBeUndefined();
		expect(item!.months).toBe(1);
	});
});

describe("normalizeKickWebhookActivity > sub-renewal", () => {
	const payload = {
		id: "evt-sub-renewal-1",
		broadcaster: { channel_slug: "demo-channel" },
		subscriber: {
			user_id: 99,
			username: "loyalSub",
		},
		subscription: {
			id: "sub-99",
			duration: 3,
			streak: 6,
			expires_at: "2026-08-20T12:00:00Z",
		},
		created_at: "2026-05-20T10:05:00Z",
	};

	it("maps subscription_renewal with duration + streak + expiresAt", () => {
		const item = normalizeKickWebhookActivity("channel.subscription.renewal", payload);
		expect(item).toBeDefined();
		expect(item!.kind).toBe("subscription_renewal");
		expect(item!.eventType).toBe("channel.subscription.renewal");
		expect(item!.actor.username).toBe("loyalSub");
		expect(item!.months).toBe(3);
		expect(item!.streak).toBe(6);
		expect(item!.expiresAt).toBe(new Date("2026-08-20T12:00:00Z").getTime());
	});

	it("falls back to top-level months/streak if subscription.* missing (legacy Pusher)", () => {
		const legacy = {
			id: "legacy-renewal",
			subscriber: { username: "legacyUser" },
			months: 12,
			streak: 12,
			created_at: "2026-05-20T10:10:00Z",
		};
		const item = normalizeKickWebhookActivity("channel.subscription.renewal", legacy);
		expect(item).toBeDefined();
		expect(item!.months).toBe(12);
		expect(item!.streak).toBe(12);
		expect(item!.expiresAt).toBeUndefined();
	});
});

describe("normalizeKickWebhookActivity > gift-with-giftees-anon", () => {
	const payload = {
		id: "evt-gift-1",
		broadcaster: { channel_slug: "demo-channel" },
		gifter: null, // anonymous
		giftees: [
			{ user_id: 1, username: "giftee_one", profile_picture: "https://example.test/1.png" },
			{ user_id: 2, username: "giftee_two" },
			{ user_id: 3, username: "giftee_three" },
		],
		gift: { id: "gift-1", amount: 3 },
		created_at: "2026-05-20T11:00:00Z",
	};

	it("maps gifter to 'Anonymous' fallback when payload.gifter is null", () => {
		const item = normalizeKickWebhookActivity("channel.subscription.gifts", payload);
		expect(item).toBeDefined();
		expect(item!.kind).toBe("subscription_gift");
		expect(item!.eventType).toBe("channel.subscription.gifts");
		expect(item!.actor.username).toBe("Anonymous");
		expect(item!.anonymous).toBe(true);
		expect(item!.username).toBe("Anonymous");
	});

	it("maps giftees array (docs field) to targetUsers", () => {
		const item = normalizeKickWebhookActivity("channel.subscription.gifts", payload);
		expect(item!.targetUsers).toHaveLength(3);
		expect(item!.targetUsers!.map((u) => u.username)).toEqual([
			"giftee_one",
			"giftee_two",
			"giftee_three",
		]);
		expect(item!.giftedList).toEqual(["giftee_one", "giftee_two", "giftee_three"]);
		expect(item!.amount).toBe(3);
	});

	it("accepts is_anonymous flag on gifter object", () => {
		const flagged = {
			...payload,
			gifter: { username: "someone", is_anonymous: true },
		};
		const item = normalizeKickWebhookActivity("channel.subscription.gifts", flagged);
		expect(item!.actor.username).toBe("Anonymous");
		expect(item!.anonymous).toBe(true);
	});

	it("falls back to gifted_users (legacy field) when giftees missing — CONSTRAINT-3", () => {
		const legacy = {
			id: "legacy-gift",
			gifter: { username: "realGifter", user_id: 77 },
			gifted_users: [{ username: "legacy_a" }, { username: "legacy_b" }],
			created_at: "2026-05-20T11:30:00Z",
		};
		const item = normalizeKickWebhookActivity("channel.subscription.gifts", legacy);
		expect(item!.actor.username).toBe("realGifter");
		expect(item!.anonymous).toBeUndefined();
		expect(item!.targetUsers).toHaveLength(2);
		expect(item!.giftedList).toEqual(["legacy_a", "legacy_b"]);
		expect(item!.amount).toBe(2); // amount falls back to giftedUsers.length
	});

	it("falls back to recipients (alt legacy field) when giftees + gifted_users missing", () => {
		const altLegacy = {
			id: "alt-legacy-gift",
			gifter: { username: "altGifter" },
			recipients: [{ username: "alt_a" }],
			gift: { amount: 1 },
			created_at: "2026-05-20T11:31:00Z",
		};
		const item = normalizeKickWebhookActivity("channel.subscription.gifts", altLegacy);
		expect(item!.targetUsers).toHaveLength(1);
		expect(item!.giftedList).toEqual(["alt_a"]);
	});

	it("tolerates empty giftees + null gifter (no throw, anonymous + empty list)", () => {
		const item = normalizeKickWebhookActivity("channel.subscription.gifts", {
			id: "empty",
			gifter: null,
			giftees: [],
			gift: { amount: 0 },
		});
		expect(item).toBeDefined();
		expect(item!.actor.username).toBe("Anonymous");
		expect(item!.targetUsers).toEqual([]);
		expect(item!.amount).toBe(0);
	});
});

describe("normalizeKickWebhookActivity > kicks-tiered", () => {
	const payload = {
		id: "evt-kicks-1",
		broadcaster: { channel_slug: "demo-channel" },
		sender: {
			user_id: 500,
			username: "kicksSender",
			profile_picture: "https://example.test/k.png",
		},
		gift: {
			id: "kicks-gift-1",
			name: "Mega Hype",
			type: "premium",
			tier: 3,
			amount: 5000,
			pinned_time_seconds: 120,
			message: "Lets gooo",
		},
		created_at: "2026-05-20T12:00:00Z",
	};

	it("maps kicks.gifted to all REQ-5 fields", () => {
		const item = normalizeKickWebhookActivity("kicks.gifted", payload);
		expect(item).toBeDefined();
		expect(item!.kind).toBe("kicks_gifted");
		expect(item!.eventType).toBe("kicks.gifted");
		expect(item!.actor.username).toBe("kicksSender");
		expect(item!.amount).toBe(5000);
		expect(item!.title).toBe("Mega Hype");
		expect(item!.giftName).toBe("Mega Hype");
		expect(item!.giftType).toBe("premium");
		expect(item!.giftTier).toBe(3);
		expect(item!.pinnedTimeSeconds).toBe(120);
		expect(item!.message).toBe("Lets gooo");
	});

	it("tolerates missing gift fields (tier/amount undefined, REQ-5 fallback)", () => {
		const sparse = {
			id: "sparse-kicks",
			sender: { username: "sparseUser" },
			gift: { name: "Basic" },
			created_at: "2026-05-20T12:10:00Z",
		};
		const item = normalizeKickWebhookActivity("kicks.gifted", sparse);
		expect(item).toBeDefined();
		expect(item!.giftName).toBe("Basic");
		expect(item!.giftTier).toBeUndefined();
		expect(item!.amount).toBeUndefined();
		expect(item!.pinnedTimeSeconds).toBeUndefined();
		// raw payload preserved for UI fallback (REQ-5 acceptance: "raw payload detayinda eksik alan gosterilir")
		expect(item!.raw).toEqual(sparse);
	});

	it("tier=0 (falsy) is preserved, not coerced to undefined", () => {
		const tierZero = {
			id: "tier-zero",
			sender: { username: "u" },
			gift: { name: "T0", tier: 0, amount: 100 },
		};
		const item = normalizeKickWebhookActivity("kicks.gifted", tierZero);
		expect(item!.giftTier).toBe(0);
		expect(item!.amount).toBe(100);
	});
});

describe("normalizeKickWebhookActivity > unknown event", () => {
	it("returns undefined for unhandled event types", () => {
		expect(
			normalizeKickWebhookActivity("channel.unknown.event", { id: "x" })
		).toBeUndefined();
	});
});
