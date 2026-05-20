/**
 * Sprint 6a — SettingsModern.tsx
 *
 * Side-nav IA: Channel / Account / Permissions / Moderation / Emotes / Advanced.
 * Design reference: workspace/prds/chat-view/modern-usage-design/Designs/settings.jsx
 * PRD REQ-7 (P0, fully binding).
 */

import React, {
	FunctionComponent,
	useEffect,
	useMemo,
	useState,
} from "react";
import { toast } from "react-toastify";
import Icon, { IconName } from "../Component/Icon/Icon";
import { useTranslation } from "../../util/i18n";
import {
	useFanthalDispatch,
	useFanthalSelector,
} from "../../store/hooks/hooks";
import { chatListener } from "../../util/chatConnection";
import {
	ChatViewChannel,
	addChannel,
	getActiveChannelSlug,
	getChannelList,
	removeChannel,
	setActiveChannelSlug,
	updateChannelAutoConnect,
} from "../../util/channelSettings";
import { parseKickScopes } from "../../util/kickScopes";
import { maskSensitive } from "../../util/maskSensitive";
import {
	DEFAULT_TIMEOUT_SECONDS_STORAGE_KEY,
	getDefaultTimeoutSeconds,
	setDefaultTimeoutSeconds,
} from "../../util/chatCommands";
import {
	DEFAULT_MOD_CHECK_MESSAGE,
	getModCheckMessage,
	setModCheckMessage,
} from "../../util/modDetectionSettings";
import {
	getSuspendedUsers,
	removeSuspendedUser,
	getBlockedEmotes,
	removeBlockedEmote,
} from "../../util/localModerationStorage";
import { getFavoriteEmotes } from "../../util/emoteFavorites";

// ─── Constants ────────────────────────────────────────────────────────────────

const SCOPE_AFFECTS: Record<string, string> = {
	"chat:write": "Send messages in chat",
	"moderation:ban": "Ban / unban users",
	"moderation:chat_message:manage": "Delete chat messages",
	"channel:rewards:read": "View channel point rewards",
	"channel:rewards:write": "Accept/reject reward redemptions",
	"channel:write": "Edit stream title and category",
	"kicks:read": "View KICKs leaderboard",
	"events:subscribe": "Subscribe to webhook events",
	"user:read": "View OAuth user info",
	"channel:read": "View channel info",
	"streamkey:read": "Read stream key",
};

const EXPECTED_SCOPES = Object.keys(SCOPE_AFFECTS);

const ADVANCED_TOPICS = [
	{ topic: "chat.message.v1",         status: "ok" },
	{ topic: "chat.deleted.v1",         status: "ok" },
	{ topic: "channel.subscription.v2", status: "ok" },
	{ topic: "channel.gift.v2",         status: "ok" },
	{ topic: "channel.kicks.v1",        status: "off" },
	{ topic: "channel.reward.v1",       status: "ok" },
] as const;

// ─── Nav definition ───────────────────────────────────────────────────────────

interface NavItem {
	id: SectionId;
	label: string;
	icon: IconName;
}

type SectionId = "channel" | "account" | "permissions" | "moderation" | "emotes" | "advanced";

const SETTINGS_NAV: NavItem[] = [
	{ id: "channel",     label: "settings.nav.channel",     icon: "code" },
	{ id: "account",     label: "settings.nav.account",     icon: "user" },
	{ id: "permissions", label: "settings.nav.permissions", icon: "shield" },
	{ id: "moderation",  label: "settings.nav.moderation",  icon: "ban" },
	{ id: "emotes",      label: "settings.nav.emotes",      icon: "smile" },
	{ id: "advanced",    label: "settings.nav.advanced",    icon: "settings" },
];

// ─── Shared widgets ───────────────────────────────────────────────────────────

interface ToggleProps {
	on: boolean;
	onChange: (v: boolean) => void;
}

const Toggle: FunctionComponent<ToggleProps> = ({ on, onChange }) => {
	return (
		<button
			role="switch"
			aria-checked={on}
			className="set-toggle"
			onClick={() => onChange(!on)}
			type="button"
		>
			<span className="set-toggle-thumb" />
		</button>
	);
};

interface StepperProps {
	value: number;
	unit: string;
	min?: number;
	step?: number;
	onChange: (v: number) => void;
}

const Stepper: FunctionComponent<StepperProps> = ({
	value,
	unit,
	min = 0,
	step = 1,
	onChange,
}) => {
	return (
		<div className="set-stepper">
			<button
				type="button"
				onClick={() => onChange(Math.max(min, value - step))}
				aria-label={`Decrease ${unit}`}
			>
				−
			</button>
			<span className="set-stepper-val">{value}</span>
			<button
				type="button"
				onClick={() => onChange(value + step)}
				aria-label={`Increase ${unit}`}
			>
				+
			</button>
			<span className="set-stepper-unit">{unit}</span>
		</div>
	);
};

// ─── Section: Channel ─────────────────────────────────────────────────────────

