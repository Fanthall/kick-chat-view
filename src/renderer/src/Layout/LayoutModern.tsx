/**
 * LayoutModern — Modern shell 3-col + topbar.
 *
 * Fidelity sprint: Fixes 1–8 applied.
 *   Fix 1 — Uptime: setInterval every 60s; format Hh Mm; show '--' when offline.
 *   Fix 2 — + button opens AddChannelPopover.
 *   Fix 3 — LIVE badge (.tb-live) when stream is live.
 *   Fix 4 — Topbar left/center/right zone mirroring Designs/app.jsx > Topbar.
 *   Fix 5 — Secondary channel chips with in-memory unread count stub.
 *   Fix 6 — Stats row: viewers (toLocaleString), uptime, category, role badge.
 *   Fix 7 — 5 right-action icon-btns with aria-label, is-on state, pip count.
 *   Fix 8 — Settings now opens as modal over the chat dashboard.
 */

import React, {
	FunctionComponent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	useFanthalDispatch,
	useFanthalSelector,
} from "../../store/hooks/hooks";
import {
	ChatViewChannel,
	getActiveChannelSlug,
	getChannelList,
	setActiveChannelSlug,
} from "../../util/channelSettings";
import { chatListener } from "../../util/chatConnection";
import Icon from "../Component/Icon/Icon";
import ChatModern from "../Chat/ChatModern";
import ActivityViewModern from "../ActivityView/ActivityViewModern";
import ModActionsModern from "../ModActions/ModActionsModern";
import SettingsModern from "../Settings/SettingsModern";
import AddChannelPopover from "./AddChannelPopover";

const SHELL_ATTR = "modern";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fix 1: Compute uptime string from ISO start timestamp.
 * Returns 'Hh Mm' format, '--' when not live or no startedAt.
 */
