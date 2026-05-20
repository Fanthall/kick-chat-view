import { app } from "electron";
import fs from "fs";
import path from "path";
import {
	DEFAULT_KICK_REDIRECT_URI,
	KickOAuthStartResponse,
	KickTokenIntrospectionResponse,
	introspectKickToken,
	refreshKickToken,
	revokeKickToken,
	startKickOAuth,
} from "./kickOAuth";
import { KICK_OFFICIAL_SCOPES } from "../shared/kickScopes";

const KICK_API_BASE_URL = "https://api.kick.com";
const KICK_CONFIG_FILE = "kick-oauth.json";

export const DEFAULT_KICK_SCOPES = KICK_OFFICIAL_SCOPES;

export interface KickStoredConfig {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	scopes: string[];
	token?: KickOAuthStartResponse;
}

export interface KickConnectRequest {
	clientId: string;
	clientSecret: string;
	redirectUri?: string;
	scopes?: string[];
}

export interface KickAuthStatus {
	isConfigured: boolean;
	isConnected: boolean;
	clientId?: string;
	redirectUri: string;
	scopes: string[];
	grantedScopes: string[];
	missingScopes: string[];
	expiresAt?: number;
	tokenType?: string;
	tokenScope?: string;
	introspection?: KickTokenIntrospectionResponse;
}

export interface KickApiResponse<T> {
	data?: T;
	message?: string;
}

export interface KickUser {
	email?: string;
	name: string;
	profile_picture?: string;
	user_id: number;
}

export interface KickChannel {
	active_subscribers_count?: number;
	banner_picture?: string;
	broadcaster_user_id: number;
	canceled_subscribers_count?: number;
	category?: {
		id: number;
		name: string;
		thumbnail?: string;
	};
	channel_description?: string;
	slug: string;
	stream?: {
		custom_tags?: string[];
		is_live: boolean;
		is_mature?: boolean;
		key?: string;
		language?: string;
		start_time?: string;
		thumbnail?: string;
		url?: string;
		viewer_count?: number;
	};
	stream_title?: string;
}

export interface KickLivestream {
	broadcaster_user_id: number;
	category?: {
		id: number;
		name: string;
		thumbnail?: string;
	};
	channel_id?: number;
	custom_tags?: string[];
	has_mature_content?: boolean;
	language?: string;
	profile_picture?: string;
	slug: string;
	started_at?: string;
	stream_title?: string;
	thumbnail?: string;
	viewer_count?: number;
}

export interface KickSendChatMessageRequest {
	broadcaster_user_id?: number;
	content: string;
	reply_to_message_id?: string;
	type: "user" | "bot";
}

export interface KickPatchChannelRequest {
	stream_title?: string;
	category_id?: number;
	custom_tags?: string[];
}

export interface KickCategory {
	id: number;
	name: string;
	tags?: string[];
	thumbnail?: string;
	viewer_count?: number;
}

export interface KickCategoriesPage {
	data: KickCategory[];
	next_cursor?: string;
}

export interface KickModerationBanRequest {
	broadcaster_user_id: number;
	user_id: number;
	reason?: string;
	duration?: number;
}

export interface KickModerationUnbanRequest {
	broadcaster_user_id: number;
	user_id: number;
}

export interface KickEventSubscriptionRequest {
	broadcaster_user_id?: number;
	events: Array<{
		name: string;
		version?: number;
	}>;
	method?: "webhook";
}

export interface KickChannelReward {
	background_color?: string;
	cost: number;
	description?: string;
	id: string;
	is_enabled: boolean;
	is_paused?: boolean;
	is_user_input_required?: boolean;
	should_redemptions_skip_request_queue?: boolean;
	title: string;
}

export interface KickRewardRedemption {
	id: string;
	reward_id?: string;
	status: "pending" | "accepted" | "rejected";
	redeemed_at?: string;
	user?: {
		user_id?: number;
		username?: string;
		channel_slug?: string;
		profile_picture?: string;
	};
	reward?: KickChannelReward;
	user_input?: string;
}

export interface KickRewardRedemptionsQuery {
	reward_id?: string;
	status?: "pending" | "accepted" | "rejected";
	id?: string[];
	cursor?: string;
}

export interface KickKicksLeaderboardEntry {
	gifted_amount: number;
	rank: number;
	user_id: number;
	username: string;
}

export interface KickKicksLeaderboard {
	lifetime?: KickKicksLeaderboardEntry[];
	month?: KickKicksLeaderboardEntry[];
	week?: KickKicksLeaderboardEntry[];
}

