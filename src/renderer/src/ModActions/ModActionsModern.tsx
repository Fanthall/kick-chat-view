/**
 * Sprint 5 — ModActionsModern: Modern moderation panel.
 *
 * Render structure REBUILT to mirror the prototype spec 1:1
 * (workspace/plan/chat-view/prototype/chat-view-full.html #panelMod):
 *   - panel-hd: "Moderasyon" + popOut icon-btn + close icon-btn
 *   - mod-scroll:
 *     - mod-hint.viewer-only (canModerate=false only)
 *     - mod-sec "Seçili Kullanıcı": mod-target + mod-actions (Profil / Ban / Timeout)
 *     - mod-sec "Hızlı Timeout" (canModerate only): to-presets chips
 *     - mod-sec "Mod Aksiyonları": mod-hist log rows
 *
 * Sections are STATIC (no collapsible mechanism, no localStorage-backed
 * section state). Removed vs. the previous version: Note/Promote buttons,
 * TimeoutPicker (custom-seconds input), Chat controls section, Suspended
 * users section — none of these exist in the prototype spec.
 *
 * IPC: window.electron.kick.timeoutUser / banUser (existing preload bridge).
 * Selected user: EXPLICIT prop only (set via ChatModern right-click/click).
 * CONSTRAINT-4: badge HTML via buildBadgesHtml (sanitized).
 */

import React, { FunctionComponent, useMemo } from "react";
import { toast } from "react-toastify";
import { useFanthalSelector } from "../../store/hooks/hooks";
import { ModMessage, User } from "../../util/chatInterface";
import { getActiveChannelSlug } from "../../util/channelSettings";
import { buildBadgesHtml } from "../../util/chatHtml";
import { getBlockedEmotes } from "../../util/localModerationStorage";
import { useProfilePic } from "../../util/useProfilePic";
import { buildUserWindowPayload } from "../../util/userWindowPayload";
import { useTranslation } from "../../util/i18n";
import Icon from "../Component/Icon/Icon";

// ─── Quick timeout presets (prototype: 1d/5d/10d/30d/1s → seconds) ───────────
// Note: prototype chip labels are minute-based despite the "d" suffix in the
// spec shorthand (1d=60s, 5d=300s, 10d=600s, 30d=1800s, 1s=3600s = 1 hour).

const QUICK_TIMEOUT_PRESETS: { label: string; seconds: number }[] = [
	{ label: "1d", seconds: 60 },
	{ label: "5d", seconds: 300 },
	{ label: "10d", seconds: 600 },
	{ label: "30d", seconds: 1800 },
	{ label: "1s", seconds: 3600 },
];