interface ChannelSectionProps {
	kickAuthStatus: any;
}

const ChannelSection: FunctionComponent<ChannelSectionProps> = ({ kickAuthStatus }) => {
	const dispatch = useFanthalDispatch();
	const messages = useFanthalSelector((state) => state.messages);
	const [channels, setChannels] = useState<ChatViewChannel[]>(() => getChannelList());
	const [newChannelInput, setNewChannelInput] = useState("");
	const [ownChannels, setOwnChannels] = useState<any[]>([]);
	const activeSlug = getActiveChannelSlug();

	// Fix 10: get category from streamMeta
	const getChannelMeta = (slug: string): string => {
		const meta = messages.streamMetaByChannel?.[slug];
		const cat = meta?.category?.name || "Just Chatting";
		return cat;
	};

	useEffect(() => {
		if (!kickAuthStatus?.isConnected) return;
		window.electron.kick
			.getOwnChannels()
			.then((r: any) => setOwnChannels(r?.data || []))
			.catch(() => setOwnChannels([]));
	}, [kickAuthStatus?.isConnected]);

	const handleAdd = () => {
		const slug = newChannelInput.trim();
		if (!slug) return;
		const next = addChannel(slug);
		setChannels(next);
		setActiveChannelSlug(slug);
		setNewChannelInput("");
		window.dispatchEvent(new Event("kick-channel-settings-changed"));
		dispatch(chatListener(slug));
		toast(`Connecting to ${slug}`, { type: "info" });
	};

	const handleRemove = (slug: string) => {
		const next = removeChannel(slug);
		setChannels(next);
		window.dispatchEvent(new Event("kick-channel-settings-changed"));
	};

	const handleSelect = (slug: string) => {
		setActiveChannelSlug(slug);
		window.dispatchEvent(new Event("kick-channel-settings-changed"));
		dispatch(chatListener(slug));
	};

	const handleAutoConnectToggle = (slug: string, current: boolean) => {
		const next = updateChannelAutoConnect(slug, !current);
		setChannels(next);
	};

	return (
		<>
			<h3>Channel</h3>
			<div className="sub">
				Connect to channels you watch or moderate. Auto-connect channels open when chat-view launches.
			</div>

			{ownChannels.length > 0 && (
				<div className="set-block">
					<div className="set-block-section-label">My channel</div>
					{ownChannels.map((ch) => (
						<div key={ch.slug} className="set-block-row">
							<div className="l">
								<b style={{ display: "flex", alignItems: "center", gap: 8 }}>
									{ch.slug}
									<span className="pbadge kick" style={{ fontSize: 9 }}>MY CHANNEL</span>
									{activeSlug === ch.slug && (
										<span className="pbadge sub" style={{ fontSize: 9, background: "color-mix(in oklch, var(--ac-mint) 18%, transparent)", color: "var(--ac-mint)" }}>ACTIVE</span>
									)}
								</b>
							</div>
							<button
								className="set-btn"
								onClick={() => handleSelect(ch.slug)}
								type="button"
							>
								{activeSlug === ch.slug ? "Connected" : "Connect"}
							</button>
						</div>
					))}
				</div>
			)}

			<div className="set-block">
				{channels.map((ch) => (
					<div key={ch.slug} className="set-block-row">
						<div className="l">
							<b style={{ display: "flex", alignItems: "center", gap: 8 }}>
								{ch.slug}
								{activeSlug === ch.slug && (
									<span className="pbadge sub" style={{ fontSize: 9, background: "color-mix(in oklch, var(--ac-mint) 18%, transparent)", color: "var(--ac-mint)" }}>ACTIVE</span>
								)}
							</b>
							{/* Fix 10: meta line with category */}
							<span>
								{activeSlug === ch.slug
									? `${getChannelMeta(ch.slug)} · auto-connect on launch · default reply channel`
									: ch.autoConnect
										? `${getChannelMeta(ch.slug)} · auto-connect`
										: "Manual connect · last visited recently"}
							</span>
						</div>
						<div style={{ display: "flex", gap: 6 }}>
							<Toggle
								on={!!ch.autoConnect}
								onChange={() => handleAutoConnectToggle(ch.slug, !!ch.autoConnect)}
							/>
							<button
								className="set-btn danger"
								onClick={() => handleRemove(ch.slug)}
								type="button"
								aria-label={`Remove ${ch.slug}`}
							>
								Remove
							</button>
						</div>
					</div>
				))}

				<div className="set-block-row">
					<div className="l">
						<b>Add a channel</b>
						<span>Paste a channel handle or URL.</span>
					</div>
					<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
						<input
							className="set-input"
							placeholder="@channelname"
							value={newChannelInput}
							onChange={(e) => setNewChannelInput(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && handleAdd()}
							aria-label="New channel name"
						/>
						<button className="set-btn primary" onClick={handleAdd} type="button">
							<Icon name="plus" size={12} /> Add
						</button>
					</div>
				</div>
			</div>
		</>
	);
};

// ─── Section: Account ─────────────────────────────────────────────────────────

interface AccountSectionProps {
	kickAuthStatus: any;
	kickUserInfo: any;
	onRefreshAuth: () => void;
}

const AccountSection: FunctionComponent<AccountSectionProps> = ({
	kickAuthStatus,
	kickUserInfo,
	onRefreshAuth,
}) => {
	const isConnected = !!kickAuthStatus?.isConnected;
	const expiresAtText = kickAuthStatus?.expiresAt
		? new Date(kickAuthStatus.expiresAt).toLocaleString()
		: "Not connected";

	const [autoRefresh, setAutoRefresh] = useState(
		() => localStorage.getItem("chatViewRefreshTokenAuto") !== "false"
	);
	const [externalLinks, setExternalLinks] = useState(
		() => localStorage.getItem("chatViewExternalLinksBrowser") !== "false"
	);

	const handleAutoRefresh = (v: boolean) => {
		setAutoRefresh(v);
		localStorage.setItem("chatViewRefreshTokenAuto", String(v));
	};

	const handleExternalLinks = (v: boolean) => {
		setExternalLinks(v);
		localStorage.setItem("chatViewExternalLinksBrowser", String(v));
	};

	const handleSignOut = () => {
		const kickBridge = window.electron.kick as any;
		const signOutFn = kickBridge?.signOut;
		if (typeof signOutFn === "function") {
			signOutFn()
				.then(() => {
					onRefreshAuth();
					toast("Signed out", { type: "info" });
				})
				.catch(() => toast("Sign out failed", { type: "error" }));
		} else {
			toast("Sign out not available.", { type: "warning" });
		}
	};

	return (
		<>
			<h3>Account</h3>
			<div className="sub">Manage the OAuth connection used to authenticate with the chat API.</div>

			<div className="set-block">
				<div className="set-block-row">
					<div className="l">
						<b style={{ display: "flex", alignItems: "center", gap: 8 }}>
							{isConnected ? (
								<>Connected as <span style={{ color: "var(--ac-mint)" }}>{kickUserInfo?.name || kickAuthStatus?.username || "—"}</span></>
							) : (
								"Not connected"
							)}
							<span
								className="pbadge"
								style={{
									fontSize: 9,
									background: isConnected
										? "color-mix(in oklch, var(--ac-mint) 18%, transparent)"
										: "color-mix(in oklch, #ff4d6d 18%, transparent)",
									color: isConnected ? "var(--ac-mint)" : "#ff8da1",
								}}
							>
								{isConnected ? "OK" : "DISCONNECTED"}
							</span>
						</b>
						<span>
							{isConnected
								? `Token expires ${expiresAtText} · client_id `
								: "No active session · "}
							<span className="ms-mono" style={{ fontSize: 11 }}>
								{maskSensitive(kickAuthStatus?.clientId)}
							</span>
						</span>
					</div>
					<button
						className="set-btn primary"
						onClick={() => window.electron.kickConnectionWindow.open()}
						type="button"
					>
						Manage connection
					</button>
				</div>
			</div>

			<div className="set-block">
				<div className="set-block-row">
					<div className="l">
						<b>Refresh token automatically</b>
						<span>chat-view will silently refresh the OAuth token before it expires.</span>
					</div>
					<Toggle on={autoRefresh} onChange={handleAutoRefresh} />
				</div>
				<div className="set-block-row">
					<div className="l">
						<b>Open external links in browser</b>
						<span>Otherwise opens in the desktop app's webview.</span>
					</div>
					<Toggle on={externalLinks} onChange={handleExternalLinks} />
				</div>
				<div className="set-block-row danger" style={{ borderTop: "1px solid var(--bd-1)" }}>
					<div className="l">
						<b style={{ color: "var(--ac-warn, #ff4d6d)" }}>Sign out</b>
						<span>Disconnects all channels and clears local session state.</span>
					</div>
					<button
						className="set-btn danger"
						onClick={handleSignOut}
						type="button"
						aria-label="Sign out"
					>
						Sign out
					</button>
				</div>
			</div>
		</>
	);
};

// ─── Section: Permissions ─────────────────────────────────────────────────────

interface PermissionsSectionProps {
	kickAuthStatus: any;
	isChannelOwner: boolean | undefined;
	hasModBadge: boolean;
}

const PermissionsSection: FunctionComponent<PermissionsSectionProps> = ({
	kickAuthStatus,
	isChannelOwner,
	hasModBadge,
}) => {
	const grantedScopes = parseKickScopes(
		kickAuthStatus?.grantedScopes,
		kickAuthStatus?.tokenScope,
		kickAuthStatus?.introspection?.data?.scope,
		kickAuthStatus?.introspection?.data?.scopes
	);
	const missingScopes: string[] = grantedScopes.length > 0
		? EXPECTED_SCOPES.filter((s) => !grantedScopes.includes(s))
		: (Array.isArray(kickAuthStatus?.missingScopes) ? kickAuthStatus.missingScopes as string[] : []);

	return (
		<>
			<h3>Permissions</h3>
			<div className="sub">
				OAuth scopes granted to chat-view. Missing scopes degrade specific features gracefully.
			</div>

			{missingScopes.length > 0 && (
				<div className="set-scope-warn-banner" role="alert">
					<Icon name="warn" size={14} ariaLabel="Warning" />
					<span style={{ flex: 1 }}>
						<b>{missingScopes.length} scope{missingScopes.length === 1 ? "" : "s"} missing.</b>{" "}
						Reconnect to grant: {missingScopes.join(", ")}.
					</span>
					<button
						className="set-btn primary"
						onClick={() => window.electron.kickConnectionWindow.open()}
						type="button"
					>
						Re-authorize
					</button>
				</div>
			)}

			<div className="set-block">
				<div className="set-block-section-label">
					Granted <span className="ms-mono" style={{ marginLeft: 4 }}>{grantedScopes.length}</span>
				</div>
				{grantedScopes.map((s) => (
					<div key={s} className="scope-row">
						<span className="scope-ic ok"><Icon name="check" size={10} /></span>
						<div>
							<div className="scope-name">{s}</div>
							<div className="scope-affects">{SCOPE_AFFECTS[s] || "—"}</div>
						</div>
					</div>
				))}
			</div>

			{missingScopes.length > 0 && (
				<div className="set-block">
					<div className="set-block-section-label">
						Missing <span className="ms-mono" style={{ marginLeft: 4 }}>{missingScopes.length}</span>
					</div>
					{missingScopes.map((s) => (
						<div key={s} className="scope-row">
							<span className="scope-ic miss">!</span>
							<div>
								<div className="scope-name">{s}</div>
								<div className="scope-affects">Disables: {SCOPE_AFFECTS[s] || "—"}</div>
							</div>
							<button
								className="set-btn ghost"
								onClick={() => window.electron.kickConnectionWindow.open()}
								type="button"
							>
								Request
							</button>
						</div>
					))}
				</div>
			)}

			<div className="set-block">
				<div className="set-block-row">
					<div className="l">
						<b>Role source</b>
						<span>Channel role is verified via API; moderator badge confirmed from observed badges.</span>
					</div>
					<div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-2)" }}>
						{isChannelOwner && <span className="pbadge kick">OWNER</span>}
						{hasModBadge && <span className="pbadge s7tv">MOD</span>}
						{!isChannelOwner && !hasModBadge && <span className="pbadge ffz">VIEWER</span>}
					</div>
				</div>
			</div>
		</>
	);
};

