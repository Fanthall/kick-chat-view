/**
 * Faz 3 — gift-recipient suppression (reducer level).
 *
 * ADIM 1 bulgusu: reducer'da SUB_MESSAGE_ACTION ve celebration (NEW_MESSAGE_ACTION
 * içindeki getSubFromCelebrationMessage) alıcı-başına AYRI bir subscription_new /
 * subscription_renewal activity item'ı eklemeye ÇALIŞIR, ama GIF_SUB_MESSAGE_ACTION
 * ile önceden `markGiftRecipientReducer` ile işaretlenmiş kullanıcılar için bu
 * eklemeler `wasRecentGiftRecipientReducer` guard'ı ile erken return edilip
 * BASTIRILIR (activityList'e hiç item eklenmez). Bu testler bu mevcut davranışı
 * kilitler (regresyon koruması) — Faz 3 kapsamında YENİ bastırma eklenmedi.
 */

import ChatMessageReducers from "../renderer/store/reducer/chatMessage";
import { ChatMessageTypes } from "../renderer/store/types/chatMessages";
import { MessageActions } from "../renderer/store/actions/chatMessage";
import { GiftSubMessage, SubMessage, UserMessage } from "../renderer/util/chatInterface";

const initialState = ChatMessageReducers(undefined, { type: "@@INIT" } as any);

const giftAction = (message: GiftSubMessage): MessageActions =>
	({ type: ChatMessageTypes.GIF_SUB_MESSAGE_ACTION, message } as any);

const subAction = (message: SubMessage): MessageActions =>
	({ type: ChatMessageTypes.SUB_MESSAGE_ACTION, message } as any);

const newMessageAction = (message: UserMessage): MessageActions =>
	({ type: ChatMessageTypes.NEW_MESSAGE_ACTION, message } as any);

describe("chatMessage reducer — gift recipient suppression", () => {
	it("multi-recipient gift produces exactly ONE activity item (gifter), with full recipient list", () => {
		const gift: GiftSubMessage = {
			id: "gift-1",
			channelSlug: "ch1",
			chatroom_id: 1,
			gifter_username: "emirhan_07",
			gifted_usernames: ["kayra", "tuna", "AnchovX", "nmco", "berkay"],
			create_at: 1000,
		};

		const afterGift = ChatMessageReducers(initialState, giftAction(gift));

		expect(afterGift.activityList).toHaveLength(1);
		expect(afterGift.activityList[0].kind).toBe("subscription_gift");
		expect(afterGift.activityList[0].targetUsers?.map((u) => u.username)).toEqual([
			"kayra",
			"tuna",
			"AnchovX",
			"nmco",
			"berkay",
		]);
	});

	it("a SubscriptionEvent that arrives right after for a NAMED gift recipient is suppressed (no second activity item)", () => {
		const gift: GiftSubMessage = {
			id: "gift-2",
			channelSlug: "ch1",
			chatroom_id: 1,
			gifter_username: "Styrande",
			gifted_usernames: ["nmco"],
			create_at: 2000,
		};
		const afterGift = ChatMessageReducers(initialState, giftAction(gift));
		expect(afterGift.activityList).toHaveLength(1);

		// Kick'in bazı sürümlerinde recipient için ayrıca gelen SubscriptionEvent.
		const recipientSub: SubMessage = {
			id: "sub-for-nmco",
			channelSlug: "ch1",
			chatroom_id: 1,
			username: "nmco",
			months: 1,
			create_at: 2001,
		};
		const afterRecipientSub = ChatMessageReducers(afterGift, subAction(recipientSub));

		// Bastırıldı: activityList büyümedi, ikinci bir "nmco abone oldu" item'ı yok.
		expect(afterRecipientSub.activityList).toHaveLength(1);
		expect(
			afterRecipientSub.activityList.some(
				(item) => item.kind !== "subscription_gift" && item.username === "nmco"
			)
		).toBe(false);
	});

	it("an INDEPENDENT new subscriber (never gifted) is NOT suppressed — real event preserved", () => {
		const independentSub: SubMessage = {
			id: "sub-independent",
			channelSlug: "ch1",
			chatroom_id: 1,
			username: "gercek_yeni_abone",
			months: 1,
			create_at: 3000,
		};
		const afterSub = ChatMessageReducers(initialState, subAction(independentSub));

		expect(afterSub.activityList).toHaveLength(1);
		expect(afterSub.activityList[0].kind).toBe("subscription_new");
		expect(afterSub.activityList[0].username).toBe("gercek_yeni_abone");
	});

	it("a celebration (re-sub) chat message for a gift recipient is suppressed, but for a non-recipient it still creates an activity", () => {
		const gift: GiftSubMessage = {
			id: "gift-3",
			channelSlug: "ch1",
			chatroom_id: 1,
			gifter_username: "burak",
			gifted_usernames: ["deniz"],
			create_at: 4000,
		};
		let state = ChatMessageReducers(initialState, giftAction(gift));
		expect(state.activityList).toHaveLength(1);

		const celebrationForRecipient: UserMessage = {
			id: "celeb-deniz",
			channelSlug: "ch1",
			chatroom_id: 1,
			content: "",
			type: "celebration",
			created_at: new Date(4001).toISOString(),
			sender: {
				id: 1,
				username: "deniz",
				slug: "deniz",
				identity: { color: "#000", badges: [{ type: "subscriber", text: "Sub", count: 1 }] },
			},
			metadata: { celebration: { type: "resubscription", total_months: 1 } },
		};
		state = ChatMessageReducers(state, newMessageAction(celebrationForRecipient));
		// Bastırıldı — hâlâ tek activity item (gift).
		expect(state.activityList).toHaveLength(1);

		const celebrationForOther: UserMessage = {
			id: "celeb-other",
			channelSlug: "ch1",
			chatroom_id: 1,
			content: "",
			type: "celebration",
			created_at: new Date(4002).toISOString(),
			sender: {
				id: 2,
				username: "baska_kullanici",
				slug: "baska_kullanici",
				identity: { color: "#000", badges: [{ type: "subscriber", text: "Sub", count: 1 }] },
			},
			metadata: { celebration: { type: "resubscription", total_months: 1 } },
		};
		state = ChatMessageReducers(state, newMessageAction(celebrationForOther));
		// Gerçek olay: yeni activity item eklendi (2'ye çıktı).
		expect(state.activityList).toHaveLength(2);
		expect(
			state.activityList.some((item) => item.username === "baska_kullanici")
		).toBe(true);
	});
});

