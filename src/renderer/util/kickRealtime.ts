/**
 * Kick canli olay soketi — Centrifugo JSON protokolu yardimcilari.
 *
 * 2026-11: Kick'in eski Pusher anahtari `pusher:error 4001` ile reddediliyor.
 * kick.com artik Centrifugo kullaniyor. Olay govdesi (event adi + JSON string
 * `data`) Pusher donemiyle ayni; degisen yalniz zarf:
 *   Pusher:     {"event":"App\\Events\\ChatMessageEvent","data":"{...}","channel":"..."}
 *   Centrifugo: {"push":{"channel":"...","pub":{"data":{"event":"...","data":"{...}"}}}}
 * Bir cerceve birden cok JSON satiri tasiyabilir (satir sonu ile ayrilir).
 * Sunucu ping'i bos nesnedir (`{}`); istemci `{}` ile cevap verir.
 */

export interface KickEvent {
	channel: string;
	event: string;
	data: string;
}

export interface CentrifugoReply {
	id?: number;
	connect?: { client?: string; expires?: boolean; ttl?: number; ping?: number };
	subscribe?: Record<string, unknown>;
	refresh?: { expires?: boolean; ttl?: number };
	error?: { code?: number; message?: string };
	push?: {
		channel?: string;
		pub?: { data?: unknown };
		disconnect?: { code?: number; reason?: string };
	};
}

export const CONNECT_COMMAND_ID = 1;

// Olay → kanal haritasi kick.com'un kendi istemcisinden cikarildi (2026-11-07).
export const kickRealtimeChannels = (channelId: number, chatroomId: number) => [
	// Sohbet, abonelik, mod olaylari, sohbet temizleme, sabitlenen mesaj.
	`chatrooms.${chatroomId}.v2`,
	// KicksGifted, hedef (goal) olaylari, yeni abonelik olaylari.
	`channel_${channelId}`,
	// GiftedSubscriptionsEvent, RewardRedeemedEvent.
	`chatroom_${chatroomId}`,
	// Yalniz host/raid (StreamHostedEvent).
	`chatrooms.${chatroomId}`,
	// Yalniz yayin basladi/bitti.
	`channel.${channelId}`,
];

// Sonradan eklenen iki kanalda yalniz beklenen olaylar islenir: olaylar kanala
// gore degil adina gore islendigi icin baska bir olay (orn. ChatMessageEvent)
// bu kanallardan da gelirse cift islenmesin.
const CHANNEL_EVENT_ALLOWLIST: Array<[RegExp, ReadonlySet<string>]> = [
	[/^chatrooms\.\d+$/, new Set(["App\\Events\\StreamHostedEvent"])],
	[
		/^channel\.\d+$/,
		new Set(["App\\Events\\StreamerIsLive", "App\\Events\\StopStreamBroadcast"]),
	],
];

export const isEventAllowedOnChannel = (event: KickEvent) => {
	const rule = CHANNEL_EVENT_ALLOWLIST.find(([pattern]) =>
		pattern.test(event.channel)
	);
	return !rule || rule[1].has(event.event);
};

// Ilk cerceve: connect + tum abonelikler (id 1 connect, sonrasi subscribe).
export const buildConnectFrame = (token: string, channels: string[]) =>
	[
		JSON.stringify({ connect: { token, name: "js" }, id: CONNECT_COMMAND_ID }),
		...channels.map((channel, index) =>
			JSON.stringify({
				subscribe: { channel },
				id: CONNECT_COMMAND_ID + index + 1,
			})
		),
	].join("\n");

export const buildRefreshFrame = (token: string, id: number) =>
	JSON.stringify({ refresh: { token }, id });

export const parseRealtimeFrames = (raw: unknown): CentrifugoReply[] => {
	if (typeof raw !== "string") return [];
	const replies: CentrifugoReply[] = [];
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			replies.push(JSON.parse(trimmed));
		} catch {
			// Bozuk satir digerlerini dusurmesin.
		}
	}
	return replies;
};

export const isServerPing = (reply: CentrifugoReply) =>
	Object.keys(reply).length === 0;

// Centrifugo push'unu, olay switch'inin bekledigi Pusher sekline cevirir.
export const toKickEvent = (reply: CentrifugoReply): KickEvent | null => {
	let payload = reply.push?.pub?.data as
		| { event?: unknown; data?: unknown }
		| string
		| undefined;
	if (typeof payload === "string") {
		try {
			payload = JSON.parse(payload);
		} catch {
			return null;
		}
	}
	if (!payload || typeof payload !== "object") return null;
	if (typeof payload.event !== "string" || !payload.event) return null;
	const data =
		typeof payload.data === "string"
			? payload.data
			: JSON.stringify(payload.data ?? {});
	return { channel: reply.push?.channel ?? "", event: payload.event, data };
};

// Jeton suresi dolmadan bir dakika once yenilenir; cok kisa ttl'de 10 sn taban.
export const tokenRefreshDelayMs = (ttlSeconds: number) =>
	Math.max(ttlSeconds - 60, 10) * 1000;