// ─── Section: Moderation ──────────────────────────────────────────────────────

const ModerationSection: FunctionComponent = () => {
	const [defaultTimeout, setDefaultTimeoutLocal] = useState(
		() => getDefaultTimeoutSeconds()
	);
	const [longTimeout, setLongTimeoutLocal] = useState(
		() => {
			const stored = localStorage.getItem("chatViewLongTimeoutSeconds");
			return stored ? parseInt(stored, 10) : 600;
		}
	);
	const [modCheckMsg, setModCheckMsgLocal] = useState(() => getModCheckMessage());
	const [susUsers, setSusUsers] = useState(() => getSuspendedUsers());
	const [blockedEmotes, setBlockedEmotes] = useState(() => getBlockedEmotes());

	const handleDefaultTimeout = (v: number) => {
		setDefaultTimeoutLocal(v);
		setDefaultTimeoutSeconds(v);
	};

	const handleLongTimeout = (v: number) => {
		setLongTimeoutLocal(v);
		localStorage.setItem("chatViewLongTimeoutSeconds", String(v));
	};

	const handleModCheckMsg = (v: string) => {
		setModCheckMsgLocal(v);
		setModCheckMessage(v);
	};

	return (
		<>
			<h3>Moderation</h3>
			<div className="sub">Defaults applied when you trigger moderation actions from the chat panel.</div>

			<div className="set-block">
				<div className="set-block-row">
					<div className="l">
						<b>Default timeout</b>
						<span>Used by the timeout button and Ctrl+T.</span>
					</div>
					<Stepper
						value={defaultTimeout}
						unit="seconds"
						min={1}
						step={30}
						onChange={handleDefaultTimeout}
					/>
				</div>
				<div className="set-block-row">
					<div className="l">
						<b>Long timeout</b>
						<span>Used by Ctrl+Shift+T.</span>
					</div>
					<Stepper
						value={longTimeout}
						unit="seconds"
						min={60}
						step={60}
						onChange={handleLongTimeout}
					/>
				</div>
				<div className="set-block-row">
					<div className="l">
						<b>Mod check message</b>
						<span>Auto-message when an unknown user is timed out.</span>
					</div>
					<input
						className="set-input"
						style={{ width: 260 }}
						placeholder={DEFAULT_MOD_CHECK_MESSAGE}
						value={modCheckMsg}
						onChange={(e) => handleModCheckMsg(e.target.value)}
						aria-label="Mod check message"
					/>
				</div>
			</div>

			<div className="set-block">
				<div className="set-block-section-label">
					Suspicious users (manual list) <span className="ms-mono" style={{ marginLeft: 4 }}>{susUsers.length}</span>
				</div>
				<div className="set-block-help" style={{ fontSize: 11, color: "var(--ms-fg-4, var(--fg-4))", padding: "0 14px 8px", marginTop: -4 }}>
					Manual watchlist — kanaldaki aktif ban/timeout listesi degil. Aktif kisitlamalar Moderation panelinde gorulur.
				</div>
				{susUsers.length === 0 ? (
					<div className="set-block-empty">Listede kimse yok.</div>
				) : (
					susUsers.map((u) => (
						<div key={u} className="set-block-row" data-testid={`sus-row-${u}`}>
							<div className="l"><b>{u}</b></div>
							<button
								className="set-btn ghost"
								onClick={() => {
									const next = removeSuspendedUser(u);
									setSusUsers(next);
								}}
								type="button"
								aria-label={`Unban ${u}`}
							>
								Unban
							</button>
						</div>
					))
				)}
			</div>

			<div className="set-block">
				<div className="set-block-section-label">
					Blocked emotes <span className="ms-mono" style={{ marginLeft: 4 }}>{blockedEmotes.length}</span>
				</div>
				{blockedEmotes.length === 0 ? (
					<div className="set-block-empty">No blocked emotes.</div>
				) : (
					blockedEmotes.map((e) => (
						<div key={e} className="set-block-row">
							<div className="l"><b>{e}</b></div>
							<button
								className="set-btn ghost"
								onClick={() => {
									const next = removeBlockedEmote(e);
									setBlockedEmotes(next);
								}}
								type="button"
								aria-label={`Unblock ${e}`}
							>
								Unblock
							</button>
						</div>
					))
				)}
			</div>
		</>
	);
};