const getConfigPath = () => path.join(app.getPath("userData"), KICK_CONFIG_FILE);

const readConfig = (): KickStoredConfig | undefined => {
	const configPath = getConfigPath();
	if (!fs.existsSync(configPath)) return undefined;

	return JSON.parse(fs.readFileSync(configPath, "utf-8")) as KickStoredConfig;
};

const writeConfig = (config: KickStoredConfig) => {
	fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
	fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
};

const deleteConfig = () => {
	const configPath = getConfigPath();
	if (fs.existsSync(configPath)) {
		fs.unlinkSync(configPath);
	}
};

const parseKickScopes = (...values: unknown[]) => {
	const scopes = new Set<string>();
	const addScope = (value: unknown) => {
		if (Array.isArray(value)) {
			value.forEach(addScope);
			return;
		}

		if (typeof value !== "string") {
			return;
		}

		value
			.split(/[\s,]+/)
			.map((scope) => scope.trim())
			.filter(Boolean)
			.forEach((scope) => scopes.add(scope));
	};

	values.forEach(addScope);

	return Array.from(scopes);
};

const sanitizeConfig = (config?: KickStoredConfig): KickAuthStatus => ({
	isConfigured: !!config?.clientId,
	isConnected: !!config?.token?.access_token,
	clientId: config?.clientId,
	redirectUri: config?.redirectUri || DEFAULT_KICK_REDIRECT_URI,
	scopes: config?.scopes || DEFAULT_KICK_SCOPES,
	grantedScopes: parseKickScopes(config?.token?.scope),
	missingScopes: (config?.scopes || DEFAULT_KICK_SCOPES).filter(
		(scope) => !parseKickScopes(config?.token?.scope).includes(scope)
	),
	expiresAt: config?.token?.expires_at,
	tokenType: config?.token?.token_type,
	tokenScope: config?.token?.scope,
});

const normalizeConnectRequest = (
	request: KickConnectRequest
): Required<KickConnectRequest> => {
	const requestedScopes = parseKickScopes(request.scopes);
	const scopes = Array.from(
		new Set([...DEFAULT_KICK_SCOPES, ...requestedScopes])
	);

	return {
		clientId: request.clientId.trim(),
		clientSecret: request.clientSecret.trim(),
		redirectUri: request.redirectUri?.trim() || DEFAULT_KICK_REDIRECT_URI,
		scopes,
	};
};

const assertConfig = () => {
	const config = readConfig();
	if (!config?.clientId || !config.clientSecret) {
		throw new Error("Kick OAuth is not configured.");
	}

	return config;
};

const getValidAccessToken = async () => {
	const config = assertConfig();
	const token = config.token;
	if (!token?.access_token) {
		throw new Error("Kick OAuth is not connected.");
	}

	const expiresAt = token.expires_at || 0;
	if (Date.now() < expiresAt - 60000) {
		return token.access_token;
	}

	if (!token.refresh_token) {
		throw new Error("Kick OAuth token expired and no refresh token exists.");
	}

	const refreshedToken = await refreshKickToken(
		config.clientId,
		config.clientSecret,
		token.refresh_token
	);
	const nextConfig = { ...config, token: refreshedToken };
	writeConfig(nextConfig);

	return refreshedToken.access_token;
};

const kickApiRequest = async <T>(
	pathname: string,
	init: RequestInit = {}
): Promise<T> => {
	const accessToken = await getValidAccessToken();
	const response = await fetch(`${KICK_API_BASE_URL}${pathname}`, {
		...init,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: "*/*",
			...(init.body ? { "Content-Type": "application/json" } : {}),
			...init.headers,
		},
	});

	if (!response.ok) {
		const errorBody = await response.text();
		if (response.status === 401) {
			throw new Error(
				`Kick API request failed: 401 Unauthorized. Reconnect Kick OAuth and make sure required scopes are granted. ${errorBody}`
			);
		}
		throw new Error(`Kick API request failed: ${response.status} ${errorBody}`);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
};

export const getKickAuthStatus = async (): Promise<KickAuthStatus> => {
	const config = readConfig();
	const status = sanitizeConfig(config);
	if (!config?.token?.access_token) {
		return status;
	}

	try {
		const introspection = await introspectKickToken(config.token.access_token);
		const grantedScopes = parseKickScopes(
			status.grantedScopes,
			introspection.data?.scope,
			introspection.data?.scopes
		);
		return {
			...status,
			grantedScopes,
			missingScopes: status.scopes.filter(
				(scope) => !grantedScopes.includes(scope)
			),
			introspection,
		};
	} catch (_err) {
		return status;
	}
};

