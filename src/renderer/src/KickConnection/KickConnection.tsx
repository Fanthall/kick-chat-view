import { Button, Chip, Input } from "@nextui-org/react";
import React, { FunctionComponent, useEffect, useState } from "react";
import { parseKickScopes } from "../../util/kickScopes";
import { maskSensitive } from "../../util/maskSensitive";
import {
	KICK_MODERATION_SCOPES,
	KICK_OFFICIAL_SCOPES,
} from "../../../shared/kickScopes";

const defaultKickRedirectUri = "http://localhost:18291/kick/oauth/callback";
const defaultKickScopes = KICK_OFFICIAL_SCOPES;

const KickConnection: FunctionComponent = () => {
	const [kickClientId, setKickClientId] = useState<string>("");
	const [storedClientId, setStoredClientId] = useState<string>("");
	const [kickClientSecret, setKickClientSecret] = useState<string>("");
	const [kickRedirectUri, setKickRedirectUri] = useState<string>(
		defaultKickRedirectUri
	);
	const [kickAuthStatus, setKickAuthStatus] = useState<any>();
	const [message, setMessage] = useState<string>("");
	const [loading, setLoading] = useState<boolean>(false);

	const loadStatus = () => {
		window.electron.kick.getStoredConfig().then((config) => {
			setStoredClientId(config.clientId || "");
			setKickClientId("");
			setKickRedirectUri(config.redirectUri || defaultKickRedirectUri);
		});
		window.electron.kick.getAuthStatus().then(setKickAuthStatus);
	};

	useEffect(() => {
		document.title = "Kick Connection";
		loadStatus();
	}, []);

	const run = (action: () => Promise<any>, success: string) => {
		setLoading(true);
		setMessage("");
		action()
			.then((status) => {
				setKickAuthStatus(status);
				setMessage(success);
				if (status?.clientId) setStoredClientId(status.clientId);
				if (status?.redirectUri) setKickRedirectUri(status.redirectUri);
				if (success === "Disconnected") setKickClientSecret("");
			})
			.catch((err) => setMessage(err.message || "Kick action failed."))
			.finally(() => setLoading(false));
	};

	const expiresAt = kickAuthStatus?.expiresAt
		? new Date(kickAuthStatus.expiresAt).toLocaleString()
		: "Not connected";
	const grantedScopes = parseKickScopes(
		kickAuthStatus?.grantedScopes,
		kickAuthStatus?.tokenScope,
		kickAuthStatus?.introspection?.data?.scope,
		kickAuthStatus?.introspection?.data?.scopes
	);
	const missingScopes = defaultKickScopes.filter(
		(scope) => !grantedScopes.includes(scope)
	);
	const missingModerationScopes = KICK_MODERATION_SCOPES.filter(
		(scope) => !grantedScopes.includes(scope)
	);
	const requestedScopeText = defaultKickScopes.join(" ");

	return (
		<div className="connection-window-shell">
			<header className="connection-window-header">
				<div>
					<div className="connection-window-title">Kick Connection</div>
					<div className="connection-window-subtitle">
						OAuth app credentials and token status
					</div>
				</div>
				<Chip color={kickAuthStatus?.isConnected ? "success" : "default"}>
					{kickAuthStatus?.isConnected ? "Connected" : "Disconnected"}
				</Chip>
			</header>

			<section className="connection-window-card">
				<div className="connection-status-row">
					<span>Saved Client ID</span>
					<strong>{maskSensitive(storedClientId)}</strong>
				</div>
				<Input
					size="sm"
					label="Client ID"
					value={kickClientId}
					placeholder={
						storedClientId ? "Enter a new Client ID to replace saved value" : ""
					}
					onChange={(event) => setKickClientId(event.target.value)}
				/>
				<Input
					size="sm"
					type="password"
					label="Client Secret"
					value={kickClientSecret}
					onChange={(event) => setKickClientSecret(event.target.value)}
				/>
				<Input
					size="sm"
					label="Redirect URI"
					value={kickRedirectUri}
					onChange={(event) => setKickRedirectUri(event.target.value)}
				/>
				<div className="connection-scope-list">
					{defaultKickScopes.map((scope) => (
						<Chip key={scope} size="sm" variant="flat">
							{scope}
						</Chip>
					))}
				</div>
				<div className="connection-message">
					Requested scope string: {requestedScopeText}
				</div>
			</section>

			<section className="connection-window-card">
				<div className="connection-status-row">
					<span>Expires</span>
					<strong>{expiresAt}</strong>
				</div>
				<div className="connection-status-row">
					<span>Token type</span>
					<strong>{kickAuthStatus?.tokenType || "-"}</strong>
				</div>
				<div className="connection-status-row">
					<span>Token scope</span>
					<strong>{kickAuthStatus?.tokenScope || "-"}</strong>
				</div>
				<div className="connection-status-row">
					<span>Granted scopes</span>
					<strong>{grantedScopes.join(", ") || "unknown"}</strong>
				</div>
				{kickAuthStatus?.isConnected && missingScopes.length > 0 && (
					<div className="connection-status-row">
						<span>Missing scopes</span>
						<strong>{missingScopes.join(", ")}</strong>
					</div>
				)}
				{kickAuthStatus?.isConnected &&
					missingModerationScopes.length > 0 && (
						<div className="connection-message">
							Kick did not grant moderation scopes. If the consent page
							does not show them, check whether your Kick Developer App can
							request moderation permissions.
						</div>
					)}
				<div className="connection-status-row">
					<span>Introspection</span>
					<strong>
						{kickAuthStatus?.introspection?.data?.active === true
							? "active"
							: kickAuthStatus?.introspection?.data?.active === false
							? "inactive"
							: "unknown"}
					</strong>
				</div>
				{message && <div className="connection-message">{message}</div>}
			</section>

			<footer className="connection-actions">
				<Button
					size="sm"
					variant="flat"
					isLoading={loading}
					onPress={() => run(() => window.electron.kick.getAuthStatus(), "Checked")}
				>
					Check
				</Button>
				<Button
					size="sm"
					variant="flat"
					isLoading={loading}
					onPress={() => run(() => window.electron.kick.refresh(), "Refreshed")}
				>
					Refresh
				</Button>
				<Button
					size="sm"
					color="danger"
					variant="flat"
					isLoading={loading}
					onPress={() =>
						run(() => window.electron.kick.disconnect(), "Disconnected")
					}
				>
					Disconnect
				</Button>
				<Button
					size="sm"
					color="primary"
					isLoading={loading}
					onPress={() =>
						run(
							() =>
								window.electron.kick.connect({
									clientId: kickClientId || storedClientId,
									clientSecret: kickClientSecret,
									redirectUri: kickRedirectUri || defaultKickRedirectUri,
									scopes: defaultKickScopes,
								}),
							"Connected"
						)
					}
				>
					Connect
				</Button>
			</footer>
		</div>
	);
};

export default KickConnection;