const computeUptime = (startedAt?: string): string => {
	if (!startedAt) return "--";
	const start = new Date(startedAt).getTime();
	if (!Number.isFinite(start) || isNaN(start)) return "--";
	const ms = Date.now() - start;
	if (ms <= 0) return "--";
	const totalSec = Math.floor(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
};

/**
 * Fix 5: In-memory unread count per slug since last switch (volatile stub).
 */
const unreadMap = new Map<string, number>();
let lastMessageCount: Record<string, number> = {};

// ─── LayoutModern ─────────────────────────────────────────────────────────────

const LayoutModern: FunctionComponent = () => {
	const dispatch = useFanthalDispatch();
	const messages = useFanthalSelector((state) => state.messages);

	const [channels, setChannels] = useState<ChatViewChannel[]>(() =>
		getChannelList()
	);
	const [activeSlug, setActiveSlug] = useState<string>(
		() => getActiveChannelSlug() || ""
	);
	// Fix 8: settings is now a modal overlay
	const [settingsOpen, setSettingsOpen] = useState(false);
	// Fix 7: panel visibility
	const [showActivity, setShowActivity] = useState(true);
	const [showModeration, setShowModeration] = useState(true);
	// Fix 2: add-channel popover
	const [addPopoverOpen, setAddPopoverOpen] = useState(false);
	const addBtnRef = useRef<HTMLButtonElement>(null);

	// Fix 1: uptime — recompute every 60s
	const [uptimeTick, setUptimeTick] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setUptimeTick((v) => v + 1), 60_000);
		return () => clearInterval(id);
	}, []);

	const streamMeta = activeSlug
		? messages.streamMetaByChannel?.[activeSlug]
		: undefined;

	// Fix 3 + 6
	const isLive = !!streamMeta?.isLive;
	// Fix 1
	const uptime = useMemo(
		() => (isLive ? computeUptime(streamMeta?.startedAt) : "--"),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[isLive, streamMeta?.startedAt, uptimeTick]
	);
	// Fix 6 viewers
	const viewerCount = useMemo(() => {
		const v = streamMeta?.viewerCount;
		if (v === undefined || v === null) return "--";
		return v.toLocaleString("en-US");
	}, [streamMeta?.viewerCount]);
	// Fix 6 category
	const categoryName = streamMeta?.category?.name ?? (isLive ? "—" : "Offline");

	// Fix 6 role
	const kickAuthStatus = useRef<any>(null);
	const kickUserInfo = useRef<any>(null);
	const [userRole, setUserRole] = useState<{ isOwner: boolean; isMod: boolean }>({
		isOwner: false,
		isMod: false,
	});

	useEffect(() => {
		// Load auth + user info for role badge (fire-and-forget, no hard dep)
		window.electron?.kick
			?.getAuthStatus()
			.then((s: any) => { kickAuthStatus.current = s; })
			.catch(() => {});
		window.electron?.kick
			?.getUsers()
			.then((r: any) => { kickUserInfo.current = r?.data?.[0] || null; })
			.catch(() => {});
	}, []);

	// Fix 6: derive role from streamMeta + messageList heuristic
	const roleInfo = useMemo(() => {
		const uid = kickUserInfo.current?.user_id;
		const meta = streamMeta;
		const isOwner = !!(uid && meta?.broadcasterUserId && meta.broadcasterUserId === uid);
		const userName = (kickUserInfo.current?.name || localStorage.getItem("username") || "").toLowerCase();
		const isMod = userName
			? messages.messageList.some((msg) => {
					const sn = msg.sender?.username?.toLowerCase();
					return sn === userName &&
						msg.sender?.identity?.badges?.some(
							(b: any) => b.type?.toLowerCase() === "moderator"
						);
				})
			: false;
		return { isOwner, isMod };
	}, [streamMeta, messages.messageList]);

	// Fix 5: rough unread count per channel
	const unreadCounts = useMemo(() => {
		const counts: Record<string, number> = {};
		channels.forEach((ch) => {
			if (ch.slug === activeSlug) {
				unreadMap.set(ch.slug, 0);
			}
			const slugMessages = messages.messageList.filter(
				(m) => m.channelSlug === ch.slug
			);
			const prev = lastMessageCount[ch.slug] ?? slugMessages.length;
			if (ch.slug !== activeSlug) {
				const delta = Math.max(0, slugMessages.length - prev);
				counts[ch.slug] = (unreadMap.get(ch.slug) ?? 0) + delta;
			} else {
				counts[ch.slug] = 0;
			}
			lastMessageCount[ch.slug] = slugMessages.length;
		});
		return counts;
	}, [channels, activeSlug, messages.messageList]);

	// Settings change listener
	useEffect(() => {
		const onSettings = () => {
			setChannels(getChannelList());
			setActiveSlug(getActiveChannelSlug() || "");
		};
		window.addEventListener("kick-channel-settings-changed", onSettings);
		return () => {
			window.removeEventListener("kick-channel-settings-changed", onSettings);
		};
	}, []);

	// Fix 8: Escape closes settings modal
	useEffect(() => {
		if (!settingsOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setSettingsOpen(false);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [settingsOpen]);

	const onSelectChannel = useCallback(
		(slug: string) => {
			if (!slug || slug === activeSlug) return;
			unreadMap.set(slug, 0);
			setActiveChannelSlug(slug);
			setActiveSlug(slug);
			dispatch(chatListener(slug));
			window.dispatchEvent(new Event("kick-channel-settings-changed"));
		},
		[activeSlug, dispatch]
	);

	// Fix 4 avatar letter
	const avatarLetter = activeSlug ? activeSlug[0].toUpperCase() : "?";

	// Secondary channels (not active)
	const secondaryChannels = channels.filter((c) => c.slug !== activeSlug);

	return (
		<div
			data-app-shell={SHELL_ATTR}
			style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100%", width: "100%" }}
		>
			{/* ── Topbar ── */}
			<header className="topbar" role="banner" data-testid="topbar-modern">
				{/* Left zone: .tb-channel */}
				<div className="tb-channel">
					{/* Fix 4: avatar with first letter */}
					<div className="tb-ava" aria-hidden="true" data-testid="tb-avatar">
						{avatarLetter}
					</div>
					<div className="tb-meta">
						<div className="tb-meta-top">
							<span className="tb-name">{activeSlug || "No channel"}</span>
							{/* Fix 3: LIVE badge */}
							{isLive && (
								<span
									className="tb-live"
									role="status"
									aria-label="Stream is live"
									data-testid="tb-live-badge"
								>
									LIVE
								</span>
							)}
						</div>
						{/* Fix 4+5: secondary channel chips row */}
						<div className="tb-tabs" role="tablist" aria-label="Channel tabs">
							{secondaryChannels.map((ch) => {
								const unread = unreadCounts[ch.slug] ?? 0;
								return (
									<button
										key={ch.slug}
										role="tab"
										aria-selected={false}
										className="tb-tab"
										title={ch.slug}
										onClick={() => onSelectChannel(ch.slug)}
									>
										<span
											className="dot"
											style={
												messages.connectionStatusByChannel?.[ch.slug] === "connected"
													? {}
													: { background: "var(--fg-4, #5a5e68)" }
											}
										/>
										{ch.slug}
										{unread > 0 && (
											<span
												className="mono num"
												style={{ fontSize: 9.5, color: "var(--fg-4, #5a5e68)", marginLeft: 2 }}
											>
												{unread}
											</span>
										)}
									</button>
								);
							})}
							{/* Fix 2: + button */}
							<div style={{ position: "relative" }}>
								<button
									ref={addBtnRef}
									className="tb-add"
									title="Add channel"
									aria-label="Add channel"
									type="button"
									data-testid="tb-add-btn"
									onClick={() => setAddPopoverOpen((v) => !v)}
								>
									<Icon name="plus" size={12} />
								</button>
								<AddChannelPopover
									open={addPopoverOpen}
									onClose={() => setAddPopoverOpen(false)}
									anchorRef={addBtnRef}
								/>
							</div>
						</div>
					</div>
				</div>

				{/* Middle zone: .tb-stats — Fix 6 */}
				<div className="tb-stats" aria-label="Stream stats" data-testid="tb-stats">
					<div className="tb-stat" title="Viewers">
						<Icon name="eye" size={13} />
						<span className="num" data-testid="tb-viewers">{viewerCount}</span>
					</div>
					<div className="tb-stat" title="Uptime">
						<Icon name="timeout" size={13} />
						<span className="num mono" data-testid="tb-uptime">{uptime}</span>
					</div>
					<div className="tb-stat" title="Category">
						<Icon name="info" size={13} />
						<span data-testid="tb-category">{categoryName}</span>
					</div>
					{/* Role — Fix 6 */}
					{(roleInfo.isOwner || roleInfo.isMod) && (
						<>
							<div className="tb-stat-sep" />
							<div className="tb-role" data-testid="tb-role">
								{roleInfo.isOwner && (
									<span className="tb-role-badge">Owner</span>
								)}
								{roleInfo.isMod && (
									<span style={{ fontSize: 12, color: "var(--fg-2, #b6b9c0)" }}>
										{roleInfo.isOwner ? "+ Moderator badge observed" : "Moderator"}
									</span>
								)}
							</div>
						</>
					)}
				</div>

				{/* Right zone: .tb-actions — Fix 7 */}
				<div className="tb-actions" data-testid="tb-actions">
					<button
						className={`icon-btn ${showActivity ? "is-on" : ""}`}
						title="Activity"
						aria-label="Toggle activity panel"
						type="button"
						data-testid="tb-btn-activity"
						onClick={() => setShowActivity((v) => !v)}
					>
						<Icon name="activity" size={15} />
					</button>
					<button
						className={`icon-btn ${showModeration ? "is-on" : ""}`}
						title="Moderation"
						aria-label="Toggle moderation panel"
						type="button"
						data-testid="tb-btn-moderation"
						onClick={() => setShowModeration((v) => !v)}
					>
						<Icon name="shield" size={15} />
					</button>
					<button
						className="icon-btn"
						title="Emote picker (Ctrl+E)"
						aria-label="Open emote picker"
						type="button"
						data-testid="tb-btn-emotes"
					>
						<Icon name="smile" size={15} />
					</button>
					<button
						className="icon-btn"
						title="Refresh"
						aria-label="Refresh channel data"
						type="button"
						data-testid="tb-btn-refresh"
						onClick={() => {
							if (activeSlug) {
								dispatch(chatListener(activeSlug));
							}
						}}
					>
						<Icon name="refresh" size={15} />
					</button>
					<button
						className={`icon-btn ${settingsOpen ? "is-on" : ""}`}
						title="Settings"
						aria-label="Open settings"
						type="button"
						data-testid="tb-btn-settings"
						onClick={() => setSettingsOpen(true)}
					>
						<Icon name="settings" size={15} />
					</button>
				</div>
			</header>

			{/* ── Content stage: 3-col chat dashboard ── */}
			<div
				className={[
					"main",
					!showActivity && "no-act",
					!showModeration && "no-mod",
				]
					.filter(Boolean)
					.join(" ")}
			>
				{/* Chat panel */}
				<section
					className="panel"
					style={{ minWidth: 0 }}
					aria-label="Chat"
				>
					<ChatModern />
				</section>

				{/* Activity panel */}
				{showActivity && (
					<aside className="panel" aria-label="Activity">
						<ActivityViewModern />
					</aside>
				)}

				{/* Moderation panel */}
				{showModeration && (
					<aside className="panel" aria-label="Moderation">
						<ModActionsModern />
					</aside>
				)}
			</div>

			{/* Fix 8: Settings modal */}
			{settingsOpen && (
				<div
					className="modal-scrim"
					data-testid="settings-modal-scrim"
					onClick={(e) => {
						if (e.target === e.currentTarget) setSettingsOpen(false);
					}}
				>
					<div
						className="modal"
						role="dialog"
						aria-modal="true"
						aria-label="Settings"
						style={{ maxWidth: 980, height: 640 }}
						data-testid="settings-modal"
					>
						<div className="modal-hd">
							<h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
								<Icon name="settings" size={15} />
								Settings
							</h2>
							<button
								className="icon-btn"
								type="button"
								aria-label="Close settings"
								title="Close"
								onClick={() => setSettingsOpen(false)}
							>
								<Icon name="x" size={14} />
							</button>
						</div>
						<div className="modal-body">
							<SettingsModern />
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default LayoutModern;