export const connectKick = async (
	request: KickConnectRequest
): Promise<KickAuthStatus> => {
	const normalized = normalizeConnectRequest(request);
	if (!normalized.clientId || !normalized.clientSecret) {
		throw new Error("Kick Client ID and Client Secret are required.");
	}

	const token = await startKickOAuth(normalized);
	writeConfig({ ...normalized, token });

	return getKickAuthStatus();
};

export const disconnectKick = async (): Promise<KickAuthStatus> => {
	const config = readConfig();
	if (config?.token?.access_token) {
		await revokeKickToken(config.token.access_token);
	}
	deleteConfig();

	return getKickAuthStatus();
};

export const refreshKick = async (): Promise<KickAuthStatus> => {
	const config = assertConfig();
	if (!config.token?.refresh_token) {
		throw new Error("Kick refresh token is missing.");
	}

	const token = await refreshKickToken(
		config.clientId,
		config.clientSecret,
		config.token.refresh_token
	);
	writeConfig({ ...config, token });

	return getKickAuthStatus();
};

export const getKickStoredConfig = (): KickConnectRequest => {
	const config = readConfig();
	return {
		clientId: config?.clientId || "",
		clientSecret: "",
		redirectUri: config?.redirectUri || DEFAULT_KICK_REDIRECT_URI,
		scopes: config?.scopes || DEFAULT_KICK_SCOPES,
	};
};

export const getKickUsers = (ids?: number[]) => {
	const query = new URLSearchParams();
	ids?.forEach((id) => query.append("id", String(id)));
	const suffix = query.toString() ? `?${query.toString()}` : "";
	return kickApiRequest<KickApiResponse<KickUser[]>>(
		`/public/v1/users${suffix}`
	);
};

export const getKickOwnChannels = () => {
	return kickApiRequest<KickApiResponse<KickChannel[]>>("/public/v1/channels");
};

export const getKickChannelBySlug = (slug: string) => {
	const query = new URLSearchParams();
	query.append("slug", slug);
	return kickApiRequest<KickApiResponse<KickChannel[]>>(
		`/public/v1/channels?${query.toString()}`
	);
};

export const getKickLivestreams = (broadcasterUserIds?: number[]) => {
	const query = new URLSearchParams();
	broadcasterUserIds?.forEach((id) =>
		query.append("broadcaster_user_id", String(id))
	);
	const suffix = query.toString() ? `?${query.toString()}` : "";
	return kickApiRequest<KickApiResponse<KickLivestream[]>>(
		`/public/v1/livestreams${suffix}`
	);
};

export const patchKickChannel = (request: KickPatchChannelRequest) => {
	const body: KickPatchChannelRequest = {};
	if (typeof request.stream_title === "string" && request.stream_title.trim()) {
		body.stream_title = request.stream_title.trim();
	}
	if (typeof request.category_id === "number" && request.category_id > 0) {
		body.category_id = request.category_id;
	}
	if (Array.isArray(request.custom_tags)) {
		body.custom_tags = request.custom_tags.slice(0, 10);
	}
	if (Object.keys(body).length === 0) {
		throw new Error("PATCH /channels needs at least one of stream_title, category_id, custom_tags.");
	}
	return kickApiRequest<KickApiResponse<KickChannel>>("/public/v1/channels", {
		method: "PATCH",
		body: JSON.stringify(body),
	});
};

export const searchKickCategories = (
	query: string,
	limit = 10
): Promise<KickApiResponse<KickCategory[]>> => {
	const trimmed = query.trim();
	if (!trimmed) {
		return Promise.resolve({ data: [] });
	}
	const qs = new URLSearchParams();
	qs.append("name", trimmed);
	qs.append("limit", String(Math.max(1, Math.min(limit, 100))));
	return kickApiRequest<KickApiResponse<KickCategory[]>>(
		`/public/v2/categories?${qs.toString()}`
	);
};

export const getKickCategoryById = (id: number) => {
	return kickApiRequest<KickApiResponse<KickCategory>>(
		`/public/v1/categories/${encodeURIComponent(String(id))}`
	);
};

export const sendKickChatMessage = (request: KickSendChatMessageRequest) => {
	return kickApiRequest<
		KickApiResponse<{ is_sent: boolean; message_id: string }>
	>("/public/v1/chat", {
		method: "POST",
		body: JSON.stringify(request),
	});
};