describe("chatMessage reducer — gift banner merge (Faz H: çift-banner fix)", () => {
	it("aynı gifter'ın summary(count 0) + per-recipient(count 1) event'i TEK banner'da birleşir", () => {
		const summary: GiftSubMessage = {
			id: "gift-sum",
			channelSlug: "chG",
			chatroom_id: 1,
			gifter_username: "fatihvekorkmaz",
			gifted_usernames: [],
			create_at: 5000,
		};
		let state = ChatMessageReducers(initialState, giftAction(summary));
		let banners = state.messageList.filter((m) => m.type === "gift-sub-banner");
		expect(banners).toHaveLength(1);
		expect(banners[0].content).toBe("fatihvekorkmaz abonelik hediye etti");

		const perRecipient: GiftSubMessage = {
			id: "gift-rec",
			channelSlug: "chG",
			chatroom_id: 1,
			gifter_username: "fatihvekorkmaz",
			gifted_usernames: ["vionex58"],
			create_at: 5001,
		};
		state = ChatMessageReducers(state, giftAction(perRecipient));
		banners = state.messageList.filter((m) => m.type === "gift-sub-banner");
		expect(banners).toHaveLength(1); // çift değil, TEK banner
		expect(banners[0].content).toBe(
			"fatihvekorkmaz abonelik hediye etti → vionex58"
		);
		expect(banners[0].giftedUsernames).toEqual(["vionex58"]);
	});

	it("farklı gifter'lar ayrı banner olarak kalır", () => {
		const g1: GiftSubMessage = { id: "gA", channelSlug: "chG2", chatroom_id: 1, gifter_username: "aaa", gifted_usernames: ["x"], create_at: 6000 };
		const g2: GiftSubMessage = { id: "gB", channelSlug: "chG2", chatroom_id: 1, gifter_username: "bbb", gifted_usernames: ["y"], create_at: 6001 };
		let state = ChatMessageReducers(initialState, giftAction(g1));
		state = ChatMessageReducers(state, giftAction(g2));
		const banners = state.messageList.filter((m) => m.type === "gift-sub-banner");
		expect(banners).toHaveLength(2);
	});
});
