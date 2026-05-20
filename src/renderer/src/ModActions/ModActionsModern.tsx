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
import Icon from "../Component/Icon/Icon";

// ─── Chat control keys ────────────────────────────────────────────────────────

interface ChatControl {
	key: string;
	label: string;
	storageKey: string;
}

const CHAT_CONTROLS: ChatControl[] = [
	{ key: "slow",       label: "Slow mode",        storageKey: "chatViewChatControl_slow" },
	{ key: "sub",        label: "Subscriber only",   storageKey: "chatViewChatControl_sub" },
	{ key: "follower",   label: "Follower only",     storageKey: "chatViewChatControl_follower" },
	{ key: "emote",      label: "Emote only",        storageKey: "chatViewChatControl_emote" },
	{ key: "r9k",        label: "R9K",               storageKey: "chatViewChatControl_r9k" },
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
			<span>{ctrl.label}</span>
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
					aria-label={`Toggle ${ctrl.label}`}
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
	const [selectedPreset, setSelectedPreset] = useState<number>(defaultSeconds);
	const [customSec, setCustomSec] = useState<string>("");
	const effective = customSec ? parseInt(customSec, 10) : selectedPreset;
	return (
		<div className="mod-timeout-picker">
			<div className="mod-timeout-picker-row">
				<span className="mod-timeout-picker-label">
					<Icon name="timeout" size={12} /> Timeout
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
					placeholder="custom"
					value={customSec}
					onChange={(e) => setCustomSec(e.target.value)}
					disabled={disabled}
					aria-label="Custom timeout seconds"
				/>
				<span className="mod-timeout-custom-unit">sec</span>
				<button
					type="button"
					className="mod-timeout-apply"
					onClick={() => effective > 0 && onApply(effective)}
					disabled={disabled || !effective || effective <= 0}
				>
					Apply
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

type SectionId = "selected" | "actions" | "controls" | "suspended";

const loadCollapsed = (): Record<SectionId, boolean> => {
	try {
		const raw = localStorage.getItem(SECTIONS_STORAGE_KEY);
		if (!raw) return { selected: false, actions: false, controls: false, suspended: false };
		return { selected: false, actions: false, controls: false, suspended: false, ...JSON.parse(raw) };
	} catch {
		return { selected: false, actions: false, controls: false, suspended: false };
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
			if (action.type === "ban") {
				entries.push({
					raw: action.user!.username,
					username: action.user!.username,
					reason: action.reason || "Banned",
					until: "Permanent",
					actorUsername,
					sourceAction: action,
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
				});
			}
			// "unban" / "delete" -> not suspended; skipped naturally because
			// latestByUser keeps only the most recent action per user.
		}
		// Sort: bans first (permanent), then by remaining time desc.
		return entries.sort((a, b) => {
			if (a.until === "Permanent" && b.until !== "Permanent") return -1;
			if (a.until !== "Permanent" && b.until === "Permanent") return 1;
			return 0;
		});
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

	// ─── Action handlers ─────────────────────────────────────────────────────────

	function runTimeout(seconds: number) {
		if (!selectedUser || !broadcasterUserId) {
			toast.warn("No user or channel selected for timeout.");
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
		window.electron.kick.banUser({
			broadcaster_user_id: broadcasterUserId,
			user_id: selectedUser.id,
		});
	}

	function handleClearMsgs() {
		// TODO: No existing IPC for clearing messages by user in last 30 min.
		// Deferred: requires a batch delete endpoint from Kick API (not yet in preload).
		toast.info("Clear msgs — not yet implemented (no batch delete IPC).");
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

	// ─── Meta line ───────────────────────────────────────────────────────────────
	const filteredModActions = messages.modAction.filter(
		(m) => !activeChannelSlug || m.channelSlug === activeChannelSlug
	);
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
					<Icon name="shield" size={14} ariaLabel="Moderation" />
					Moderation
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
							Selected user
						</button>
					</h3>
					<div
						id="mod-sec-selected"
						className="mod-section-body"
						hidden={collapsed.selected}
					>
					{selectedUser ? (
						<div className="mod-target" data-testid="mod-target-card">
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
								</div>
								<div className="mod-target-meta">
									{userMsgCount} msgs · {userTimeouts} timeouts
								</div>
							</div>
						</div>
					) : (
						<div className="mod-target-empty" data-testid="mod-target-empty">
							{canModerate
								? "Click a chat row to select a user"
								: "Viewer mode — moderation actions hidden"}
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
							Quick actions
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
								{" "}Ban
							</span>
							<span className="hint">permanent</span>
						</button>
						<button
							className="mod-btn"
							disabled={!selectedUser}
							onClick={handleClearMsgs}
							type="button"
							aria-label="Clear messages"
						>
							<span className="label">
								<Icon name="trash" size={12} />
								{" "}Clear msgs
							</span>
							<span className="hint">last 30 min</span>
						</button>
						<button
							className="mod-btn"
							disabled={!selectedUser}
							onClick={handleAddNote}
							type="button"
							aria-label="Add note"
						>
							<span className="label">
								<Icon name="pin" size={12} />
								{" "}Add note
							</span>
							<span className="hint">visible to mods</span>
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
								{" "}Promote
							</span>
							<span className="hint">→ VIP</span>
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
							Chat controls
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
							Suspended users
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
								No suspended users
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
									{entry.actorUsername && (
										<span
											className="reason"
											style={{
												fontSize: 10,
												color: "var(--ms-fg-4, var(--fg-4))",
											}}
										>
											by @{entry.actorUsername}
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
											Unban
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