export const deleteKickChatMessage = (messageId: string) => {
	return kickApiRequest<void>(`/public/v1/chat/${messageId}`, {
		method: "DELETE",
	});
};

export const banKickUser = (request: KickModerationBanRequest) => {
	return kickApiRequest<KickApiResponse<Record<string, unknown>>>(
		"/public/v1/moderation/bans",
		{
			method: "POST",
			body: JSON.stringify(request),
		}
	);
};

export const timeoutKickUser = (request: KickModerationBanRequest) => {
	if (!request.duration) {
		throw new Error("Kick timeout requires duration in seconds.");
	}

	// Sprint 20 fix: Kick'in public moderation/bans endpoint'i `duration`
	// alanini DAKIKA olarak yorumluyor. Tum cagiranlar UI'da saniye
	// gonderiyor (insanin kafasinda saniye), burada tek noktada dakikaya
	// ceviriyoruz. Math.max(1, ...) garantisi: 1sn altinda istek bile en
	// az 1 dakika olarak gider (Kick zaten daha kisa surede reddediyordu).
	const minutes = Math.max(1, Math.ceil(request.duration / 60));
	return banKickUser({ ...request, duration: minutes });
};

export const unbanKickUser = (request: KickModerationUnbanRequest) => {
	return kickApiRequest<KickApiResponse<Record<string, unknown>>>(
		"/public/v1/moderation/bans",
		{
			method: "DELETE",
			body: JSON.stringify(request),
		}
	);
};

export const listKickEventSubscriptions = (broadcasterUserId?: number) => {
	const query = new URLSearchParams();
	if (broadcasterUserId) {
		query.append("broadcaster_user_id", String(broadcasterUserId));
	}
	const suffix = query.toString() ? `?${query.toString()}` : "";
	return kickApiRequest<KickApiResponse<unknown[]>>(
		`/public/v1/events/subscriptions${suffix}`
	);
};

export const subscribeKickEvents = (request: KickEventSubscriptionRequest) => {
	return kickApiRequest<KickApiResponse<unknown[]>>(
		"/public/v1/events/subscriptions",
		{
			method: "POST",
			body: JSON.stringify({
				...request,
				method: request.method || "webhook",
			}),
		}
	);
};

export const deleteKickEventSubscriptions = (ids: string[]) => {
	const query = new URLSearchParams();
	ids.forEach((id) => query.append("id", id));
	return kickApiRequest<void>(
		`/public/v1/events/subscriptions?${query.toString()}`,
		{
			method: "DELETE",
		}
	);
};

export const getKickChannelRewards = () => {
	return kickApiRequest<KickApiResponse<KickChannelReward[]>>(
		"/public/v1/channels/rewards"
	);
};

export const getKickChannelRewardRedemptions = (
	request: KickRewardRedemptionsQuery = {}
) => {
	const query = new URLSearchParams();
	if (request.reward_id) {
		query.append("reward_id", request.reward_id);
	}
	if (request.status) {
		query.append("status", request.status);
	}
	request.id?.forEach((id) => query.append("id", id));
	if (request.cursor) {
		query.append("cursor", request.cursor);
	}
	const suffix = query.toString() ? `?${query.toString()}` : "";
	return kickApiRequest<
		KickApiResponse<KickRewardRedemption[]> & {
			pagination?: { cursor?: string };
		}
	>(`/public/v1/channels/rewards/redemptions${suffix}`);
};

export const acceptKickChannelRewardRedemptions = (ids: string[]) => {
	return kickApiRequest<KickApiResponse<unknown[]>>(
		"/public/v1/channels/rewards/redemptions/accept",
		{
			method: "POST",
			body: JSON.stringify({ ids }),
		}
	);
};

export const rejectKickChannelRewardRedemptions = (ids: string[]) => {
	return kickApiRequest<KickApiResponse<unknown[]>>(
		"/public/v1/channels/rewards/redemptions/reject",
		{
			method: "POST",
			body: JSON.stringify({ ids }),
		}
	);
};

export const getKickKicksLeaderboard = (top = 10) => {
	const query = new URLSearchParams();
	query.append("top", String(Math.max(1, Math.min(top, 100))));
	return kickApiRequest<KickApiResponse<KickKicksLeaderboard>>(
		`/public/v1/kicks/leaderboard?${query.toString()}`
	);
};
