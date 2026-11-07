/**
 * Kick canli olaylarindan gelen yeni reducer eylemleri: sohbet temizleme
 * (ChatroomClearEvent) ve sabitlenen mesaj.
 */
import ChatMessageReducers from "../renderer/store/reducer/chatMessage";
import { clearChannelMessages, setPinnedMessage } from "../renderer/store/actions/chatMessage";
import { UserMessage } from "../renderer/util/chatInterface";
import { enrichLegacySubscriptionPayload } from "../renderer/util/legacyPusherBridge";

const initialState = ChatMessageReducers(undefined, { type: "@@INIT" } as any);

const msg = (id: string, channelSlug?: string): UserMessage => ({
	id,
	channelSlug,
	chatroom_id: 1,
	content: id,
	type: "message",
	created_at: "2026-11-07T17:00:00.000Z",
	sender: { id: 1, username: "u", slug: "u" },
});

describe("chatMessage reducer — sohbet temizleme", () => {
	it("yalniz o kanalin mesajlarini siler, tek bir temizlendi satiri ekler", () => {
		let state = initialState;
		for (const m of [msg("a1", "a"), msg("b1", "b"), msg("a2", "a"), msg("legacy")]) {
			state = ChatMessageReducers(state, { type: "NEW_MESSAGE_ACTION", message: m } as any);
		}
		const after = ChatMessageReducers(state, clearChannelMessages("a", 5000));
		const ids = after.messageList.map((m) => m.id);
		expect(ids).toEqual(["b1", "legacy", "chat-cleared-a-5000"]);
		const notice = after.messageList[after.messageList.length - 1];
		expect(notice.type).toBe("chat-cleared");
		expect(notice.channelSlug).toBe("a");
	});
});

describe("chatMessage reducer — yeni abone (NewActivityFeedEvent yolu)", () => {
	it("months 1 ile gelen abonelik 'subscription_new' aktivitesi olur", () => {
		const sub = enrichLegacySubscriptionPayload({
			chatroom_id: 0,
			username: "Canyurruk",
			months: 1,
			channelSlug: "rraenee",
			create_at: 1794073134476,
		});
		const after = ChatMessageReducers(initialState, { type: "SUB_MESSAGE_ACTION", message: sub } as any);
		const activity = after.activityList.find((a) => a.actor?.username === "Canyurruk");
		expect(activity?.kind).toBe("subscription_new");
		expect(activity?.channelSlug).toBe("rraenee");
	});
});

describe("chatMessage reducer — sabitlenen mesaj", () => {
	it("kanal basina tutulur ve null ile kaldirilir", () => {
		const pinned = { message: msg("p1", "a"), pinnedBy: "mod", finishAt: 10 };
		const withPin = ChatMessageReducers(initialState, setPinnedMessage("a", pinned));
		expect(withPin.pinnedByChannel.a).toEqual(pinned);
		expect(withPin.pinnedByChannel.b).toBeUndefined();
		const cleared = ChatMessageReducers(withPin, setPinnedMessage("a", null));
		expect(cleared.pinnedByChannel.a).toBeNull();
	});
});
