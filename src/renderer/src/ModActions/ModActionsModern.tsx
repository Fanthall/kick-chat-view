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
	useState,
} from "react";
import { toast } from "react-toastify";
import {
	useFanthalSelector,
} from "../../store/hooks/hooks";
import { User } from "../../util/chatInterface";
import { getActiveChannelSlug } from "../../util/channelSettings";
import { getDefaultTimeoutSeconds } from "../../util/chatCommands";
import { buildBadgesHtml } from "../../util/chatHtml";
import {
	getSuspendedUsers,
	LOCAL_MODERATION_SETTINGS_CHANGED,
	removeSuspendedUser,
} from "../../util/localModerationStorage";
import { useProfilePic } from "../../util/useProfilePic";
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

	// Suspended users
	const [suspendedList, setSuspendedList] = useState<SuspendedEntry[]>(() =>
		getSuspendedUsers().map(parseSuspended)
	);

	const refreshSuspended = useCallback(() => {
		setSuspendedList(getSuspendedUsers().map(parseSuspended));
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

	function handleDefaultTimeout() {
		if (!selectedUser || !broadcasterUserId) {
			toast.warn("No user or channel selected for timeout.");
			return;
		}
		const seconds = getDefaultTimeoutSeconds();
		window.electron.kick.timeoutUser({
			broadcaster_user_id: broadcasterUserId,
			user_id: selectedUser.id,
			duration: seconds,
		});
	}

	function handleLongTimeout() {
		if (!selectedUser || !broadcasterUserId) {
			toast.warn("No user or channel selected for timeout.");
			return;
		}
		window.electron.kick.timeoutUser({
			broadcaster_user_id: broadcasterUserId,
			user_id: selectedUser.id,
			duration: 600, // 10 minutes
		});
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

	function handleUnban(entry: SuspendedEntry) {
		removeSuspendedUser(entry.raw);
		// refreshSuspended is called via LOCAL_MODERATION_SETTINGS_CHANGED event
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
						className="mod-section-body mod-grid"
						hidden={collapsed.actions}
					>
						<button
							className="mod-btn"
							disabled={!selectedUser}
							onClick={handleDefaultTimeout}
							type="button"
							aria-label="Timeout (default)"
						>
							<span className="label">
								<Icon name="timeout" size={12} />
								{" "}Timeout
							</span>
							<span className="hint">{defaultSeconds}s default · Ctrl+T</span>
						</button>
						<button
							className="mod-btn"
							disabled={!selectedUser}
							onClick={handleLongTimeout}
							type="button"
							aria-label="Timeout (long)"
						>
							<span className="label">
								<Icon name="timeout" size={12} />
								{" "}Timeout
							</span>
							<span className="hint">10 min · Ctrl+Shift+T</span>
						</button>
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
								className="mod-list-row"
								data-testid={`suspended-row-${entry.username}`}
							>
								<div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
									<span style={{ color: "var(--ms-fg-1, var(--fg-1))" }}>
										{entry.username}
									</span>
									{entry.reason && (
										<span className="reason">{entry.reason}</span>
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