// ─── Section: Emotes ──────────────────────────────────────────────────────────

const EmotesSection: FunctionComponent = () => {
	const messages = useFanthalSelector((state) => state.messages);

	const emoteCounts = useMemo(() => {
		const sets = messages.globalEmoteSets || [];
		const countByProvider: Record<string, number> = {
			kick: 0,
			seventv: 0,
			bttv: 0,
			ffz: 0,
		};
		sets.forEach((set) => {
			const p = set.provider?.toLowerCase() || "";
			if (p.includes("kick")) countByProvider.kick += set.emotes?.length || 0;
			else if (p.includes("7tv") || p.includes("seventv")) countByProvider.seventv += set.emotes?.length || 0;
			else if (p.includes("bttv")) countByProvider.bttv += set.emotes?.length || 0;
			else if (p.includes("ffz")) countByProvider.ffz += set.emotes?.length || 0;
		});
		return countByProvider;
	}, [messages.globalEmoteSets]);

	const [animateGif, setAnimateGif] = useState(
		() => localStorage.getItem("chatViewAnimateGif") !== "false"
	);
	const [providerBadges, setProviderBadges] = useState(
		() => localStorage.getItem("chatViewProviderBadgesInChat") === "true"
	);

	const favCount = useMemo(() => getFavoriteEmotes().length, []);
	const blockedCount = useMemo(() => getBlockedEmotes().length, []);

	const PROVIDERS = [
		{ id: "kick",    label: "Kick",  kind: "kick",  count: emoteCounts.kick },
		{ id: "seventv", label: "7TV",   kind: "s7tv",  count: emoteCounts.seventv },
		{ id: "bttv",    label: "BTTV",  kind: "bttv",  count: emoteCounts.bttv },
		{ id: "ffz",     label: "FFZ",   kind: "ffz",   count: emoteCounts.ffz },
	];

	const handleAnimateGif = (v: boolean) => {
		setAnimateGif(v);
		localStorage.setItem("chatViewAnimateGif", String(v));
	};

	const handleProviderBadges = (v: boolean) => {
		setProviderBadges(v);
		localStorage.setItem("chatViewProviderBadgesInChat", String(v));
	};

	return (
		<>
			<h3>Emotes</h3>
			<div className="sub">
				External providers extend the emote set available in chat. Provider errors are isolated and won't break chat.
			</div>

			<div className="set-block">
				{PROVIDERS.map((p) => (
					<div key={p.id} className="set-block-row">
						<div className="l">
							<b style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<span className={`pbadge ${p.kind}`}>{p.label}</span>
							</b>
							<span>
								<span className="ms-mono">{p.count}</span> emote{p.count === 1 ? "" : "s"} loaded
							</span>
						</div>
						<div style={{ display: "flex", gap: 6 }}>
							<button
								className="set-btn"
								onClick={() => toast(`Refreshing ${p.label}…`, { type: "info" })}
								type="button"
								aria-label={`Refresh ${p.label}`}
							>
								<Icon name="refresh" size={12} /> Refresh
							</button>
						</div>
					</div>
				))}
			</div>

			<div className="set-block">
				<div className="set-block-row">
					<div className="l">
						<b>Favorites</b>
						<span>{favCount} emote{favCount === 1 ? "" : "s"} pinned to the Favorites tab and autocomplete.</span>
					</div>
					<button
						className="set-btn"
						onClick={() => toast("Emote favorites manager coming in Sprint 6b.", { type: "info" })}
						type="button"
					>
						Manage favorites
					</button>
				</div>
				<div className="set-block-row">
					<div className="l">
						<b>Blocked emotes</b>
						<span>{blockedCount} hidden from chat and the picker.</span>
					</div>
					<button
						className="set-btn"
						onClick={() => toast("Manage blocked emotes in the Moderation section.", { type: "info" })}
						type="button"
					>
						Manage blocked
					</button>
				</div>
				<div className="set-block-row">
					<div className="l">
						<b>Animate GIF emotes</b>
						<span>Pause animations to reduce GPU load.</span>
					</div>
					<Toggle on={animateGif} onChange={handleAnimateGif} />
				</div>
				<div className="set-block-row">
					<div className="l">
						<b>Show provider badges in chat</b>
						<span>Adds a small Kick/7TV/BTTV/FFZ badge next to emotes when hovered.</span>
					</div>
					<Toggle on={providerBadges} onChange={handleProviderBadges} />
				</div>
			</div>
		</>
	);
};

