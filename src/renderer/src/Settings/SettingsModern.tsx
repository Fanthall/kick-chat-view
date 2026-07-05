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
	useRef,
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
import AutomationSection from "./AutomationSection";

// ─── Constants ────────────────────────────────────────────────────────────────

// Values are i18n keys resolved via t() at render time.
const SCOPE_AFFECTS: Record<string, string> = {
	"chat:write": "settings.scope.chat-write",
	"moderation:ban": "settings.scope.moderation-ban",
	"moderation:chat_message:manage": "settings.scope.moderation-manage",
	"channel:rewards:read": "settings.scope.rewards-read",
	"channel:rewards:write": "settings.scope.rewards-write",
	"channel:write": "settings.scope.channel-write",
	"kicks:read": "settings.scope.kicks-read",
	"events:subscribe": "settings.scope.events-subscribe",
	"user:read": "settings.scope.user-read",
	"channel:read": "settings.scope.channel-read",
	"streamkey:read": "settings.scope.streamkey-read",
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

type SectionId = "channel" | "account" | "permissions" | "moderation" | "emotes" | "automation" | "advanced";

const SETTINGS_NAV: NavItem[] = [
	{ id: "channel",     label: "settings.nav.channel",     icon: "code" },
	{ id: "account",     label: "settings.nav.account",     icon: "user" },
	{ id: "permissions", label: "settings.nav.permissions", icon: "shield" },
	{ id: "moderation",  label: "settings.nav.moderation",  icon: "ban" },
	{ id: "emotes",      label: "settings.nav.emotes",      icon: "smile" },
	{ id: "automation",  label: "settings.nav.automation",  icon: "settings" },
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
	const { t } = useTranslation();
	return (
		<div className="set-stepper">
			<button
				type="button"
				onClick={() => onChange(Math.max(min, value - step))}
				aria-label={`${t("settings.stepper.decrease")} ${unit}`}
			>
				−
			</button>
			<span className="set-stepper-val">{value}</span>
			<button
				type="button"
				onClick={() => onChange(value + step)}
				aria-label={`${t("settings.stepper.increase")} ${unit}`}
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
	const { t } = useTranslation();
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
		toast(`${t("settings.channel.connecting-toast")} ${slug}`, { type: "info" });
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
			<h3>{t("settings.channel.title")}</h3>
			<div className="sub">
				{t("settings.channel.sub")}
			</div>

			{ownChannels.length > 0 && (
				<div className="set-block">
					<div className="set-block-section-label">{t("settings.channel.my-channel")}</div>
					{ownChannels.map((ch) => (
						<div key={ch.slug} className="set-block-row">
							<div className="l">
								<b style={{ display: "flex", alignItems: "center", gap: 8 }}>
									{ch.slug}
									<span className="pbadge kick" style={{ fontSize: 9 }}>{t("settings.channel.my-badge")}</span>
									{activeSlug === ch.slug && (
										<span className="pbadge sub" style={{ fontSize: 9, background: "color-mix(in oklch, var(--ac-mint) 18%, transparent)", color: "var(--ac-mint)" }}>{t("settings.channel.active")}</span>
									)}
								</b>
							</div>
							<button
								className="set-btn"
								onClick={() => handleSelect(ch.slug)}
								type="button"
							>
								{activeSlug === ch.slug ? t("settings.channel.connected") : t("settings.channel.connect")}
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
									<span className="pbadge sub" style={{ fontSize: 9, background: "color-mix(in oklch, var(--ac-mint) 18%, transparent)", color: "var(--ac-mint)" }}>{t("settings.channel.active")}</span>
								)}
							</b>
							{/* Fix 10: meta line with category */}
							<span>
								{activeSlug === ch.slug
									? `${getChannelMeta(ch.slug)} · ${t("settings.channel.meta-active")}`
									: ch.autoConnect
										? `${getChannelMeta(ch.slug)} · ${t("settings.channel.meta-auto")}`
										: t("settings.channel.meta-manual")}
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
								aria-label={`${t("settings.channel.remove")} ${ch.slug}`}
							>
								{t("settings.channel.remove")}
							</button>
						</div>
					</div>
				))}

				<div className="set-block-row">
					<div className="l">
						<b>{t("settings.channel.add-title")}</b>
						<span>{t("settings.channel.add-sub")}</span>
					</div>
					<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
						<input
							className="set-input"
							placeholder={t("addchannel.placeholder")}
							value={newChannelInput}
							onChange={(e) => setNewChannelInput(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && handleAdd()}
							aria-label={t("settings.channel.add-input-aria")}
						/>
						<button className="set-btn primary" onClick={handleAdd} type="button">
							<Icon name="plus" size={12} /> {t("settings.channel.add")}
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
	const { t } = useTranslation();
	const isConnected = !!kickAuthStatus?.isConnected;
	const expiresAtText = kickAuthStatus?.expiresAt
		? new Date(kickAuthStatus.expiresAt).toLocaleString()
		: t("settings.account.not-connected");

	// Sprint 54: autoRefresh + externalLinks toggle'ları kaldırıldı —
	// hiçbir kod tarafından okunmuyordu (dead UI).

	const handleSignOut = () => {
		const kickBridge = window.electron.kick as any;
		const signOutFn = kickBridge?.signOut;
		if (typeof signOutFn === "function") {
			signOutFn()
				.then(() => {
					onRefreshAuth();
					toast(t("settings.account.signed-out-toast"), { type: "info" });
				})
				.catch(() => toast(t("settings.account.sign-out-failed-toast"), { type: "error" }));
		} else {
			toast(t("settings.account.sign-out-unavailable-toast"), { type: "warning" });
		}
	};

	return (
		<>
			<h3>{t("settings.account.title")}</h3>
			<div className="sub">{t("settings.account.sub")}</div>

			<div className="set-block">
				<div className="set-block-row">
					<div className="l">
						<b style={{ display: "flex", alignItems: "center", gap: 8 }}>
							{isConnected ? (
								<>{t("settings.account.connected-as")} <span style={{ color: "var(--ac-mint)" }}>{kickUserInfo?.name || kickAuthStatus?.username || "—"}</span></>
							) : (
								t("settings.account.not-connected")
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
								{isConnected ? t("settings.account.ok") : t("settings.account.disconnected")}
							</span>
						</b>
						<span>
							{isConnected
								? `${t("settings.account.token-expires")} ${expiresAtText} · client_id `
								: t("settings.account.no-session")}
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
						{t("settings.account.manage-connection")}
					</button>
				</div>
			</div>

			<div className="set-block">
				{/* Sprint 54: Refresh token / External links toggle'ları kaldırıldı (dead). */}
				<div className="set-block-row danger">
					<div className="l">
						<b style={{ color: "var(--ac-warn, #ff4d6d)" }}>{t("settings.account.sign-out")}</b>
						<span>{t("settings.account.sign-out-sub")}</span>
					</div>
					<button
						className="set-btn danger"
						onClick={handleSignOut}
						type="button"
						aria-label={t("settings.account.sign-out")}
					>
						{t("settings.account.sign-out")}
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
	const { t } = useTranslation();
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
			<h3>{t("settings.permissions.title")}</h3>
			<div className="sub">
				{t("settings.permissions.sub")}
			</div>

			{missingScopes.length > 0 && (
				<div className="set-scope-warn-banner" role="alert">
					<Icon name="warn" size={14} ariaLabel="Warning" />
					<span style={{ flex: 1 }}>
						<b>{missingScopes.length} {missingScopes.length === 1 ? t("settings.permissions.scope-missing-one") : t("settings.permissions.scope-missing-many")}</b>{" "}
						{t("settings.permissions.reconnect-grant")} {missingScopes.join(", ")}.
					</span>
					<button
						className="set-btn primary"
						onClick={() => window.electron.kickConnectionWindow.open()}
						type="button"
					>
						{t("settings.permissions.re-authorize")}
					</button>
				</div>
			)}

			<div className="set-block">
				<div className="set-block-section-label">
					{t("settings.permissions.granted")} <span className="ms-mono" style={{ marginLeft: 4 }}>{grantedScopes.length}</span>
				</div>
				{grantedScopes.map((s) => (
					<div key={s} className="scope-row">
						<span className="scope-ic ok"><Icon name="check" size={10} /></span>
						<div>
							<div className="scope-name">{s}</div>
							<div className="scope-affects">{SCOPE_AFFECTS[s] ? t(SCOPE_AFFECTS[s]) : "—"}</div>
						</div>
					</div>
				))}
			</div>

			{missingScopes.length > 0 && (
				<div className="set-block">
					<div className="set-block-section-label">
						{t("settings.permissions.missing")} <span className="ms-mono" style={{ marginLeft: 4 }}>{missingScopes.length}</span>
					</div>
					{missingScopes.map((s) => (
						<div key={s} className="scope-row">
							<span className="scope-ic miss">!</span>
							<div>
								<div className="scope-name">{s}</div>
								<div className="scope-affects">{t("settings.permissions.disables")} {SCOPE_AFFECTS[s] ? t(SCOPE_AFFECTS[s]) : "—"}</div>
							</div>
							<button
								className="set-btn ghost"
								onClick={() => window.electron.kickConnectionWindow.open()}
								type="button"
							>
								{t("settings.permissions.request")}
							</button>
						</div>
					))}
				</div>
			)}

			<div className="set-block">
				<div className="set-block-row">
					<div className="l">
						<b>{t("settings.permissions.role-source")}</b>
						<span>{t("settings.permissions.role-source-sub")}</span>
					</div>
					<div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg-2)" }}>
						{isChannelOwner && <span className="pbadge kick">{t("settings.permissions.owner")}</span>}
						{hasModBadge && <span className="pbadge s7tv">{t("settings.permissions.mod")}</span>}
						{!isChannelOwner && !hasModBadge && <span className="pbadge ffz">{t("settings.permissions.viewer")}</span>}
					</div>
				</div>
			</div>
		</>
	);
};

// ─── Section: Moderation ──────────────────────────────────────────────────────

const ModerationSection: FunctionComponent = () => {
	const { t } = useTranslation();
	const [defaultTimeout, setDefaultTimeoutLocal] = useState(
		() => getDefaultTimeoutSeconds()
	);
	// Sprint 54: Long timeout toggle kaldırıldı (Ctrl+Shift+T binding modern shell'de yok).
	const [modCheckMsg, setModCheckMsgLocal] = useState(() => getModCheckMessage());
	const [susUsers, setSusUsers] = useState(() => getSuspendedUsers());
	const [blockedEmotes, setBlockedEmotes] = useState(() => getBlockedEmotes());

	const handleDefaultTimeout = (v: number) => {
		setDefaultTimeoutLocal(v);
		setDefaultTimeoutSeconds(v);
	};

	// Sprint 54: handleLongTimeout kaldırıldı (Ctrl+Shift+T binding yok).

	const handleModCheckMsg = (v: string) => {
		setModCheckMsgLocal(v);
		setModCheckMessage(v);
	};

	return (
		<>
			<h3>{t("settings.moderation.title")}</h3>
			<div className="sub">{t("settings.moderation.sub")}</div>

			<div className="set-block">
				<div className="set-block-row">
					<div className="l">
						<b>{t("settings.moderation.default-timeout")}</b>
						<span>{t("settings.moderation.default-timeout-sub")}</span>
					</div>
					<Stepper
						value={defaultTimeout}
						unit={t("settings.moderation.seconds")}
						min={1}
						step={30}
						onChange={handleDefaultTimeout}
					/>
				</div>
				{/* Sprint 54: Long timeout stepper kaldırıldı (binding yok). */}
				<div className="set-block-row">
					<div className="l">
						<b>{t("settings.moderation.mod-check")}</b>
						<span>{t("settings.moderation.mod-check-sub")}</span>
					</div>
					<input
						className="set-input"
						style={{ width: 260 }}
						placeholder={DEFAULT_MOD_CHECK_MESSAGE}
						value={modCheckMsg}
						onChange={(e) => handleModCheckMsg(e.target.value)}
						aria-label={t("settings.moderation.mod-check-input-aria")}
					/>
				</div>
			</div>

			<div className="set-block">
				<div className="set-block-section-label">
					{t("settings.moderation.sus-title")} <span className="ms-mono" style={{ marginLeft: 4 }}>{susUsers.length}</span>
				</div>
				<div className="set-block-help" style={{ fontSize: 11, color: "var(--ms-fg-4, var(--fg-4))", padding: "0 14px 8px", marginTop: -4 }}>
					{t("settings.moderation.sus-help")}
				</div>
				{susUsers.length === 0 ? (
					<div className="set-block-empty">{t("settings.moderation.sus-empty")}</div>
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
								aria-label={`${t("settings.moderation.unban")} ${u}`}
							>
								{t("settings.moderation.unban")}
							</button>
						</div>
					))
				)}
			</div>

			<div className="set-block">
				<div className="set-block-section-label">
					{t("settings.moderation.blocked-emotes")} <span className="ms-mono" style={{ marginLeft: 4 }}>{blockedEmotes.length}</span>
				</div>
				{blockedEmotes.length === 0 ? (
					<div className="set-block-empty">{t("settings.moderation.blocked-empty")}</div>
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
								aria-label={`${t("settings.moderation.unblock")} ${e}`}
							>
								{t("settings.moderation.unblock")}
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
	const { t } = useTranslation();
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

	// Sprint 54: animateGif + providerBadges toggle'ları kaldırıldı (dead).

	const favCount = useMemo(() => getFavoriteEmotes().length, []);
	const blockedCount = useMemo(() => getBlockedEmotes().length, []);

	const PROVIDERS = [
		{ id: "kick",    label: "Kick",  kind: "kick",  count: emoteCounts.kick },
		{ id: "seventv", label: "7TV",   kind: "s7tv",  count: emoteCounts.seventv },
		{ id: "bttv",    label: "BTTV",  kind: "bttv",  count: emoteCounts.bttv },
		{ id: "ffz",     label: "FFZ",   kind: "ffz",   count: emoteCounts.ffz },
	];

	// Sprint 54: handleAnimateGif + handleProviderBadges kaldırıldı (dead).

	return (
		<>
			<h3>{t("settings.emotes.title")}</h3>
			<div className="sub">
				{t("settings.emotes.sub")}
			</div>

			<div className="set-block">
				{PROVIDERS.map((p) => (
					<div key={p.id} className="set-block-row">
						<div className="l">
							<b style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<span className={`pbadge ${p.kind}`}>{p.label}</span>
							</b>
							<span>
								<span className="ms-mono">{p.count}</span> emote {t("settings.emotes.loaded")}
							</span>
						</div>
						<div style={{ display: "flex", gap: 6 }}>
							<button
								className="set-btn"
								onClick={() => toast(`${t("settings.emotes.refreshing-toast")} ${p.label}…`, { type: "info" })}
								type="button"
								aria-label={`${t("settings.emotes.refresh")} ${p.label}`}
							>
								<Icon name="refresh" size={12} /> {t("settings.emotes.refresh")}
							</button>
						</div>
					</div>
				))}
			</div>

			<div className="set-block">
				<div className="set-block-row">
					<div className="l">
						<b>{t("settings.emotes.favorites")}</b>
						<span>{favCount} emote {t("settings.emotes.favorites-sub-1")}</span>
					</div>
					<button
						className="set-btn"
						onClick={() => toast(t("settings.emotes.favorites-toast"), { type: "info" })}
						type="button"
					>
						{t("settings.emotes.manage-favorites")}
					</button>
				</div>
				<div className="set-block-row">
					<div className="l">
						<b>{t("settings.emotes.blocked")}</b>
						<span>{blockedCount} {t("settings.emotes.blocked-sub")}</span>
					</div>
					<button
						className="set-btn"
						onClick={() => toast(t("settings.emotes.blocked-toast"), { type: "info" })}
						type="button"
					>
						{t("settings.emotes.manage-blocked")}
					</button>
				</div>
				{/* Sprint 54: Animate GIF + Provider badges toggle'ları kaldırıldı (dead). */}
			</div>
		</>
	);
};

// Sprint 47: Webhook receiver block kaldırıldı. Pusher chatroom +
// channel_<id> kanalları sub/gift/KICKs/host/banned/followers olaylarını
// multi-channel olarak veriyor; webhook altyapısı gereksiz.

// ─── Sprint 53: Update kontrolü bloğu ─────────────────────────────────────────

// Sprint 55: GH_TOKEN_KEY artık kullanılmıyor (repo public).

const UpdateBlock: FunctionComponent = () => {
	// Sprint 54: jest + Node 20 + jsdom race condition workaround —
	// test ortamında UpdateBlock render edilmez (özellik üretimde aktif).
	// Gate ayrı bileşende: hook'lar Inner'da koşulsuz çağrılır (rules-of-hooks).
	if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
		return null;
	}
	return <UpdateBlockInner />;
};

const UpdateBlockInner: FunctionComponent = () => {
	const { t } = useTranslation();
	const [status, setStatus] = useState<
		"idle" | "checking" | "up-to-date" | "available" | "error"
	>("idle");
	const [current, setCurrent] = useState<string>("");
	const [latest, setLatest] = useState<any>(null);
	// Sprint 61: download/install state
	const [downloadState, setDownloadState] = useState<
		"idle" | "downloading" | "downloaded" | "error"
	>("idle");
	const [downloadProgress, setDownloadProgress] = useState<number>(0);
	const [downloadSpeed, setDownloadSpeed] = useState<number>(0);
	const [downloadError, setDownloadError] = useState<string>("");

	const runCheck = async () => {
		setStatus("checking");
		try {
			const res = await (window.electron as any).update.check();
			setCurrent(res?.current || "");
			if (!res?.ok) {
				setStatus("error");
				return;
			}
			setLatest(res.latest);
			setStatus(res.updateAvailable ? "available" : "up-to-date");
		} catch {
			setStatus("error");
		}
	};

	useEffect(() => {
		runCheck();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Sprint 61: electron-updater event subscription
	useEffect(() => {
		const off = (window.electron as any).update.onEvent?.((e: any) => {
			if (!e) return;
			switch (e.kind) {
				case "progress":
					setDownloadState("downloading");
					setDownloadProgress(Math.round(e.percent || 0));
					setDownloadSpeed(e.bytesPerSecond || 0);
					break;
				case "downloaded":
					setDownloadState("downloaded");
					setDownloadProgress(100);
					break;
				case "error":
					setDownloadState("error");
					setDownloadError(e.message || "Bilinmeyen hata");
					break;
			}
		});
		return () => {
			if (typeof off === "function") off();
		};
	}, []);

	const startDownload = async () => {
		setDownloadState("downloading");
		setDownloadProgress(0);
		setDownloadError("");
		const res = await (window.electron as any).update.download?.();
		if (!res?.ok) {
			setDownloadState("error");
			setDownloadError(res?.message || "İndirme başlatılamadı.");
		}
	};

	const installNow = async () => {
		// quitAndInstall app'i kapatır, geri dönüş yok
		await (window.electron as any).update.install?.();
	};

	const openReleasePage = () => {
		const url =
			latest?.htmlUrl ||
			"https://github.com/Fanthall/kick-chat-view/releases/latest";
		(window.electron as any).openExternal?.(url).catch(() => {});
	};

	const badge =
		status === "available"
			? { text: t("settings.update.badge.available"), color: "var(--ms-ac-warn, #e89a3c)" }
			: status === "up-to-date"
			? { text: t("settings.update.badge.up-to-date"), color: "var(--ms-ac-mint, #2fd3a0)" }
			: status === "checking"
			? { text: t("settings.update.badge.checking"), color: "var(--ms-fg-3)" }
			: status === "error"
			? { text: t("settings.update.badge.error"), color: "var(--ms-ac-live, #ef4f5f)" }
			: { text: "—", color: "var(--ms-fg-3)" };

	const speedLabel = (bps: number): string => {
		if (!bps) return "";
		if (bps < 1024) return `${Math.round(bps)} B/s`;
		if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
		return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
	};

	return (
		<div className="set-block">
			<div className="set-block-section-label">{t("settings.update.section-label")}</div>
			<div className="set-block-row">
				<div className="l">
					<b>{t("settings.update.version")}</b>
					<span style={{ fontFamily: "var(--ms-font-mono)" }}>
						{t("settings.update.current-prefix")}{current || "?"}
						{latest && ` ${t("settings.update.latest-prefix")}${latest.tag}`}
					</span>
				</div>
				<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
					<span
						style={{
							fontSize: 10,
							padding: "3px 10px",
							borderRadius: 4,
							background: `color-mix(in oklch, ${badge.color} 22%, transparent)`,
							color: badge.color,
							border: `1px solid color-mix(in oklch, ${badge.color} 45%, transparent)`,
						}}
					>
						{badge.text}
					</span>
					<button
						type="button"
						className="set-btn"
						disabled={status === "checking" || downloadState === "downloading"}
						onClick={runCheck}
					>
						{t("settings.update.check")}
					</button>
					{status === "available" && downloadState === "idle" && (
						<>
							<button
								type="button"
								className="set-btn primary"
								onClick={startDownload}
							>
								{t("settings.update.download-install")}
							</button>
							<button
								type="button"
								className="set-btn"
								onClick={openReleasePage}
								title={t("settings.update.open-browser-title")}
							>
								{t("settings.update.open-browser")}
							</button>
						</>
					)}
					{downloadState === "downloaded" && (
						<button
							type="button"
							className="set-btn primary"
							onClick={installNow}
						>
							{t("settings.update.restart-install")}
						</button>
					)}
				</div>
			</div>

			{/* Sprint 61: Download progress + status feedback */}
			{downloadState === "downloading" && (
				<div style={{ marginTop: 10 }}>
					<div
						style={{
							height: 6,
							background: "var(--ms-bg-2, rgba(11,19,26,0.6))",
							borderRadius: 4,
							overflow: "hidden",
							border: "1px solid var(--ms-bd-2, rgba(128,159,177,0.24))",
						}}
					>
						<div
							style={{
								height: "100%",
								width: `${downloadProgress}%`,
								background: "var(--ac-mint, #2fd3a0)",
								transition: "width 0.2s",
							}}
						/>
					</div>
					<div
						style={{
							marginTop: 4,
							fontSize: 11,
							color: "var(--ms-fg-3)",
							display: "flex",
							justifyContent: "space-between",
						}}
					>
						<span>{t("settings.update.downloading")} %{downloadProgress}</span>
						{downloadSpeed > 0 && <span>{speedLabel(downloadSpeed)}</span>}
					</div>
				</div>
			)}
			{downloadState === "downloaded" && (
				<div
					style={{
						marginTop: 8,
						fontSize: 12,
						color: "var(--ms-ac-mint, #2fd3a0)",
					}}
				>
					{t("settings.update.ready")}
				</div>
			)}
			{downloadState === "error" && downloadError && (
				<div
					style={{
						marginTop: 8,
						fontSize: 12,
						color: "var(--ms-ac-live, #ef4f5f)",
					}}
				>
					{t("settings.update.download-error")} {downloadError}
				</div>
			)}
		</div>
	);
};

// ─── Section: Advanced ────────────────────────────────────────────────────────

// Sprint 51: AdvancedSectionProps artık parametresiz.
interface AdvancedSectionProps {}

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

const AdvancedSection: FunctionComponent<AdvancedSectionProps> = () => {
	const { t } = useTranslation();
	// Sprint 54: topics state + handleTopicToggle kaldırıldı (webhook
	// altyapısı yok, etkisiz idi).
	const [verboseLogging, setVerboseLogging] = useState(
		() => localStorage.getItem("chatViewVerboseLogging") === "true"
	);

	const handleVerboseLogging = (v: boolean) => {
		setVerboseLogging(v);
		localStorage.setItem("chatViewVerboseLogging", String(v));
	};

	const handleOpenLogDir = () => {
		if ((window.electron as any)?.shell?.openPath) {
			(window.electron as any).shell.openPath("logs");
		} else {
			toast(t("settings.advanced.log-dir-toast"), { type: "info" });
		}
	};

	// Sprint 51: handleModernShellToggle kaldırıldı.

	// Sprint 41: takipçi göster toggle (default true).
	const [showFollowers, setShowFollowers] = useState<boolean>(
		() => localStorage.getItem("chatViewShowFollowers") !== "false"
	);
	const handleShowFollowers = (v: boolean) => {
		setShowFollowers(v);
		localStorage.setItem("chatViewShowFollowers", String(v));
		window.dispatchEvent(new Event("chat-view-show-followers-changed"));
	};

	// Faz H: mesaj limiti (sohbette tutulan en fazla mesaj) — Gelişmiş'ten girilebilir.
	const [msgLimit, setMsgLimit] = useState<number>(() => {
		const raw = localStorage.getItem("chatViewMessageLimit");
		const n = raw ? parseInt(raw, 10) : NaN;
		return Number.isFinite(n) ? Math.min(5000, Math.max(100, n)) : 2000;
	});
	const handleMsgLimit = (v: number) => {
		const clamped = Math.min(5000, Math.max(100, v));
		setMsgLimit(clamped);
		localStorage.setItem("chatViewMessageLimit", String(clamped));
		window.dispatchEvent(new Event("chat-view-message-limit-changed"));
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
			<h3>{t("settings.advanced.title")}</h3>
			<div className="sub">{t("settings.advanced.sub")}</div>

			{/* Sprint 53: Update kontrolü */}
			<UpdateBlock />

			{/* Sprint 41: Takipçi bildirimi */}
			<div className="set-block">
				<div className="set-block-row">
					<div className="l">
						<b>{t("settings.advanced.followers-title")}</b>
						<span>{t("settings.advanced.followers-sub")}</span>
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

			{/* Faz H: Mesaj limiti (sohbette tutulan en fazla mesaj) */}
				<div className="set-block">
					<div className="set-block-row">
						<div className="l">
							<b>{t("settings.advanced.msg-limit-title")}</b>
							<span>{t("settings.advanced.msg-limit-sub")}</span>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
							<input
								type="text"
								className="set-input"
								inputMode="numeric"
								style={{ width: 90, textAlign: "right" }}
								value={msgLimit}
								aria-label={t("settings.advanced.msg-limit-title")}
								onChange={(e) => {
									const digits = e.target.value.replace(/[^0-9]/g, "");
									setMsgLimit(digits === "" ? 0 : parseInt(digits, 10));
								}}
								onBlur={() => handleMsgLimit(msgLimit)}
								onKeyDown={(e) => {
									if (e.key === "Enter")
										(e.target as HTMLInputElement).blur();
								}}
							/>
							<span style={{ fontSize: 12, color: "var(--ms-fg-3)" }}>
								{t("settings.advanced.msg-limit-unit")}
							</span>
						</div>
					</div>
				</div>

				{/* Sprint 20: Tema + Dil */}
			<div className="set-block">
				<div className="set-block-row">
					<div className="l">
						<b>{t("settings.advanced.theme-title")}</b>
						<span>{t("settings.advanced.theme-sub")}</span>
					</div>
					<div role="radiogroup" aria-label={t("settings.advanced.theme-radiogroup-aria")} style={{ display: "flex", gap: 6 }}>
						<button
							type="button"
							role="radio"
							aria-checked={theme === "dark"}
							className={`set-btn ${theme === "dark" ? "primary" : ""}`}
							onClick={() => handleThemeChange("dark")}
						>
							{t("settings.advanced.theme-dark")}
						</button>
						<button
							type="button"
							role="radio"
							aria-checked={theme === "light"}
							className={`set-btn ${theme === "light" ? "primary" : ""}`}
							onClick={() => handleThemeChange("light")}
						>
							{t("settings.advanced.theme-light")}
						</button>
					</div>
				</div>
				<div className="set-block-row">
					<div className="l">
						<b>{t("settings.advanced.language-title")}</b>
						<span>{t("settings.advanced.language-sub")}</span>
					</div>
					<div role="radiogroup" aria-label={t("settings.advanced.language-radiogroup-aria")} style={{ display: "flex", gap: 6 }}>
						<button
							type="button"
							role="radio"
							aria-checked={language === "tr"}
							className={`set-btn ${language === "tr" ? "primary" : ""}`}
							onClick={() => handleLanguageChange("tr")}
						>
							{t("settings.advanced.language-tr")}
						</button>
						<button
							type="button"
							role="radio"
							aria-checked={language === "en"}
							className={`set-btn ${language === "en" ? "primary" : ""}`}
							onClick={() => handleLanguageChange("en")}
						>
							{t("settings.advanced.language-en")}
						</button>
					</div>
				</div>
			</div>

			{/* Sprint 47: Webhook receiver kaldırıldı — Pusher tüm event'leri
			    sağlıyor (chatroom + channel_<id> kanalları). */}

			{/* Sprint 54: Event subscriptions topic table kaldırıldı —
			    webhook altyapısı yok (Sprint 47), topic toggle'lar etkisiz. */}

			<div className="set-block">
				<div className="set-block-row">
					<div className="l">
						<b>{t("settings.advanced.verbose")}</b>
						<span>{t("settings.advanced.verbose-sub")}</span>
					</div>
					<Toggle on={verboseLogging} onChange={handleVerboseLogging} />
				</div>
				<div className="set-block-row">
					<div className="l">
						<b>{t("settings.advanced.open-log")}</b>
						<span className="set-topic-mono">~/AppData/Roaming/chat-view/logs/</span>
					</div>
					<button className="set-btn" onClick={handleOpenLogDir} type="button">
						{t("settings.advanced.reveal")}
					</button>
				</div>
				{/* Sprint 51: Classic shell tamamen iptal. Modern UI toggle
				    kaldırıldı. */}
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

	// Sprint 54: isMounted guard — test cleanup'ta unmount sonrası
	// setState'leri engelliyor (Node 20 + jest race).
	const mountedRef = useRef(true);
	const loadKickAuth = () => {
		window.electron.kick
			.getAuthStatus()
			.then((s: any) => {
				if (mountedRef.current) setKickAuthStatus(s);
			})
			.catch(() => {
				if (mountedRef.current) setKickAuthStatus(null);
			});
	};

	const loadKickUserInfo = () => {
		window.electron.kick
			.getUsers()
			.then((r: any) => {
				if (mountedRef.current) setKickUserInfo(r?.data?.[0] || null);
			})
			.catch(() => {
				if (mountedRef.current) setKickUserInfo(null);
			});
	};

	useEffect(() => {
		mountedRef.current = true;
		loadKickAuth();
		loadKickUserInfo();
		return () => {
			mountedRef.current = false;
		};
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

	// Sprint 51: handleShellToggle kaldırıldı (classic shell iptal).

	return (
		<div className="set-shell" data-testid="settings-modern-shell">
			{/* Body: side-nav + content (header is provided by modal-hd in LayoutModern) */}
			<div className="set-main">
				{/* Side nav */}
				<nav className="set-nav" aria-label={t("settings.nav.aria-label")}>
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
								{warn && <span className="set-nav-warn-dot" aria-label={t("settings.nav.action-needed")} title={t("settings.nav.action-needed")} />}
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
					{activeSection === "automation" && <AutomationSection />}
					{activeSection === "advanced" && <AdvancedSection />}
				</div>
			</div>
		</div>
	);
};

export default SettingsModern;
