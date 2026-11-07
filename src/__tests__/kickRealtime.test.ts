/**
 * Kick canli soketi (Centrifugo) protokol yardimcilari.
 * Cerceve ornekleri 2026-11-07'de kick.com'un kendi soketinden alinan
 * cercevelerin sadelestirilmis halidir.
 */
import {
	buildConnectFrame,
	buildRefreshFrame,
	isEventAllowedOnChannel,
	isServerPing,
	kickRealtimeChannels,
	parseRealtimeFrames,
	toKickEvent,
	tokenRefreshDelayMs,
} from "../renderer/util/kickRealtime";

describe("kickRealtime > connect frame", () => {
	it("connect id 1, abonelikler 2'den baslar, satir sonuyla ayrilir", () => {
		const frame = buildConnectFrame("tok", kickRealtimeChannels(10, 20));
		const lines = frame.split("\n").map((line) => JSON.parse(line));
		expect(lines[0]).toEqual({ connect: { token: "tok", name: "js" }, id: 1 });
		expect(lines.slice(1)).toEqual([
			{ subscribe: { channel: "chatrooms.20.v2" }, id: 2 },
			{ subscribe: { channel: "channel_10" }, id: 3 },
			{ subscribe: { channel: "chatroom_20" }, id: 4 },
			{ subscribe: { channel: "chatrooms.20" }, id: 5 },
			{ subscribe: { channel: "channel.10" }, id: 6 },
		]);
	});

	it("refresh cercevesi jetonu ve id'yi tasir", () => {
		expect(JSON.parse(buildRefreshFrame("new", 9))).toEqual({
			refresh: { token: "new" },
			id: 9,
		});
	});
});

describe("kickRealtime > frame parse", () => {
	it("cok satirli cerceveyi ayirir, bozuk satiri atlar", () => {
		const replies = parseRealtimeFrames(
			'{"id":1,"connect":{"ping":25,"expires":true,"ttl":2699}}\n{"id":2,"subscribe":{}}\nnot-json\n'
		);
		expect(replies).toHaveLength(2);
		expect(replies[0].connect?.ttl).toBe(2699);
		expect(replies[1].subscribe).toEqual({});
	});

	it("sunucu ping'i bos nesnedir", () => {
		const [ping, other] = parseRealtimeFrames('{}\n{"id":2,"subscribe":{}}');
		expect(isServerPing(ping)).toBe(true);
		expect(isServerPing(other)).toBe(false);
	});

	it("string olmayan girdi bos liste doner", () => {
		expect(parseRealtimeFrames(undefined)).toEqual([]);
	});
});

describe("kickRealtime > push → Kick olayi", () => {
	it("Centrifugo push'unu eski Pusher sekline cevirir (data string kalir)", () => {
		const message = { id: "m1", content: "selam", type: "message" };
		const [reply] = parseRealtimeFrames(
			JSON.stringify({
				push: {
					channel: "chatrooms.20.v2",
					pub: {
						data: {
							event: "App\\Events\\ChatMessageEvent",
							data: JSON.stringify(message),
						},
					},
				},
			})
		);
		const event = toKickEvent(reply);
		expect(event).toEqual({
			channel: "chatrooms.20.v2",
			event: "App\\Events\\ChatMessageEvent",
			data: JSON.stringify(message),
		});
		expect(JSON.parse(event!.data)).toEqual(message);
	});

	it("data nesne gelirse string'e cevrilir", () => {
		const event = toKickEvent({
			push: { channel: "channel_10", pub: { data: { event: "KicksGifted", data: { amount: 5 } } } },
		});
		expect(event?.data).toBe('{"amount":5}');
	});

	it("pub.data string JSON gelirse acilir", () => {
		const event = toKickEvent({
			push: {
				channel: "chatroom_20",
				pub: { data: JSON.stringify({ event: "RewardRedeemedEvent", data: "{}" }) },
			},
		});
		expect(event?.event).toBe("RewardRedeemedEvent");
	});

	it("olay adi yoksa ya da push degilse null", () => {
		expect(toKickEvent({ id: 2, subscribe: {} })).toBeNull();
		expect(toKickEvent({ push: { channel: "x", pub: { data: { data: "{}" } } } })).toBeNull();
		expect(toKickEvent({ push: { channel: "x", pub: { data: "not-json" } } })).toBeNull();
	});
});

describe("kickRealtime > kanal suzgeci", () => {
	const ev = (channel: string, event: string) => ({ channel, event, data: "{}" });

	it("eski adli sohbet kanalinda yalniz host olayi islenir", () => {
		expect(isEventAllowedOnChannel(ev("chatrooms.20", "App\\Events\\StreamHostedEvent"))).toBe(true);
		expect(isEventAllowedOnChannel(ev("chatrooms.20", "App\\Events\\ChatMessageEvent"))).toBe(false);
	});

	it("channel.<id> kanalinda yalniz yayin basladi/bitti islenir", () => {
		expect(isEventAllowedOnChannel(ev("channel.10", "App\\Events\\StreamerIsLive"))).toBe(true);
		expect(isEventAllowedOnChannel(ev("channel.10", "App\\Events\\StopStreamBroadcast"))).toBe(true);
		expect(isEventAllowedOnChannel(ev("channel.10", "App\\Events\\ChatMoveToSupportedChannelEvent"))).toBe(false);
	});

	it("asil kanallarda her olay serbest", () => {
		expect(isEventAllowedOnChannel(ev("chatrooms.20.v2", "App\\Events\\ChatMessageEvent"))).toBe(true);
		expect(isEventAllowedOnChannel(ev("channel_10", "GoalAchievedEvent"))).toBe(true);
		expect(isEventAllowedOnChannel(ev("chatroom_20", "RewardRedeemedEvent"))).toBe(true);
	});
});

describe("kickRealtime > token refresh zamani", () => {
	it("ttl'den bir dakika once, en az 10 sn", () => {
		expect(tokenRefreshDelayMs(2699)).toBe(2639_000);
		expect(tokenRefreshDelayMs(30)).toBe(10_000);
	});
});
