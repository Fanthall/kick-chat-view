/**
 * Sprint 5 — ModActionsModern: Modern moderation panel.
 *
 * Mirrors Designs/moderation.jsx structure:
 *   - Header: "Moderation" + shield icon + close X
 *   - Section 1: Selected user card (avatar initial, username, badges, meta)
 *   - Section 2: Quick actions 2-col grid (6 buttons)
 *   - Section 3: Chat controls 5 toggles (localStorage-backed, API stub)
 *   - Section 4: Suspended users list (localModerationStorage)
 *
 * IPC: window.electron.kick.timeoutUser / banUser (existing preload bridge).
 * Selected user: last modAction entry's user (mirrors classic ModActions pattern).
 * CONSTRAINT-4: badge HTML via buildBadgesHtml (sanitized).
 */

import React, {
	FunctionComponent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { toast } from "react-toastify";
import {
	useFanthalSelector,
} from "../../store/hooks/hooks";
import { ModMessage, User } from "../../util/chatInterface";
import { getActiveChannelSlug } from "../../util/channelSettings";
import { getDefaultTimeoutSeconds } from "../../util/chatCommands";
import { buildBadgesHtml } from "../../util/chatHtml";
import {
	getSuspendedUsers,
	LOCAL_MODERATION_SETTINGS_CHANGED,
	removeSuspendedUser,
} from "../../util/localModerationStorage";
import { useProfilePic } from "../../util/useProfilePic";
import { buildUserWindowPayload } from "../../util/userWindowPayload";
import { useTranslation } from "../../util/i18n";
import Icon from "../Component/Icon/Icon";

// ─── Chat control keys ────────────────────────────────────────────────────────

interface ChatControl {
	key: string;
	label: string;
	storageKey: string;
}

const CHAT_CONTROLS: ChatControl[] = [
	{ key: "slow",       label: "mod.controls.slow",        storageKey: "chatViewChatControl_slow" },
	{ key: "sub",        label: "mod.controls.sub",         storageKey: "chatViewChatControl_sub" },
	{ key: "follower",   label: "mod.controls.follower",    storageKey: "chatViewChatControl_follower" },
	{ key: "emote",      label: "mod.controls.emote",       storageKey: "chatViewChatControl_emote" },
	{ key: "r9k",        label: "mod.controls.r9k",         storageKey: "chatViewChatControl_r9k" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive a display-friendly first-seen string from mod actions for a user. */
function buildMetaLine(
	messages: ReturnType<typeof useFanthalSelector<(s: { messages: { modAction: any[] } }) => { modAction: any[] }>>,
	user: User
): string {
	// Count messages in messageList that match this user
	return `@${user.username}`;
}

// ─── Suspended user row type (just the raw string stored) ────────────────────

interface SuspendedEntry {
	raw: string;
	username: string;
	reason: string;
	until: string;
	/** Sprint 19: kim banladi (banned_by / unbanned_by sender). */
	actorUsername?: string;
	/** Sprint 19: kullanici detayi acmak icin gerekli ModMessage referansi. */
	sourceAction?: ModMessage;
	/** Sprint 29: aksiyon zamani (sort DESC + tarih gosterimi). */
	createdAt?: number;
}

/** Parse the raw localStorage string "username:reason:until" or just "username". */
function parseSuspended(raw: string): SuspendedEntry {
	const parts = raw.split(":");
	return {
		raw,
		username: parts[0] || raw,
		reason: parts[1] || "",
		until: parts[2] || "–",
	};
}

// ─── ChatToggle sub-component ─────────────────────────────────────────────────

const ChatToggle: FunctionComponent<{ ctrl: ChatControl }> = ({ ctrl }) => {
	const { t } = useTranslation();
	const [isOn, setIsOn] = useState(() => {
		return localStorage.getItem(ctrl.storageKey) === "on";
	});

	const toggle = () => {
		const next = !isOn;
		setIsOn(next);
		localStorage.setItem(ctrl.storageKey, next ? "on" : "off");
		// NOTE: Deferred — real Kick API integration for chat controls is future work.
		// There is currently no Kick API endpoint surfaced in the renderer preload
		// for slow-mode / sub-only / follower / emote / r9k toggles.
	};

	return (
		<div className="mod-list-row" style={{ cursor: "default" }}>
			<span>{t(ctrl.label)}</span>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<span
					className="mono num"
					style={{
						fontSize: 11,
						color: isOn ? "var(--ms-ac-mint, var(--ac-mint))" : "var(--ms-fg-4, var(--fg-4))",
					}}
				>
					{isOn ? "on" : "off"}
				</span>
				<button
					className={`mod-toggle${isOn ? " is-on" : ""}`}
					onClick={toggle}
					aria-label={`Toggle ${t(ctrl.label)}`}
					aria-pressed={isOn}
					type="button"
				/>
			</div>
		</div>
	);
};

// ─── Sprint 19: TimeoutPicker (chip presets + custom seconds input) ─────────

const TIMEOUT_PRESETS: { label: string; seconds: number }[] = [
	{ label: "1m", seconds: 60 },
	{ label: "5m", seconds: 300 },
	{ label: "10m", seconds: 600 },
	{ label: "30m", seconds: 1800 },
	{ label: "1h", seconds: 3600 },
];

const formatSeconds = (sec: number): string => {
	if (!Number.isFinite(sec) || sec <= 0) return "—";
	if (sec < 60) return `${sec}s`;
	if (sec % 3600 === 0) return `${sec / 3600}h`;
	if (sec % 60 === 0) return `${sec / 60}m`;
	const m = Math.floor(sec / 60);
	const s = sec % 60;
	return `${m}m ${s}s`;
};

const TimeoutPicker: FunctionComponent<{
	disabled: boolean;
	defaultSeconds: number;
	onApply: (seconds: number) => void;
}> = ({ disabled, defaultSeconds, onApply }) => {
	const { t } = useTranslation();
	const [selectedPreset, setSelectedPreset] = useState<number>(defaultSeconds);
	const [customSec, setCustomSec] = useState<string>("");
	const effective = customSec ? parseInt(customSec, 10) : selectedPreset;
	return (
		<div className="mod-timeout-picker">
			<div className="mod-timeout-picker-row">
				<span className="mod-timeout-picker-label">
					<Icon name="timeout" size={12} /> {t("mod.timeout")}
				</span>
				<span className="mod-timeout-picker-current mono">
					{formatSeconds(effective)}
				</span>
			</div>
			<div className="mod-timeout-chips">
				{TIMEOUT_PRESETS.map((p) => (
					<button
						key={p.seconds}
						type="button"
						className={`mod-timeout-chip ${
							!customSec && selectedPreset === p.seconds ? "is-active" : ""
						}`}
						onClick={() => {
							setSelectedPreset(p.seconds);
							setCustomSec("");
						}}
						disabled={disabled}
					>
						{p.label}
					</button>
				))}
			</div>
			<div className="mod-timeout-custom">
				<input
					type="number"
					min={1}
					placeholder={t("mod.timeout.custom")}
					value={customSec}
					onChange={(e) => setCustomSec(e.target.value)}
					disabled={disabled}
					aria-label="Custom timeout seconds"
				/>
				<span className="mod-timeout-custom-unit">{t("mod.timeout.seconds")}</span>
				<button
					type="button"
					className="mod-timeout-apply"
					onClick={() => effective > 0 && onApply(effective)}
					disabled={disabled || !effective || effective <= 0}
				>
					{t("mod.timeout.apply")}
				</button>
			</div>
			<div className="mod-timeout-hint">
				Ctrl+T = {formatSeconds(defaultSeconds)} · Ctrl+Shift+T = 10m
			</div>
		</div>
	);
};

// ─── Collapsible section state (Sprint 10) ───────────────────────────────────

const SECTIONS_STORAGE_KEY = "chatViewModSections";

type SectionId = "selected" | "actions" | "controls" | "suspended" | "history";

const defaultCollapsed: Record<SectionId, boolean> = {
	selected: false,
	actions: false,
	controls: false,
	suspended: false,
	history: true, // Sprint 21: default kapalı (yer kaplamasın)
};

const loadCollapsed = (): Record<SectionId, boolean> => {
	try {
		const raw = localStorage.getItem(SECTIONS_STORAGE_KEY);
		if (!raw) return { ...defaultCollapsed };
		return { ...defaultCollapsed, ...JSON.parse(raw) };
	} catch {
		return { ...defaultCollapsed };
	}
};

const saveCollapsed = (state: Record<SectionId, boolean>) => {
	try {
		localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(state));
	} catch {
		/* ignore */
	}
};

// ─── Main component ───────────────────────────────────────────────────────────

interface ModActionsModernProps {
	onClose?: () => void;
	/** Sprint 10: gate write-actions when user isn't owner/mod. */
	isOwner?: boolean;
	isMod?: boolean;
	/**
	 * Sprint 11: EXPLICIT selected user (set via ChatModern right-click).
	 * When undefined -> empty state; previously fell back to modAction[last]
	 * which caused stale auto-select.
	 */
	selectedUser?: User;
	/** Optional clear handler so the X / clear button can reset state. */
	onClearSelected?: () => void;
	/** Sprint 14: true when rendered inside a pop-out BrowserWindow. */
	isPopOut?: boolean;
}

// Sprint 15: avatar helper — fetches profile_pic by slug, falls back to letter.
const ModTargetAvatar: FunctionComponent<{ slug: string; letter: string }> = ({
	slug,
	letter,
}) => {
	const pic = useProfilePic(slug);
	return (
		<div className="mod-target-ava" aria-hidden="true">
			{pic ? (
				<img
					src={pic}
					alt=""
					loading="lazy"
					referrerPolicy="no-referrer"
					onError={(e) => {
						(e.currentTarget as HTMLImageElement).style.display = "none";
					}}
				/>
			) : (
				letter
			)}
		</div>
	);
};

const ModActionsModern: FunctionComponent<ModActionsModernProps> = ({
	onClose,
	isOwner = false,
	isMod = false,
	selectedUser: explicitSelectedUser,
	onClearSelected,
	isPopOut = false,
}) => {
	const { t } = useTranslation();
	const canModerate = isOwner || isMod;
	const [collapsed, setCollapsed] = useState<Record<SectionId, boolean>>(loadCollapsed);
	const toggleSection = (id: SectionId) => {
		setCollapsed((prev) => {
			const next = { ...prev, [id]: !prev[id] };
			saveCollapsed(next);
			return next;
		});
	};
	const messages = useFanthalSelector((state) => state.messages);
	const channelBadges = useFanthalSelector((state) => state.messages.channelBadges);
	const activeChannelSlug = getActiveChannelSlug();

	// Sprint 11: prefer EXPLICIT prop. modAction[last] fallback removed —
	// it was auto-selecting any user after a mod event, regardless of intent.
	const selectedUser: User | undefined = explicitSelectedUser;

	// Sprint 18: Suspended users — derived from chat mod actions (ban / timeout)
	// rather than the manually-maintained Settings list. Shows users currently
	// restricted in the active channel, with reason + remaining duration.

	// Re-render on ticking clock so timeout countdowns stay fresh (every 10s).
	const [, setTick] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setTick((v) => v + 1), 10_000);
		return () => clearInterval(id);
	}, []);

	const suspendedList: SuspendedEntry[] = useMemo(() => {
		const channelFilter = (item: { channelSlug?: string }) =>
			!activeChannelSlug || item.channelSlug === activeChannelSlug;
		const filtered = messages.modAction.filter(channelFilter);
		// Group by lowercase username; keep latest action per user.
		const latestByUser = new Map<string, ModMessage>();
		for (const action of filtered) {
			const uname = action.user?.username?.toLowerCase();
			if (!uname) continue;
			const prev = latestByUser.get(uname);
			if (!prev || Number(action.created_at) > Number(prev.created_at)) {
				latestByUser.set(uname, action);
			}
		}
		const now = Date.now();
		const formatUntil = (expiresAt?: string): string => {
			if (!expiresAt) return "Permanent";
			const ts = new Date(expiresAt).getTime();
			if (!Number.isFinite(ts)) return "Permanent";
			const diffMs = ts - now;
			if (diffMs <= 0) return "expired";
			const sec = Math.floor(diffMs / 1000);
			if (sec < 60) return `${sec}s`;
			const min = Math.floor(sec / 60);
			const remSec = sec % 60;
			if (min < 60) return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
			const h = Math.floor(min / 60);
			const remMin = min % 60;
			return remMin > 0 ? `${h}h ${remMin}m` : `${h}h`;
		};
		const entries: SuspendedEntry[] = [];
		for (const action of latestByUser.values()) {
			const actorUsername = action.banned_by?.username;
			const createdAt = Number(action.created_at) || undefined;
			if (action.type === "ban") {
				entries.push({
					raw: action.user!.username,
					username: action.user!.username,
					reason: action.reason || "Banned",
					until: "Permanent",
					actorUsername,
					sourceAction: action,
					createdAt,
				});
			} else if (action.type === "to") {
				const until = formatUntil(action.expires_at);
				if (until === "expired") continue;
				entries.push({
					raw: action.user!.username,
					username: action.user!.username,
					reason: action.reason || "Timed out",
					until,
					actorUsername,
					sourceAction: action,
					createdAt,
				});
			}
			// "unban" / "delete" -> not suspended; skipped naturally because
			// latestByUser keeps only the most recent action per user.
		}
		// Sprint 29: yeni gelen aksiyonlar EN UST'te. created_at DESC.
		// (Permanent ban vs timeout sirasi koruma istemiyoruz; tarih ana
		// kriter; user istegi: "en yeni en ustte, scrolda hep en ust".)
		return entries.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [messages.modAction, activeChannelSlug]);

	// Legacy refresh hook kept for the LOCAL_MODERATION_SETTINGS_CHANGED event
	// (pop-out window sync writes to localStorage and dispatches it) — we don't
	// actually read from localStorage anymore, but a benign no-op listener
	// avoids the dangling event subscriber.
	const refreshSuspended = useCallback(() => {
		setTick((v) => v + 1);
	}, []);

	useEffect(() => {
		window.addEventListener(LOCAL_MODERATION_SETTINGS_CHANGED, refreshSuspended);
		return () => {
			window.removeEventListener(LOCAL_MODERATION_SETTINGS_CHANGED, refreshSuspended);
		};
	}, [refreshSuspended]);

	// Keyboard shortcuts: Ctrl+T = default timeout, Ctrl+Shift+T = 10-min timeout
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (!e.ctrlKey) return;
			if (e.key === "T" && e.shiftKey) {
				e.preventDefault();
				handleLongTimeout();
			} else if (e.key === "t" && !e.shiftKey) {
				e.preventDefault();
				handleDefaultTimeout();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedUser, activeChannelSlug, messages.streamMetaByChannel]);

	// ─── Broadcaster user ID lookup ─────────────────────────────────────────────
	const broadcasterUserId: number | undefined =
		activeChannelSlug
			? messages.streamMetaByChannel[activeChannelSlug]?.broadcasterUserId
			: undefined;

	// ─── Sprint 26: Protected target guard ─────────────────────────────────────
	// Self / channel owner / mod / admin / staff -> reject early.
	function protectedTargetReason(target: User | undefined): string | null {
		if (!target) return null;
		const ownName = (localStorage.getItem("username") || "").toLowerCase();
		if (ownName && target.username.toLowerCase() === ownName) {
			return "Kendine mod aksiyonu yapamazsin.";
		}
		const streamMeta = activeChannelSlug
			? messages.streamMetaByChannel[activeChannelSlug]
			: undefined;
		if (
			streamMeta?.broadcasterUserId &&
			target.id === streamMeta.broadcasterUserId
		) {
			return "Kanal sahibine mod aksiyonu yapilamaz.";
		}
		const badges = target.identity?.badges || [];
		const protectedRoles = [
			"broadcaster",
			"moderator",
			"admin",
			"staff",
			"global_mod",
		];
		const hasProtected = badges.some((b) =>
			protectedRoles.includes((b.type || "").toLowerCase())
		);
		if (hasProtected) {
			return "Bu kullanicinin rolu mod aksiyonlarina karsi korumali.";
		}
		return null;
	}

	// ─── Action handlers ─────────────────────────────────────────────────────────

	function runTimeout(seconds: number) {
		if (!selectedUser || !broadcasterUserId) {
			toast.warn("No user or channel selected for timeout.");
			return;
		}
		const guard = protectedTargetReason(selectedUser);
		if (guard) {
			toast.warn(guard);
			return;
		}
		if (!Number.isFinite(seconds) || seconds <= 0) {
			toast.warn("Timeout duration must be > 0 seconds.");
			return;
		}
		window.electron.kick.timeoutUser({
			broadcaster_user_id: broadcasterUserId,
			user_id: selectedUser.id,
			duration: seconds,
		});
	}

	function handleDefaultTimeout() {
		runTimeout(getDefaultTimeoutSeconds());
	}

	function handleLongTimeout() {
		runTimeout(600); // 10 minutes
	}

	function handleBan() {
		if (!selectedUser || !broadcasterUserId) {
			toast.warn("No user or channel selected for ban.");
			return;
		}
		const guard = protectedTargetReason(selectedUser);
		if (guard) {
			toast.warn(guard);
			return;
		}
		window.electron.kick.banUser({
			broadcaster_user_id: broadcasterUserId,
			user_id: selectedUser.id,
		});
	}

	function handleClearMsgs() {
		// Sprint 26: Kick public API'sinde toplu (user-bazli son N dakika)
		// delete endpoint'i mevcut degil. Tek IPC bulundu: deleteChatMessage
		// (mesaj id'si ile). Mevcut kullanicinin son N mesajini iterate edip
		// tek tek silmek mumkun ama spam-prone. Acik bir not gosterip uyaralim
		// ve gercek implementasyonu defer edelim.
		toast.warn(
			"Clear msgs: Kick API'sinde toplu silme yok. Mesaj uzerinde sag tik -> Sil ile tek tek silebilirsin."
		);
	}

	function handleAddNote() {
		// TODO: No persistent note storage IPC. Deferred to future sprint.
		toast.info("Add note — not yet implemented.");
	}

	function handlePromote() {
		// TODO: No VIP promote endpoint in preload. Deferred to future sprint.
		toast.info("Promote — not yet implemented.");
	}

	function openSuspendedUser(entry: SuspendedEntry) {
		// Sprint 19: cift tik / sag tik suspended row -> User Detail penceresi ac.
		const action = entry.sourceAction;
		if (!action?.user) {
			toast.warn("Kullanici bilgisi cikartilamadi.");
			return;
		}
		try {
			const payload = buildUserWindowPayload({
				user: action.user,
				messages: messages.messageList,
				modActions: messages.modAction,
				openedFrom: "moderation",
				channelName: activeChannelSlug || undefined,
				canModerateChannel: canModerate,
			});
			window.electron.userWindow.open(payload);
		} catch (err: any) {
			toast.error(err?.message || "User window acilamadi.");
		}
	}

	function handleUnban(entry: SuspendedEntry) {
		// Sprint 18: list now derived from modAction. Unban → actual Kick API
		// unban call. Find the modAction entry to recover user_id.
		const modEntry = messages.modAction.find(
			(m) =>
				m.user?.username?.toLowerCase() === entry.username.toLowerCase() &&
				(!activeChannelSlug || m.channelSlug === activeChannelSlug)
		);
		const userId = modEntry?.user?.id;
		if (!broadcasterUserId || !userId) {
			toast.warn("Channel veya kullanici id'si bulunamadi.");
			return;
		}
		window.electron.kick
			.unbanUser({ broadcaster_user_id: broadcasterUserId, user_id: userId })
			.then(() => toast.success(`@${entry.username} unbanlandi.`))
			.catch((err: any) =>
				toast.error(err?.message || "Unban basarisiz.")
			);
		// Backwards compat: classic susUsers listesinden de cikar (no-op if not present)
		removeSuspendedUser(entry.raw);
	}

	// ─── Badge HTML (CONSTRAINT-4: sanitized via buildBadgesHtml) ────────────────
	const badgesHtml = selectedUser?.identity?.badges
		? buildBadgesHtml(selectedUser.identity.badges, channelBadges)
		: "";

	// ─── Filtered mod actions for this channel ──────────────────────────────────
	const filteredModActions = messages.modAction.filter(
		(m) => !activeChannelSlug || m.channelSlug === activeChannelSlug
	);

	// Sprint 21: selected user banlı mı? (Selected user card için Ban/Unban toggle)
	const selectedUserIsBanned = useMemo(() => {
		if (!selectedUser) return false;
		const uname = selectedUser.username.toLowerCase();
		// Latest action on this user
		let latest: ModMessage | undefined;
		for (const action of filteredModActions) {
			if (!action.user?.username) continue;
			if (action.user.username.toLowerCase() !== uname) continue;
			if (!latest || Number(action.created_at) > Number(latest.created_at)) {
				latest = action;
			}
		}
		if (!latest) return false;
		if (latest.type === "ban") return true;
		if (latest.type === "to" && latest.expires_at) {
			return new Date(latest.expires_at).getTime() > Date.now();
		}
		return false;
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedUser, filteredModActions.length]);

	function handleSelectedUnban() {
		if (!selectedUser || !broadcasterUserId) return;
		window.electron.kick
			.unbanUser({
				broadcaster_user_id: broadcasterUserId,
				user_id: selectedUser.id,
			})
			.then(() => toast.success(`@${selectedUser.username} unbanlandi.`))
			.catch((err: any) =>
				toast.error(err?.message || "Unban basarisiz.")
			);
	}

	// Sprint 28: Son 50 mod aksiyonu — FIFO; section kendi icinde scroll
	// edilebilir oldugundan uzun log gosterimi a UX bozulmadan calisir.
	// Sinir bilincli: cok eski aksiyonlar (>50) sessizce dusurulur.
	const recentActions = useMemo(() => {
		return filteredModActions
			.slice()
			.sort((a, b) => Number(b.created_at) - Number(a.created_at))
			.slice(0, 50);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filteredModActions.length]);

	function openModAction(action: ModMessage) {
		if (!action.user) return;
		try {
			const payload = buildUserWindowPayload({
				user: action.user,
				messages: messages.messageList,
				modActions: messages.modAction,
				openedFrom: "moderation",
				channelName: activeChannelSlug || undefined,
				canModerateChannel: canModerate,
			});
			window.electron.userWindow.open(payload);
		} catch (err: any) {
			toast.error(err?.message || "User window acilamadi.");
		}
	}

	// ─── Meta line ───────────────────────────────────────────────────────────────
	const userTimeouts = selectedUser
		? filteredModActions.filter(
			(m) => (m.type === "to") && m.user?.id === selectedUser.id
		).length
		: 0;
	const userMsgCount = selectedUser
		? messages.messageList.filter(
			(m) => !activeChannelSlug || m.channelSlug === activeChannelSlug
		).filter((m) => m.sender.id === selectedUser.id).length
		: 0;

	const defaultSeconds = getDefaultTimeoutSeconds();

	return (
		<div
			className="panel"
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100%",
				overflow: "hidden",
			}}
		>
			{/* Header */}
			<div className="panel-hd">
				<h2 style={{ display: "flex", alignItems: "center", gap: 6 }}>
					<Icon name="shield" size={14} ariaLabel={t("mod.title")} />
					{t("mod.title")}
				</h2>
				<div className="panel-hd-actions">
					{!isPopOut && (
						<button
							className="icon-btn"
							title="Open in new window"
							aria-label="Open moderation panel in new window"
							type="button"
							onClick={() => {
								window.electron?.panelWindow?.open("moderation");
							}}
						>
							<Icon name="popOut" size={13} />
						</button>
					)}
					{onClose && (
						<button
							className="icon-btn"
							onClick={onClose}
							title="Collapse"
							type="button"
							aria-label="Close moderation panel"
						>
							<Icon name="x" size={13} />
						</button>
					)}
				</div>
			</div>

			{/* Scrollable body */}
			<div
				className="scroll"
				style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}
			>
				{/* Section 1: Selected user */}
				<div className={`mod-section${collapsed.selected ? " is-collapsed" : ""}`}>
					<h3>
						<button
							type="button"
							className="mod-section-toggle"
							aria-expanded={!collapsed.selected}
							aria-controls="mod-sec-selected"
							onClick={() => toggleSection("selected")}
						>
							<Icon name={collapsed.selected ? "chevron" : "chevd"} size={10} />
							{t("mod.section.selected")}
						</button>
					</h3>
					<div
						id="mod-sec-selected"
						className="mod-section-body"
						hidden={collapsed.selected}
					>
					{selectedUser ? (
						<div className="mod-target" data-testid="mod-target-card">
							{/* Sprint 37: clear selected user (X) — selected kartının
							    sağ üst köşesinde. onClearSelected pop-out içinde de
							    çağrılır; pop-out'tan ana pencereye temizleme isteği
							    ipcRenderer üzerinden gönderiliyor. */}
							{onClearSelected && (
								<button
									type="button"
									className="mod-target-clear"
									title={t("mod.clear-selected") || "Seçimi temizle"}
									aria-label="Clear selected user"
									data-testid="mod-target-clear"
									onClick={() => {
										onClearSelected();
										if (isPopOut) {
											try {
												window.electron?.ipcRenderer?.sendMessage(
													"panel-window:clear-mod-target" as any
												);
											} catch {
												/* ignore */
											}
										}
									}}
								>
									<Icon name="x" size={11} />
								</button>
							)}
							<ModTargetAvatar
								slug={selectedUser.slug || selectedUser.username}
								letter={selectedUser.username[0]?.toUpperCase() ?? "?"}
							/>
							<div className="mod-target-info">
								<div className="mod-target-name">
									{selectedUser.username}
									{badgesHtml && (
										<span
											dangerouslySetInnerHTML={{ __html: badgesHtml }}
											style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
										/>
									)}
									{selectedUserIsBanned && (
										<span
											className="mod-target-status"
											title="Su an kisitli"
										>
											kisitli
										</span>
									)}
								</div>
								<div className="mod-target-meta">
									{userMsgCount} msgs · {userTimeouts} timeouts
								</div>
								<div
									style={{
										marginTop: 6,
										display: "flex",
										gap: 6,
										flexWrap: "wrap",
									}}
								>
									<button
										type="button"
										className="mod-target-detail"
										onClick={() => {
											if (!selectedUser) return;
											try {
												const payload = buildUserWindowPayload({
													user: selectedUser,
													messages: messages.messageList,
													modActions: messages.modAction,
													openedFrom: "moderation",
													channelName: activeChannelSlug || undefined,
													canModerateChannel: canModerate,
												});
												window.electron.userWindow.open(payload);
											} catch (err: any) {
												toast.error(err?.message || "User window acilamadi.");
											}
										}}
										aria-label={`Open detail for ${selectedUser.username}`}
									>
										<Icon name="user" size={11} /> {t("mod.detail")}
									</button>
									{canModerate && selectedUserIsBanned && (
										<button
											type="button"
											className="mod-target-unban"
											onClick={handleSelectedUnban}
											aria-label={`Unban ${selectedUser.username}`}
										>
											<Icon name="check" size={11} /> {t("mod.unban")}
										</button>
									)}
								</div>
							</div>
						</div>
					) : (
						<div className="mod-target-empty" data-testid="mod-target-empty">
							{canModerate
								? t("mod.empty.click-row")
								: t("mod.empty.viewer")}
						</div>
					)}
					</div>
				</div>

				{/* Section 2: Quick actions — only when user can moderate */}
				{canModerate && (
				<div className={`mod-section${collapsed.actions ? " is-collapsed" : ""}`}>
					<h3>
						<button
							type="button"
							className="mod-section-toggle"
							aria-expanded={!collapsed.actions}
							aria-controls="mod-sec-actions"
							onClick={() => toggleSection("actions")}
						>
							<Icon name={collapsed.actions ? "chevron" : "chevd"} size={10} />
							{t("mod.section.actions")}
						</button>
						{selectedUser && (
							<span
								style={{
									color: "var(--ms-fg-4, var(--fg-4))",
									textTransform: "none",
									letterSpacing: 0,
									fontSize: 11,
									fontWeight: 400,
								}}
							>
								on @{selectedUser.username}
							</span>
						)}
					</h3>
					<div
						id="mod-sec-actions"
						className="mod-section-body"
						hidden={collapsed.actions}
					>
					<TimeoutPicker
						disabled={!selectedUser}
						defaultSeconds={defaultSeconds}
						onApply={(sec) => runTimeout(sec)}
					/>
					<div className="mod-grid" style={{ marginTop: 8 }}>
						<button
							className="mod-btn danger"
							disabled={!selectedUser}
							onClick={handleBan}
							type="button"
							aria-label="Ban user"
						>
							<span className="label">
								<Icon name="ban" size={12} />
								{" "}{t("mod.ban")}
							</span>
							<span className="hint">{t("mod.ban.permanent")}</span>
						</button>
						{/* Sprint 27: Clear msgs butonu kaldirildi (toplu API yok;
						    tek mesaj silmek icin chat satirinda Trash ikonu var). */}
						<button
							className="mod-btn"
							disabled={!selectedUser}
							onClick={handleAddNote}
							type="button"
							aria-label="Add note"
						>
							<span className="label">
								<Icon name="pin" size={12} />
								{" "}{t("mod.note")}
							</span>
							<span className="hint">{t("mod.note.hint")}</span>
						</button>
						<button
							className="mod-btn"
							disabled={!selectedUser}
							onClick={handlePromote}
							type="button"
							aria-label="Promote user"
						>
							<span className="label">
								<Icon name="shield" size={12} />
								{" "}{t("mod.promote")}
							</span>
							<span className="hint">{t("mod.promote.hint")}</span>
						</button>
					</div>
					</div>
				</div>
				)}

				{/* Section 3: Chat controls — only when user can moderate */}
				{canModerate && (
				<div className={`mod-section${collapsed.controls ? " is-collapsed" : ""}`}>
					<h3>
						<button
							type="button"
							className="mod-section-toggle"
							aria-expanded={!collapsed.controls}
							aria-controls="mod-sec-controls"
							onClick={() => toggleSection("controls")}
						>
							<Icon name={collapsed.controls ? "chevron" : "chevd"} size={10} />
							{t("mod.section.controls")}
						</button>
					</h3>
					<div
						id="mod-sec-controls"
						className="mod-section-body mod-list"
						hidden={collapsed.controls}
					>
						{CHAT_CONTROLS.map((ctrl) => (
							<ChatToggle key={ctrl.key} ctrl={ctrl} />
						))}
					</div>
				</div>
				)}

				{/* Section 3.5: Recent mod actions (Sprint 21) — log of all actions
				    (ban / unban / timeout / delete) for the active channel. */}
				<div className={`mod-section${collapsed.history ? " is-collapsed" : ""}`}>
					<h3>
						<button
							type="button"
							className="mod-section-toggle"
							aria-expanded={!collapsed.history}
							aria-controls="mod-sec-history"
							onClick={() => toggleSection("history")}
						>
							<Icon name={collapsed.history ? "chevron" : "chevd"} size={10} />
							{t("mod.section.history")}
						</button>
						<span
							className="mono num"
							style={{
								textTransform: "none",
								letterSpacing: 0,
								color: "var(--ms-fg-4, var(--fg-4))",
								fontSize: 11,
								fontWeight: 400,
							}}
						>
							{recentActions.length}
						</span>
					</h3>
					<div
						id="mod-sec-history"
						className="mod-list mod-section-body"
						hidden={collapsed.history}
					>
						{recentActions.length === 0 && (
							<div
								style={{
									fontSize: 11,
									color: "var(--ms-fg-4, var(--fg-4))",
									textAlign: "center",
									padding: "8px 0",
								}}
							>
								{t("mod.history.empty")}
							</div>
						)}
						{recentActions.map((action) => {
							const actor =
								action.banned_by?.username ||
								action.unbanned_by?.username ||
								"system";
							// Sprint 29: gun + saat birlikte (uzun listede tarih
							// gozukmedikce belirsizdi).
							const tStr = action.created_at
								? new Date(Number(action.created_at)).toLocaleString(
										undefined,
										{
											day: "2-digit",
											month: "2-digit",
											hour: "2-digit",
											minute: "2-digit",
										}
								  )
								: "";
							return (
								<div
									key={action.id}
									className="mod-list-row mod-list-row-clickable"
									onDoubleClick={() => openModAction(action)}
									onContextMenu={(e) => {
										e.preventDefault();
										openModAction(action);
									}}
									title="Cift tik veya sag tik: kullanici detayini ac"
								>
									<div
										style={{
											display: "flex",
											flexDirection: "column",
											gap: 2,
										}}
									>
										<span style={{ color: "var(--ms-fg-1, var(--fg-1))" }}>
											<span className={`mod-action-tag mod-action-${action.type}`}>
												{action.type === "to"
													? "TIMEOUT"
													: action.type.toUpperCase()}
											</span>{" "}
											{action.user?.username || "?"}
										</span>
										<span
											className="reason"
											style={{
												fontSize: 10,
												color: "var(--ms-fg-4, var(--fg-4))",
											}}
										>
											by @{actor} · {tStr}
											{action.reason ? ` · ${action.reason}` : ""}
										</span>
									</div>
								</div>
							);
						})}
					</div>
				</div>

				{/* Section 4: Suspended users — visible to everyone (read-only for viewers) */}
				<div className={`mod-section${collapsed.suspended ? " is-collapsed" : ""}`}>
					<h3>
						<button
							type="button"
							className="mod-section-toggle"
							aria-expanded={!collapsed.suspended}
							aria-controls="mod-sec-suspended"
							onClick={() => toggleSection("suspended")}
						>
							<Icon name={collapsed.suspended ? "chevron" : "chevd"} size={10} />
							{t("mod.section.suspended")}
						</button>
						<span
							className="mono num"
							style={{
								textTransform: "none",
								letterSpacing: 0,
								color: "var(--ms-fg-4, var(--fg-4))",
								fontSize: 11,
								fontWeight: 400,
							}}
						>
							{suspendedList.length}
						</span>
					</h3>
					<div
						id="mod-sec-suspended"
						className="mod-list mod-section-body"
						data-testid="suspended-list"
						hidden={collapsed.suspended}
					>
						{suspendedList.length === 0 && (
							<div
								style={{
									fontSize: 11,
									color: "var(--ms-fg-4, var(--fg-4))",
									textAlign: "center",
									padding: "8px 0",
								}}
							>
								{t("mod.no-suspended")}
							</div>
						)}
						{suspendedList.map((entry) => (
							<div
								key={entry.raw}
								className="mod-list-row mod-list-row-clickable"
								data-testid={`suspended-row-${entry.username}`}
								onDoubleClick={() => openSuspendedUser(entry)}
								onContextMenu={(e) => {
									e.preventDefault();
									openSuspendedUser(entry);
								}}
								title="Cift tik veya sag tik: kullanici detayini ac"
							>
								<div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
									<span style={{ color: "var(--ms-fg-1, var(--fg-1))" }}>
										{entry.username}
									</span>
									{entry.reason && (
										<span className="reason">{entry.reason}</span>
									)}
									{(entry.actorUsername || entry.createdAt) && (
										<span
											className="reason"
											style={{
												fontSize: 10,
												color: "var(--ms-fg-4, var(--fg-4))",
											}}
										>
											{entry.actorUsername && `by @${entry.actorUsername}`}
											{entry.actorUsername && entry.createdAt && " · "}
											{entry.createdAt &&
												new Date(entry.createdAt).toLocaleString(undefined, {
													day: "2-digit",
													month: "2-digit",
													hour: "2-digit",
													minute: "2-digit",
												})}
										</span>
									)}
								</div>
								<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
									{entry.until !== "–" && (
										<span
											className="mono num"
											style={{ fontSize: 11, color: "var(--ms-fg-3, var(--fg-3))" }}
										>
											{entry.until}
										</span>
									)}
									{canModerate && (
										<button
											className="btn ghost"
											style={{ padding: "3px 6px", fontSize: 11 }}
											onClick={() => handleUnban(entry)}
											type="button"
											aria-label={`Unban ${entry.username}`}
										>
											{t("mod.unban.btn")}
										</button>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
};

export default ModActionsModern;