// Sprint 47: Webhook receiver block kaldırıldı. Pusher chatroom +
// channel_<id> kanalları sub/gift/KICKs/host/banned/followers olaylarını
// multi-channel olarak veriyor; webhook altyapısı gereksiz.

// ─── Section: Advanced ────────────────────────────────────────────────────────

interface AdvancedSectionProps {
	onShellToggle: (v: boolean) => void;
}

// Sprint 38: Advanced topic toggle artık localStorage'a persist ediliyor.
// `chatViewAdvancedTopics` JSON map: { [topic]: enabled }. Eski varsayılan
// "ok" status'lar yine true; "off" olanlar default false ama kullanıcı
// açtığında persist eder. channel.kicks.v1 default ON (Sprint 38 isteği —
// "ayarlarda gelişmişte bits'i açtım onun default görünmesi").
const ADVANCED_TOPICS_STORAGE_KEY = "chatViewAdvancedTopics";
const DEFAULT_ENABLED_TOPICS: Record<string, boolean> = {
	"chat.message.v1": true,
	"chat.deleted.v1": true,
	"channel.subscription.v2": true,
	"channel.gift.v2": true,
	"channel.kicks.v1": true,
	"channel.reward.v1": true,
};

const AdvancedSection: FunctionComponent<AdvancedSectionProps> = ({ onShellToggle }) => {
	const [topics, setTopics] = useState(() => {
		let stored: Record<string, boolean> = {};
		try {
			const raw = localStorage.getItem(ADVANCED_TOPICS_STORAGE_KEY);
			if (raw) stored = JSON.parse(raw);
		} catch {
			/* ignore */
		}
		return ADVANCED_TOPICS.map((t) => ({
			...t,
			enabled:
				stored[t.topic] !== undefined
					? stored[t.topic]
					: DEFAULT_ENABLED_TOPICS[t.topic] ?? t.status === "ok",
		}));
	});
	const [verboseLogging, setVerboseLogging] = useState(
		() => localStorage.getItem("chatViewVerboseLogging") === "true"
	);
	// Sprint 7: default is modern; toggle reads stored value or falls back to true
	const [modernShell, setModernShell] = useState(() => {
		const stored = localStorage.getItem("chatViewShellPreference");
		if (stored === "classic") return false;
		return true; // modern (default)
	});

	const handleTopicToggle = (topic: string) => {
		setTopics((prev) => {
			const next = prev.map((t) =>
				t.topic === topic ? { ...t, enabled: !t.enabled } : t
			);
			// Sprint 38: persist toggle map'i.
			try {
				const map: Record<string, boolean> = {};
				next.forEach((t) => {
					map[t.topic] = t.enabled;
				});
				localStorage.setItem(
					ADVANCED_TOPICS_STORAGE_KEY,
					JSON.stringify(map)
				);
				window.dispatchEvent(
					new Event("chat-view-advanced-topics-changed")
				);
			} catch {
				/* quota / serialization edge case */
			}
			return next;
		});
	};

	const handleVerboseLogging = (v: boolean) => {
		setVerboseLogging(v);
		localStorage.setItem("chatViewVerboseLogging", String(v));
	};

	const handleOpenLogDir = () => {
		if ((window.electron as any)?.shell?.openPath) {
			(window.electron as any).shell.openPath("logs");
		} else {
			toast("Log directory: see app data folder.", { type: "info" });
		}
	};

	const handleModernShellToggle = (v: boolean) => {
		setModernShell(v);
		localStorage.setItem("chatViewShellPreference", v ? "modern" : "classic");
		window.dispatchEvent(new Event("chat-view-shell-preference-changed"));
		onShellToggle(v);
	};

	// Sprint 41: takipçi göster toggle (default true).
	const [showFollowers, setShowFollowers] = useState<boolean>(
		() => localStorage.getItem("chatViewShowFollowers") !== "false"
	);
	const handleShowFollowers = (v: boolean) => {
		setShowFollowers(v);
		localStorage.setItem("chatViewShowFollowers", String(v));
		window.dispatchEvent(new Event("chat-view-show-followers-changed"));
	};

	// Sprint 20: theme + language toggles
	const [theme, setTheme] = useState<"light" | "dark">(() => {
		const stored = localStorage.getItem("chatViewTheme");
		return stored === "light" ? "light" : "dark";
	});
	const [language, setLanguageState] = useState<"tr" | "en">(() => {
		const stored = localStorage.getItem("chatViewLanguage");
		return stored === "en" ? "en" : "tr";
	});
	const handleThemeChange = (next: "light" | "dark") => {
		setTheme(next);
		localStorage.setItem("chatViewTheme", next);
		window.dispatchEvent(new Event("chat-view-theme-changed"));
	};
	const handleLanguageChange = (next: "tr" | "en") => {
		setLanguageState(next);
		localStorage.setItem("chatViewLanguage", next);
		window.dispatchEvent(new Event("chat-view-language-changed"));
	};

	return (
		<>
			<h3>Advanced</h3>
			<div className="sub">Diagnostics and event subscription state. Most users won't need these.</div>

			{/* Sprint 41: Takipçi bildirimi */}
			<div className="set-block">
				<div className="set-block-row">
					<div className="l">
						<b>Takipçileri göster</b>
						<span>Kanala yeni takip olduğunda chat akışında ❤ banner ve aktivite kaydı.</span>
					</div>
					<button
						type="button"
						role="switch"
						aria-checked={showFollowers}
						className={`set-toggle ${showFollowers ? "on" : ""}`}
						onClick={() => handleShowFollowers(!showFollowers)}
					>
						<span className="knob" />
					</button>
				</div>
			</div>

			{/* Sprint 20: Tema + Dil */}
			<div className="set-block">
				<div className="set-block-row">
					<div className="l">
						<b>Tema / Theme</b>
						<span>Açık veya koyu görünüm — Modern shell renkleri.</span>
					</div>
					<div role="radiogroup" aria-label="Theme" style={{ display: "flex", gap: 6 }}>
						<button
							type="button"
							role="radio"
							aria-checked={theme === "dark"}
							className={`set-btn ${theme === "dark" ? "primary" : ""}`}
							onClick={() => handleThemeChange("dark")}
						>
							Koyu / Dark
						</button>
						<button
							type="button"
							role="radio"
							aria-checked={theme === "light"}
							className={`set-btn ${theme === "light" ? "primary" : ""}`}
							onClick={() => handleThemeChange("light")}
						>
							Açık / Light
						</button>
					</div>
				</div>
				<div className="set-block-row">
					<div className="l">
						<b>Dil / Language</b>
						<span>Modern UI metinleri için tercih edilen dil.</span>
					</div>
					<div role="radiogroup" aria-label="Language" style={{ display: "flex", gap: 6 }}>
						<button
							type="button"
							role="radio"
							aria-checked={language === "tr"}
							className={`set-btn ${language === "tr" ? "primary" : ""}`}
							onClick={() => handleLanguageChange("tr")}
						>
							Türkçe
						</button>
						<button
							type="button"
							role="radio"
							aria-checked={language === "en"}
							className={`set-btn ${language === "en" ? "primary" : ""}`}
							onClick={() => handleLanguageChange("en")}
						>
							English
						</button>
					</div>
				</div>
			</div>

			{/* Sprint 47: Webhook receiver kaldırıldı — Pusher tüm event'leri
			    sağlıyor (chatroom + channel_<id> kanalları). */}

			<div className="set-block">
				<div className="set-block-section-label">Event subscriptions</div>
				{topics.map((t) => (
					<div key={t.topic} className="set-block-row">
						<div className="l">
							<b className="set-topic-mono">{t.topic}</b>
							<span>Pusher listener — {t.enabled ? "active" : "off"}</span>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
							<span className={`pbadge ${t.enabled ? "kick" : "ffz"}`}>
								{t.enabled ? "ok" : "off"}
							</span>
							<Toggle
								on={t.enabled}
								onChange={() => handleTopicToggle(t.topic)}
							/>
						</div>
					</div>
				))}
			</div>

			<div className="set-block">
				<div className="set-block-row">
					<div className="l">
						<b>Verbose logging</b>
						<span>Writes raw event JSON to the local log file. Tokens are redacted.</span>
					</div>
					<Toggle on={verboseLogging} onChange={handleVerboseLogging} />
				</div>
				<div className="set-block-row">
					<div className="l">
						<b>Open log directory</b>
						<span className="set-topic-mono">~/AppData/Roaming/chat-view/logs/</span>
					</div>
					<button className="set-btn" onClick={handleOpenLogDir} type="button">
						Reveal
					</button>
				</div>
				<div className="set-block-row">
					<div className="l">
						<b>Modern UI (beta)</b>
						<span>Switch between Classic and Modern shell. Takes effect immediately.</span>
					</div>
					<Toggle on={modernShell} onChange={handleModernShellToggle} />
				</div>
			</div>
		</>
	);
};