const DEFAULT_TIMEOUT_SECONDS = 300; // matches prototype's default-highlighted "5d" chip

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
		<div className="mt-ava" aria-hidden="true">
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
	onClearSelected: _onClearSelected,
	isPopOut = false,
}) => {
	const { t } = useTranslation();
	const canModerate = isOwner || isMod;
	const messages = useFanthalSelector((state) => state.messages);
	const channelBadges = useFanthalSelector((state) => state.messages.channelBadges);
	const activeChannelSlug = getActiveChannelSlug();

	// UserWindow ayri renderer; Redux'a erisemez. Payload icinde emote rendering
	// kaynak verilerini gondeririz (UserWindow buildEmoteIndex ile lokal kurar).
	const buildEmoteContextForPayload = () => ({
		channelEmoteSets: activeChannelSlug
			? messages.emoteSetsByChannel[activeChannelSlug] || []
			: [],
		globalEmoteSets: messages.globalEmoteSets,
		blockedEmotes: getBlockedEmotes(),
	});

	// Sprint 11: prefer EXPLICIT prop. modAction[last] fallback removed —
	// it was auto-selecting any user after a mod event, regardless of intent.
	const selectedUser: User | undefined = explicitSelectedUser;

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
			return t("mod.guard.self");
		}
		const streamMeta = activeChannelSlug
			? messages.streamMetaByChannel[activeChannelSlug]
			: undefined;
		if (
			streamMeta?.broadcasterUserId &&
			target.id === streamMeta.broadcasterUserId
		) {
			return t("mod.guard.owner");
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
			return t("mod.guard.protected");
		}
		return null;
	}

	// ─── Action handlers ─────────────────────────────────────────────────────────

	function runTimeout(seconds: number) {
		if (!selectedUser || !broadcasterUserId) {
			toast.warn(t("mod.toast.no-user-timeout"));
			return;
		}
		const guard = protectedTargetReason(selectedUser);
		if (guard) {
			toast.warn(guard);
			return;
		}
		if (!Number.isFinite(seconds) || seconds <= 0) {
			toast.warn(t("mod.toast.timeout-positive"));
			return;
		}
		window.electron.kick.timeoutUser({
			broadcaster_user_id: broadcasterUserId,
			user_id: selectedUser.id,
			duration: seconds,
		});
	}

	function handleDefaultTimeout() {
		runTimeout(DEFAULT_TIMEOUT_SECONDS);
	}

	function handleBan() {
		if (!selectedUser || !broadcasterUserId) {
			toast.warn(t("mod.toast.no-user-ban"));
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

	function openUserProfile(user: User | undefined) {
		if (!user) return;
		try {
			const payload = buildUserWindowPayload({
				user,
				messages: messages.messageList,
				modActions: messages.modAction,
				openedFrom: "moderation",
				channelName: activeChannelSlug || undefined,
				canModerateChannel: canModerate,
				...buildEmoteContextForPayload(),
			});
			window.electron.userWindow.open(payload);
		} catch (err: any) {
			toast.error(err?.message || t("mod.toast.window-failed"));
		}
	}

	// ─── Badge HTML (CONSTRAINT-4: sanitized via buildBadgesHtml) ────────────────
	const badgesHtml = selectedUser?.identity?.badges
		? buildBadgesHtml(selectedUser.identity.badges, channelBadges)
		: "";

	// ─── Filtered mod actions for this channel ──────────────────────────────────
	const filteredModActions = messages.modAction.filter(
		(m) => !activeChannelSlug || m.channelSlug === activeChannelSlug
	);

	// Selected user'in su anda suphe/kisitli durumu (mt-status satiri icin).
	const selectedUserIsRestricted = useMemo(() => {
		if (!selectedUser) return false;
		const uname = selectedUser.username.toLowerCase();
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

	// Son 500 mod aksiyonu — FIFO; section kendi icinde scroll edilebilir
	// oldugundan uzun log gosterimi UX bozulmadan calisir. Reducer'daki
	// modAction cap'i (500) ile hizali; cok eski aksiyonlar (>500) sessizce dusurulur.
	const recentActions = useMemo(() => {
		return filteredModActions
			.slice()
			.sort((a, b) => Number(b.created_at) - Number(a.created_at))
			.slice(0, 500);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filteredModActions.length]);

	// ─── Meta line ───────────────────────────────────────────────────────────────
	const userTimeouts = selectedUser
		? filteredModActions.filter(
			(m) => (m.type === "to") && m.user?.id === selectedUser.id
		).length
		: 0;
	const userBans = selectedUser
		? filteredModActions.filter(
			(m) => m.type === "ban" && m.user?.id === selectedUser.id
		).length
		: 0;
	const userMsgCount = selectedUser
		? messages.messageList.filter(
			(m) => !activeChannelSlug || m.channelSlug === activeChannelSlug
		).filter((m) => m.sender.id === selectedUser.id).length
		: 0;

	return (
		<section className="panel col-mod">
			{/* Header */}
			<div className="panel-hd">
				<span className="ti">{t("mod.title")}</span>
				<span className="hd-sp" />
				{!isPopOut && (
					<button
						className="icon-btn"
						title={t("mod.open-new-window")}
						aria-label={t("mod.aria.open-new-window")}
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
						className="icon-btn danger"
						onClick={onClose}
						title={t("mod.collapse")}
						type="button"
						aria-label={t("mod.aria.close-panel")}
					>
						<Icon name="x" size={13} />
					</button>
				)}
			</div>

			{/* Scrollable body */}
			<div className="mod-scroll">
				{!canModerate && (
					<div className="mod-hint viewer-only">{t("mod.empty.viewer")}</div>
				)}

				{/* Section 1: Selected user */}
				<div className="mod-sec">
					<h4>{t("mod.section.selected")}</h4>
					{selectedUser ? (
						<>
							<div className="mod-target" data-testid="mod-target-card">
								<ModTargetAvatar
									slug={selectedUser.slug || selectedUser.username}
									letter={selectedUser.username[0]?.toUpperCase() ?? "?"}
								/>
								<div>
									<div
										className="mt-name uw-open"
										role="button"
										tabIndex={0}
										onClick={() => openUserProfile(selectedUser)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												openUserProfile(selectedUser);
											}
										}}
										aria-label={`${t("mod.detail")} ${selectedUser.username}`}
									>
										{selectedUser.username}
										{badgesHtml && (
											<span
												dangerouslySetInnerHTML={{ __html: badgesHtml }}
												style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
											/>
										)}
									</div>
									{selectedUserIsRestricted && (
										<div className="mt-status" title={t("mod.status.restricted-title")}>
											⚠ {t("mod.status.restricted")}
										</div>
									)}
									<div className="mt-meta">
										{userMsgCount} {t("mod.meta.messages")} · {userTimeouts} {t("mod.meta.timeouts")} · {userBans} {t("mod.meta.bans")}
									</div>
								</div>
							</div>
							<div className="mod-actions">
								<button
									type="button"
									className="mod-btn uw-open"
									onClick={() => openUserProfile(selectedUser)}
									aria-label={`${t("mod.profile")} ${selectedUser.username}`}
								>
									{t("mod.profile")}
								</button>
								{canModerate && (
									<>
										<button
											type="button"
											className="mod-btn danger"
											onClick={handleBan}
											aria-label={t("mod.aria.ban-user")}
										>
											{t("mod.ban")}
										</button>
										<button
											type="button"
											className="mod-btn danger"
											onClick={handleDefaultTimeout}
											aria-label={t("mod.aria.timeout-user")}
										>
											{t("mod.timeout")}
										</button>
									</>
								)}
							</div>
						</>
					) : (
						<div className="mod-target-empty" data-testid="mod-target-empty">
							{canModerate ? t("mod.empty.click-row") : t("mod.empty.viewer")}
						</div>
					)}
				</div>

				{/* Section 2: Quick timeout — only when user can moderate */}
				{canModerate && (
					<div className="mod-sec">
						<h4>{t("mod.section.quick-timeout")}</h4>
						<div className="to-presets">
							{QUICK_TIMEOUT_PRESETS.map((p) => (
								<button
									key={p.seconds}
									type="button"
									className={`to-chip${p.seconds === DEFAULT_TIMEOUT_SECONDS ? " on" : ""}`}
									disabled={!selectedUser}
									onClick={() => runTimeout(p.seconds)}
									aria-label={`${t("mod.timeout")} ${p.label}`}
								>
									{p.label}
								</button>
							))}
						</div>
					</div>
				)}

				{/* Section 3: Mod actions history */}
				<div className="mod-sec">
					<h4>{t("mod.section.history")}</h4>
					<div className="mod-hist">
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
							// banned_by/unbanned_by bazi Pusher event'lerinde bos gelebilir ->
							// ham "system" yerine i18n fallback, hicbir zaman ham Ingilizce'ye
							// dusmez (hard-rules §32-35).
							const actor =
								action.banned_by?.username ||
								action.unbanned_by?.username ||
								t("mod.actor.fallback");
							const tagClass =
								action.type === "to" ? "to" :
								action.type === "ban" ? "ban" :
								action.type === "unban" ? "unban" : "del";
							const tagLabel =
								action.type === "to" ? t("mod.action-tag.timeout") :
								action.type === "ban" ? t("mod.action-tag.ban") :
								action.type === "unban" ? t("mod.action-tag.unban") :
								t("mod.action-tag.delete");
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
									className="mh-row"
									onDoubleClick={() => openUserProfile(action.user)}
									onContextMenu={(e) => {
										e.preventDefault();
										openUserProfile(action.user);
									}}
									title={t("mod.dblclick-hint")}
								>
									<span className={`mh-tag ${tagClass}`}>{tagLabel}</span>
									<span className="mh-body">
										<b>{t("mod.by-prefix")}{actor}</b> → {action.user?.username || "?"}
										{action.type === "to" && action.expires_at
											? ` · ${new Date(action.expires_at).toLocaleString(undefined, {
													hour: "2-digit",
													minute: "2-digit",
											  })}`
											: ""}
									</span>
									<span className="mh-meta">{tStr}</span>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</section>
	);
};

export default ModActionsModern;
