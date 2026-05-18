import { shell } from "electron";
import log from "electron-log";
import http from "http";
import { URL } from "url";
import crypto from "crypto";

const KICK_AUTH_BASE_URL = "https://id.kick.com";
export const DEFAULT_KICK_REDIRECT_URI =
	"http://localhost:18291/kick/oauth/callback";
const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

let activeOAuthServer: http.Server | undefined;

const closeActiveOAuthServer = () => {
	if (!activeOAuthServer) return;

	try {
		activeOAuthServer.close();
	} catch (_err) {
		// Closing a stale callback server is best-effort before starting a new flow.
	}
	activeOAuthServer = undefined;
};

export interface KickOAuthStartRequest {
	clientId: string;
	clientSecret: string;
	redirectUri?: string;
	scopes: string[];
}

export interface KickTokenResponse {
	access_token: string;
	token_type: string;
	refresh_token?: string;
	expires_in: number;
	scope?: string;
}

export interface KickOAuthStartResponse extends KickTokenResponse {
	expires_at: number;
}

export interface KickTokenIntrospectionResponse {
	data?: {
		active: boolean;
		client_id?: string;
		token_type?: "app" | "user";
		scope?: string | string[];
		scopes?: string[];
		exp?: number;
	};
	message?: string;
}

const createBase64Url = (input: Buffer) =>
	input
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

const createRandomValue = () => createBase64Url(crypto.randomBytes(32));

const createCodeChallenge = (verifier: string) =>
	createBase64Url(crypto.createHash("sha256").update(verifier).digest());

const postForm = async <T>(
	pathname: string,
	body: Record<string, string>
): Promise<T> => {
	const response = await fetch(`${KICK_AUTH_BASE_URL}${pathname}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams(body).toString(),
	});

	if (!response.ok) {
		const errorBody = await response.text();
		throw new Error(
			`Kick OAuth request failed: ${response.status} ${errorBody}`
		);
	}

	return (await response.json()) as T;
};

const exchangeAuthorizationCode = async (
	request: Required<KickOAuthStartRequest>,
	code: string,
	codeVerifier: string
) => {
	return postForm<KickTokenResponse>("/oauth/token", {
		grant_type: "authorization_code",
		client_id: request.clientId,
		client_secret: request.clientSecret,
		redirect_uri: request.redirectUri,
		code_verifier: codeVerifier,
		code,
	});
};

export const refreshKickToken = async (
	clientId: string,
	clientSecret: string,
	refreshToken: string
): Promise<KickOAuthStartResponse> => {
	const token = await postForm<KickTokenResponse>("/oauth/token", {
		grant_type: "refresh_token",
		client_id: clientId,
		client_secret: clientSecret,
		refresh_token: refreshToken,
	});

	return {
		...token,
		expires_at: Date.now() + token.expires_in * 1000,
	};
};

export const revokeKickToken = async (token: string) => {
	await fetch(
		`${KICK_AUTH_BASE_URL}/oauth/revoke?${new URLSearchParams({
			token,
		}).toString()}`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
		}
	);
};

export const introspectKickToken = async (
	accessToken: string
): Promise<KickTokenIntrospectionResponse> => {
	const response = await fetch(`${KICK_AUTH_BASE_URL}/oauth/token/introspect`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		const errorBody = await response.text();
		throw new Error(
			`Kick token introspection failed: ${response.status} ${errorBody}`
		);
	}

	return (await response.json()) as KickTokenIntrospectionResponse;
};

export const startKickOAuth = async (
	input: KickOAuthStartRequest
): Promise<KickOAuthStartResponse> => {
	const request: Required<KickOAuthStartRequest> = {
		...input,
		redirectUri: input.redirectUri || DEFAULT_KICK_REDIRECT_URI,
	};
	const redirectUrl = new URL(request.redirectUri);
	const state = createRandomValue();
	const codeVerifier = createRandomValue();
	const codeChallenge = createCodeChallenge(codeVerifier);

	closeActiveOAuthServer();

	return new Promise<KickOAuthStartResponse>((resolve, reject) => {
		let isFinished = false;
		let timeoutId: NodeJS.Timeout | undefined;
		const finish = (error?: unknown, token?: KickTokenResponse) => {
			if (isFinished) return;
			isFinished = true;
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			if (activeOAuthServer === server) {
				activeOAuthServer = undefined;
			}
			server.close();
			if (error) {
				reject(error);
				return;
			}
			if (!token) {
				reject(new Error("Kick OAuth did not return a token."));
				return;
			}
			resolve({
				...token,
				expires_at: Date.now() + token.expires_in * 1000,
			});
		};

		const server = http.createServer((req, res) => {
			if (!req.url) return;

			const requestUrl = new URL(req.url, request.redirectUri);
			if (requestUrl.pathname !== redirectUrl.pathname) {
				res.writeHead(404);
				res.end("Not found");
				return;
			}

			const error = requestUrl.searchParams.get("error");
			const errorDescription = requestUrl.searchParams.get(
				"error_description"
			);
			const code = requestUrl.searchParams.get("code");
			const returnedState = requestUrl.searchParams.get("state");

			if (error) {
				res.writeHead(400);
				res.end(
					`Kick authorization failed: ${errorDescription || error}. You can close this window.`
				);
				finish(new Error(errorDescription || error));
				return;
			}

			if (!code || returnedState !== state) {
				res.writeHead(400);
				res.end("Invalid Kick authorization response.");
				finish(new Error("Invalid Kick OAuth callback."));
				return;
			}

			exchangeAuthorizationCode(request, code, codeVerifier)
				.then((token) => {
					res.writeHead(200, { "Content-Type": "text/html" });
					res.end(
						"<html><body><h3>Kick connected.</h3><p>You can close this window.</p></body></html>"
					);
					finish(undefined, token);
				})
				.catch((err) => {
					res.writeHead(500);
					res.end("Kick token exchange failed.");
					finish(err);
				});
		});

		activeOAuthServer = server;
		timeoutId = setTimeout(() => {
			finish(
				new Error(
					"Kick OAuth timed out. Start Connect again and finish the browser approval."
				)
			);
		}, OAUTH_CALLBACK_TIMEOUT_MS);
		server.on("error", finish);
		server.listen(Number(redirectUrl.port), redirectUrl.hostname, () => {
			const authorizeUrl = new URL("/oauth/authorize", KICK_AUTH_BASE_URL);
			authorizeUrl.searchParams.set("response_type", "code");
			authorizeUrl.searchParams.set("client_id", request.clientId);
			authorizeUrl.searchParams.set("redirect_uri", request.redirectUri);
			authorizeUrl.searchParams.set("scope", request.scopes.join(" "));
			authorizeUrl.searchParams.set("code_challenge", codeChallenge);
			authorizeUrl.searchParams.set("code_challenge_method", "S256");
			authorizeUrl.searchParams.set("state", state);
			log.info("Kick OAuth requested scopes:", request.scopes.join(" "));

			shell.openExternal(authorizeUrl.toString()).catch(finish);
		});
	});
};
