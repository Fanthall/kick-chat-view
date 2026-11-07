import { net } from "electron";
import { randomUUID } from "crypto";
import type { KickRealtimeConnection } from "../shared/kickRealtime";

// kick.com'un web istemcisinin kullandigi uc noktalar (belgesiz). `net.fetch`
// Chromium ag katmanini kullanir: CORS'a takilmaz, Cloudflare'in Node fetch'i
// reddetmesine de takilmaz.
const KICK_WEB_API_URL = "https://web.kick.com/api";

interface KickRealtimeNegotiation {
	data?: {
		connections?: Array<{
			provider?: string;
			credentials?: { url?: string };
		}>;
	};
}

interface KickRealtimeAuth {
	data?: { token?: string };
}

const postKickWeb = async <T>(pathname: string, body: unknown): Promise<T> => {
	const response = await net.fetch(`${KICK_WEB_API_URL}${pathname}`, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
			"X-App-Platform": "web",
		},
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const errorBody = (await response.text()).slice(0, 300);
		throw new Error(
			`Kick realtime request failed: ${response.status} ${pathname} ${errorBody}`
		);
	}
	return (await response.json()) as T;
};

export const getKickRealtimeToken = async (clientId: string) => {
	const auth = await postKickWeb<KickRealtimeAuth>(
		"/v1/realtime/auth/connection",
		{ client_id: clientId }
	);
	const token = auth.data?.token;
	if (!token) {
		throw new Error("Kick realtime auth returned no token");
	}
	return token;
};

// Kanalin sohbet soketi icin adres + jeton. Yalniz Centrifugo kabul edilir;
// Kick baska bir saglayici donerse hata verilir (sessizce bozuk baglanti yerine).
export const getKickRealtimeConnection = async (
	channelId: number
): Promise<KickRealtimeConnection> => {
	const clientId = randomUUID();
	const negotiation = await postKickWeb<KickRealtimeNegotiation>(
		`/v1/realtime/channels/${channelId}/chat/connection`,
		{
			client: { id: clientId, type: "web" },
			capabilities: { accepted_providers: [{ provider: "centrifugo" }] },
		}
	);
	const url = negotiation.data?.connections?.find(
		(connection) =>
			connection.provider === "centrifugo" && connection.credentials?.url
	)?.credentials?.url;
	if (!url) {
		throw new Error(
			`Kick realtime offered no centrifugo connection: ${JSON.stringify(
				negotiation.data ?? {}
			).slice(0, 300)}`
		);
	}
	const token = await getKickRealtimeToken(clientId);
	return { url, token, clientId };
};