// ─── Root: SettingsModern ─────────────────────────────────────────────────────

const SettingsModern: FunctionComponent = () => {
	const { t } = useTranslation();
	const dispatch = useFanthalDispatch();
	const messages = useFanthalSelector((state) => state.messages);

	const [activeSection, setActiveSection] = useState<SectionId>("channel");
	const [kickAuthStatus, setKickAuthStatus] = useState<any>(null);
	const [kickUserInfo, setKickUserInfo] = useState<any>(null);

	const loadKickAuth = () => {
		window.electron.kick
			.getAuthStatus()
			.then((s: any) => setKickAuthStatus(s))
			.catch(() => setKickAuthStatus(null));
	};

	const loadKickUserInfo = () => {
		window.electron.kick
			.getUsers()
			.then((r: any) => setKickUserInfo(r?.data?.[0] || null))
			.catch(() => setKickUserInfo(null));
	};

	useEffect(() => {
		loadKickAuth();
		loadKickUserInfo();
	}, []);

	// Compute missing scopes for Permissions nav warning dot
	const grantedScopes = parseKickScopes(
		kickAuthStatus?.grantedScopes,
		kickAuthStatus?.tokenScope,
		kickAuthStatus?.introspection?.data?.scope,
		kickAuthStatus?.introspection?.data?.scopes
	);
	const missingScopes: string[] = grantedScopes.length > 0
		? EXPECTED_SCOPES.filter((s) => !grantedScopes.includes(s))
		: (Array.isArray(kickAuthStatus?.missingScopes) ? kickAuthStatus.missingScopes as string[] : []);
	const hasMissingScopes = missingScopes.length > 0;

	// Compute is-channel-owner + moderator badge for Permissions section
	const activeSlug = getActiveChannelSlug();
	const isChannelOwner = useMemo(() => {
		if (!kickUserInfo?.user_id || !activeSlug) return undefined;
		const meta = messages.streamMetaByChannel?.[activeSlug];
		if (!meta?.broadcasterUserId) return undefined;
		return meta.broadcasterUserId === kickUserInfo.user_id;
	}, [kickUserInfo, activeSlug, messages.streamMetaByChannel]);

	const hasModBadge = useMemo(() => {
		if (!kickUserInfo?.name && !localStorage.getItem("username")) return false;
		const names = [kickUserInfo?.name, localStorage.getItem("username")]
			.filter((n): n is string => !!n)
			.map((n) => n.toLowerCase());
		return messages.messageList.some((msg) => {
			const senderName = msg.sender?.username?.toLowerCase();
			if (!senderName || !names.includes(senderName)) return false;
			return msg.sender.identity?.badges?.some(
				(b: any) => b.type?.toLowerCase() === "moderator"
			);
		});
	}, [kickUserInfo, messages.messageList]);

	const handleShellToggle = (_modern: boolean) => {
		// Sprint 7: App.tsx now reads chatViewShellPreference (modern is default).
		// AdvancedSection already writes chatViewShellPreference directly;
		// no additional action needed here.
	};

	return (
		<div className="set-shell" data-testid="settings-modern-shell">
			{/* Body: side-nav + content (header is provided by modal-hd in LayoutModern) */}
			<div className="set-main">
				{/* Side nav */}
				<nav className="set-nav" aria-label="Settings sections">
					{SETTINGS_NAV.map((n) => {
						const warn = n.id === "permissions" && hasMissingScopes;
						return (
							<button
								key={n.id}
								className={`set-nav-item ${activeSection === n.id ? "is-active" : ""}`}
								onClick={() => setActiveSection(n.id)}
								type="button"
								aria-current={activeSection === n.id ? "page" : undefined}
							>
								<Icon name={n.icon} size={14} />
								{t(n.label)}
								{warn && <span className="set-nav-warn-dot" aria-label="Action needed" title="Action needed" />}
							</button>
						);
					})}
				</nav>

				{/* Section content */}
				<div className="set-content">
					{activeSection === "channel" && (
						<ChannelSection kickAuthStatus={kickAuthStatus} />
					)}
					{activeSection === "account" && (
						<AccountSection
							kickAuthStatus={kickAuthStatus}
							kickUserInfo={kickUserInfo}
							onRefreshAuth={loadKickAuth}
						/>
					)}
					{activeSection === "permissions" && (
						<PermissionsSection
							kickAuthStatus={kickAuthStatus}
							isChannelOwner={isChannelOwner}
							hasModBadge={hasModBadge}
						/>
					)}
					{activeSection === "moderation" && <ModerationSection />}
					{activeSection === "emotes" && <EmotesSection />}
					{activeSection === "advanced" && (
						<AdvancedSection onShellToggle={handleShellToggle} />
					)}
				</div>
			</div>
		</div>
	);
};

export default SettingsModern;
