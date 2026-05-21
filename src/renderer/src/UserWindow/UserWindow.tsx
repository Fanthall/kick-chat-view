/**
 * Sprint 12 — UserWindow (modern redesign)
 *
 * Replaces NextUI-based 467-LOC layout with design-system-aligned
 * user-detail popup. All IPC handlers and optimistic-update patterns
 * (addLocalModAction / createLocalAction) are preserved verbatim.
 *
 * CONSTRAINT-4 (Emote unification 2026-05-22): message HTML uses
 * `renderMessageHtml` / `renderMessageHtmlSnippet` from chatHtml.ts
 * (sanitized via escapeHtml + safeUrl). EmoteIndex received via
 * UserWindowPayload.channelEmoteSets + globalEmoteSets and built
 * locally with buildEmoteIndex (UserWindow is a separate Electron
 * renderer; no Redux access).
 */

import moment from "moment";
import React, {
	FunctionComponent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { FiCopy, FiX, FiMessageSquare } from "react-icons/fi";
import { toast } from "react-toastify";
import { UserWindowPayload } from "../../../shared/userWindow";
import { ModMessage, UserMessage } from "../../util/chatInterface";
import {
	renderMessageHtml,
	renderMessageHtmlSnippet,
} from "../../util/chatHtml";
import { buildEmoteIndex } from "../../util/emoteIndex";
import { hasKickScope, parseKickScopes } from "../../util/kickScopes";
import { useProfilePic } from "../../util/useProfilePic";
import {
	DEFAULT_TIMEOUT_SECONDS,
	formatTimeoutDuration,
	parseTimeoutSeconds,
} from "../../util/timeoutDuration";
import { useTranslation } from "../../util/i18n";

// ─── Local notes ─────────────────────────────────────────────────────────────

interface UserNote {
	text: string;
	ts: number;
}

const NOTES_KEY_PREFIX = "chatViewUserNotes_";

const loadNotes = (username: string): UserNote[] => {
	try {
		const raw = localStorage.getItem(NOTES_KEY_PREFIX + username.toLowerCase());
		return raw ? (JSON.parse(raw) as UserNote[]) : [];
	} catch {
		return [];
	}
};

const saveNotes = (username: string, notes: UserNote[]) => {
	localStorage.setItem(
		NOTES_KEY_PREFIX + username.toLowerCase(),
		JSON.stringify(notes)
	);
};

// ─── Small helpers ────────────────────────────────────────────────────────────

const getInitials = (username: string) =>
	username.slice(0, 2).toUpperCase();

/** Returns i18n key for user status based on last message time. */
const getStatusKey = (messages: UserMessage[]): "userwindow.status.active" | "userwindow.status.offline" => {
	if (!messages.length) return "userwindow.status.offline";
	const last = messages[messages.length - 1];
	const diff = Date.now() - new Date(last.created_at).getTime();
	return diff < 5 * 60 * 1000 ? "userwindow.status.active" : "userwindow.status.offline";
};

/** Derive current ban state: look for latest ban/unban action. */
const deriveIsBanned = (modActions: ModMessage[]): boolean => {
	const relevant = modActions.filter(
		(a) => a.type === "ban" || a.type === "unban"
	);
	if (!relevant.length) return false;
	const last = relevant[relevant.length - 1];
	return last.type === "ban";
};

type Tab = "overview" | "messages" | "activity" | "modhistory" | "notes";

const TIMEOUT_PRESETS = [
	{ label: "1m", seconds: 60 },
	{ label: "5m", seconds: 300 },
	{ label: "10m", seconds: 600 },
	{ label: "30m", seconds: 1800 },
];

// ─── Avatar helper (Sprint 15) ───────────────────────────────────────────────

const UserAvatar: FunctionComponent<{ slug: string; initials: string }> = ({
	slug,
	initials,
}) => {
	const pic = useProfilePic(slug);
	return (
		<div className="uw-avatar" aria-hidden="true">
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
				initials
			)}
		</div>
	);
};

// ─── Component ────────────────────────────────────────────────────────────────

const UserWindow: FunctionComponent = () => {
	const { t } = useTranslation();
	const [payload, setPayload] = useState<UserWindowPayload | undefined>();
	const [copyStatus, setCopyStatus] = useState<string>("");
	const [broadcasterUserId, setBroadcasterUserId] = useState<
		number | undefined
	>();
	// Sprint 57: oauthUserId + myChannel + role-mgmt state'leri kaldırıldı
	// (rol yönetimi yok, derived value'lar artık kullanılmıyordu).
	const [grantedScopes, setGrantedScopes] = useState<string[]>([]);
	const [moderationLoading, setModerationLoading] = useState<string>("");
	const [activeTab, setActiveTab] = useState<Tab>("overview");

	// Timeout state
	const [selectedPreset, setSelectedPreset] = useState<number>(600); // 10m default
	const [customSeconds, setCustomSeconds] = useState<string>("");

	// Notes
	const [notes, setNotes] = useState<UserNote[]>([]);
	const [noteInput, setNoteInput] = useState<string>("");

	// ── Payload subscription ──────────────────────────────────────────────────

	useEffect(() => {
		const unsubscribe = window.electron.userWindow.onPayload((nextPayload) => {
			setPayload(nextPayload);
			document.title = `${nextPayload.user.username} - User Details`;
			const loaded = loadNotes(nextPayload.user.username);
			setNotes(loaded);
		});
		// Sprint 16 fix: tell main we're ready; main re-sends the stored payload.
		// Solves did-finish-load -> send race that lost the initial payload.
		window.electron.userWindow.requestPayload?.();
		return unsubscribe;
	}, []);

	// ── Channel + scope resolution ────────────────────────────────────────────

	useEffect(() => {
		if (!payload?.channelName) {
			setBroadcasterUserId(undefined);
			setGrantedScopes([]);
			return;
		}

		Promise.all([
			window.electron.kick.getChannelBySlug(payload.channelName),
			window.electron.kick.getAuthStatus().catch(() => undefined),
		])
			.then(([channelResponse, authStatus]: any[]) => {
				setBroadcasterUserId(
					channelResponse?.data?.[0]?.broadcaster_user_id
				);
				setGrantedScopes(
					parseKickScopes(
						authStatus?.grantedScopes,
						authStatus?.tokenScope,
						authStatus?.introspection?.data?.scope,
						authStatus?.introspection?.data?.scopes
					)
				);
				// Sprint 57: getUsers + myChannel fetch'i kaldırıldı —
				// rol yönetimi yok.
			})
			.catch(() => {
				setBroadcasterUserId(undefined);
				setGrantedScopes([]);
			});
	}, [payload?.channelName]);

	// Sprint 50: payload.messages session buffer'dan filtreleniyor; kullanıcı
	// uzun süredir yazmadıysa boş kalır. Bu durumda Kick'in chatroom messages
	// API'sini çekip kullanıcının son ~10 mesajını ekleyelim.
	const augmentedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!payload) return;
		const slug = payload.channelName;
		if (!slug) return;
		const key = `${slug}:${payload.user.id || payload.user.username}`;
		if (augmentedRef.current === key) return; // sadece bir kez
		const haveCount = payload.messages?.length || 0;
		if (haveCount >= 10) {
			augmentedRef.current = key;
			return;
		}
		augmentedRef.current = key;
		// chatroom id'yi getChannelData (kick API v2) üzerinden çek.
		(async () => {
			try {
				// Renderer service getChannelData kanal slug'ından chatroom.id veriyor.
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const { getChannelData, getChannelMessages } = require(
					"../../services/kick"
				);
				const chRes: any = await getChannelData(slug);
				const chatroomId: number | undefined = chRes?.data?.chatroom?.id;
				if (!chatroomId) return;
				const msgRes: any = await getChannelMessages(chatroomId);
				const apiMessages: any[] = msgRes?.data?.data?.messages || [];
				const uname = (payload.user.username || "").toLowerCase();
				const uid = payload.user.id;
				const userMsgs = apiMessages
					.filter((m: any) => {
						const senderName = (m?.sender?.username || "").toLowerCase();
						const senderId = m?.sender?.id;
						return senderName === uname || (uid && senderId === uid);
					})
					.map((m: any) => ({
						...m,
						channelSlug: slug,
					}));
				if (userMsgs.length === 0) return;
				setPayload((cur) => {
					if (!cur) return cur;
					const existingIds = new Set(cur.messages.map((m) => m.id));
					const merged = [...cur.messages];
					for (const m of userMsgs) {
						if (!existingIds.has(m.id)) merged.push(m);
					}
					merged.sort(
						(a, b) =>
							new Date(b.created_at).getTime() -
							new Date(a.created_at).getTime()
					);
					return { ...cur, messages: merged.slice(0, 50) };
				});
			} catch (err) {
				console.log("UserWindow message fetch failed", err);
			}
		})();
	}, [payload?.channelName, payload?.user?.id, payload?.user?.username]);

	// ── Derived values ────────────────────────────────────────────────────────

	const hasBanScope = hasKickScope(grantedScopes, "moderation:ban");
	const hasMessageManageScope = hasKickScope(
		grantedScopes,
		"moderation:chat_message:manage"
	);
	const hasChatWriteScope = hasKickScope(grantedScopes, "chat:write");
	const canUseModerationUi = payload?.canModerateChannel === true;
	const canModerateUser =
		canUseModerationUi && !!broadcasterUserId && hasBanScope;

	// Sprint 57: Owner / target-role / canManageRoles derived values
	// kaldırıldı — Kick public API'sinde rol yönetimi yok (Mod/VIP/OG
	// UI bütünüyle kaldırıldı).
	const canDeleteMessages =
		canUseModerationUi && !!broadcasterUserId && hasMessageManageScope;

	const isBanned = useMemo(
		() => (payload ? deriveIsBanned(payload.modActions) : false),
		[payload]
	);

	const timeoutSeconds = useMemo(() => {
		if (customSeconds.trim()) {
			const parsed = parseTimeoutSeconds(customSeconds);
			return parsed && parsed > 0 ? parsed : 0;
		}
		return selectedPreset;
	}, [customSeconds, selectedPreset]);

	const timeoutLabel = timeoutSeconds > 0
		? formatTimeoutDuration(timeoutSeconds)
		: "?";

	const timeoutCount = useMemo(
		() => (payload ? payload.modActions.filter((a) => a.type === "to").length : 0),
		[payload]
	);
	const banCount = useMemo(
		() => (payload ? payload.modActions.filter((a) => a.type === "ban").length : 0),
		[payload]
	);

	// ── Optimistic update helpers (preserved from original) ──────────────────

	const addLocalModAction = (action: ModMessage) => {
		setPayload((current) => {
			if (!current) return current;
			return {
				...current,
				messages:
					action.type === "delete" || action.type === "ban" || action.type === "to"
						? current.messages.map((message) =>
								action.type === "delete"
									? message.id === action.message?.id
										? { ...message, removed: true }
										: message
									: { ...message, removed: true }
						  )
						: current.messages,
				modActions: current.modActions.concat(action),
				updatedAt: Date.now(),
			};
		});
	};

	const createLocalAction = (
		action: "delete" | "timeout" | "ban" | "unban",
		message?: UserMessage,
		timeoutSec = DEFAULT_TIMEOUT_SECONDS
	): ModMessage => {
		if (!payload) throw new Error("No payload");
		const actor = {
			id: 0,
			username: "You",
			slug: "you",
			identity: { color: "#2fd3a0", badges: [] },
		};
		return {
			type: action === "timeout" ? "to" : action,
			id: `local-window-mod-${action}-${Date.now()}`,
			channelSlug: payload.channelName,
			status: "pending",
			user: payload.user,
			banned_by:
				action === "timeout" || action === "ban" ? actor : undefined,
			unbanned_by: action === "unban" ? actor : undefined,
			expires_at:
				action === "timeout"
					? new Date(Date.now() + timeoutSec * 1000).toISOString()
					: undefined,
			created_at: Date.now(),
			message:
				action === "delete" && message
					? { id: message.id, messageList: [message] }
					: undefined,
		};
	};

	const runUserModeration = (
		action: "timeout" | "ban" | "unban",
		message?: UserMessage
	) => {
		if (!broadcasterUserId || !hasBanScope) {
			toast("Kick moderation:ban scope is not available.", { type: "warning" });
			return;
		}
		if (!payload) return;

		const userId = payload.user.id || message?.sender.id;
		if (!userId) {
			toast("User id is missing for moderation.", { type: "warning" });
			return;
		}

		const timeoutSec =
			action === "timeout" ? timeoutSeconds : undefined;
		if (action === "timeout" && (!timeoutSec || timeoutSec <= 0)) {
			toast("Timeout duration must be > 0 seconds.", { type: "warning" });
			return;
		}

		const localAction = createLocalAction(
			action,
			message,
			timeoutSec || DEFAULT_TIMEOUT_SECONDS
		);
		addLocalModAction(localAction);
		setModerationLoading(action);

		const request = {
			broadcaster_user_id: broadcasterUserId,
			user_id: userId,
			reason: "Moderated from Kick Chat Viewer",
		};
		const task =
			action === "timeout"
				? window.electron.kick.timeoutUser({
						...request,
						duration: timeoutSec || DEFAULT_TIMEOUT_SECONDS,
				  })
				: action === "ban"
				? window.electron.kick.banUser(request)
				: window.electron.kick.unbanUser({
						broadcaster_user_id: broadcasterUserId,
						user_id: userId,
				  });

		task
			.then(() => {
				setPayload((current) =>
					current
						? {
								...current,
								modActions: current.modActions.map((item) =>
									item.id === localAction.id
										? { ...item, status: "success" }
										: item
								),
								updatedAt: Date.now(),
						  }
						: current
				);
				const actionText =
					action === "timeout"
						? `${action} ${formatTimeoutDuration(
								timeoutSec || DEFAULT_TIMEOUT_SECONDS
						  )}`
						: action;
				toast(`${actionText} request sent for ${payload.user.username}`, {
					type: "success",
				});
			})
			.catch((err) => {
				setPayload((current) =>
					current
						? {
								...current,
								modActions: current.modActions.map((item) =>
									item.id === localAction.id
										? {
												...item,
												status: "failed",
												error: err.message || `${action} request failed.`,
										  }
										: item
								),
								updatedAt: Date.now(),
						  }
						: current
				);
				toast(err.message || `${action} request failed.`, { type: "error" });
			})
			.finally(() => setModerationLoading(""));
	};

	// Sprint 57: runRoleCommandFor / runRoleCommand / runMyChannelRoleCommand
	// kaldırıldı — Kick public API'sinde rol yönetimi için endpoint yok ve
	// sendChatMessage slash command'ı parse etmiyor.

	const runDeleteMessage = (message: UserMessage) => {
		if (!hasMessageManageScope) {
			toast("Kick moderation:chat_message:manage scope is not available.", {
				type: "warning",
			});
			return;
		}

		const localAction = createLocalAction("delete", message);
		addLocalModAction(localAction);
		setModerationLoading(`delete-${message.id}`);
		window.electron.kick
			.deleteChatMessage(message.id)
			.then(() => {
				setPayload((current) =>
					current
						? {
								...current,
								modActions: current.modActions.map((item) =>
									item.id === localAction.id
										? { ...item, status: "success" }
										: item
								),
								updatedAt: Date.now(),
						  }
						: current
				);
				toast("Delete request sent.", { type: "success" });
			})
			.catch((err) => {
				setPayload((current) =>
					current
						? {
								...current,
								modActions: current.modActions.map((item) =>
									item.id === localAction.id
										? {
												...item,
												status: "failed",
												error: err.message || "Delete request failed.",
										  }
										: item
								),
								updatedAt: Date.now(),
						  }
						: current
				);
				toast(err.message || "Delete request failed.", { type: "error" });
			})
			.finally(() => setModerationLoading(""));
	};

	// ─── Emote rendering (Sprint XX, emote unification) ────────────────────
	// Payload yoksa bos index ile fallback (hook order korunmak zorunda —
	// rules of hooks: erken return'den ONCE useMemo cagrilmali).
	const emoteIndex = useMemo(
		() =>
			buildEmoteIndex(
				payload?.channelEmoteSets ?? [],
				payload?.globalEmoteSets ?? [],
				payload?.channelName
			),
		[payload?.channelEmoteSets, payload?.globalEmoteSets, payload?.channelName]
	);
	const blockedEmotesSet = useMemo(
		() => new Set(payload?.blockedEmotes ?? []),
		[payload?.blockedEmotes]
	);

	// ── Empty state ───────────────────────────────────────────────────────────

	if (!payload) {
		return (
			<div
				className="uw-shell"
				data-app-shell="modern"
				style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
			>
				<span className="uw-muted">Loading user details...</span>
			</div>
		);
	}

	// ── Derived display values ────────────────────────────────────────────────

	const { user, messages, modActions, channelName } = payload;
	const statusKey = getStatusKey(messages);
	const statusLabel = t(statusKey);
	const isActive = statusKey === "userwindow.status.active";

	const subBadge = user.identity?.badges?.find(
		(b) =>
			b.type?.toLowerCase() === "subscriber" &&
			typeof b.count === "number" &&
			b.count > 0
	);

	// ── Tab counts ────────────────────────────────────────────────────────────

	const tabCounts: Record<Tab, number | null> = {
		overview: null,
		messages: messages.length,
		activity: 0,
		modhistory: modActions.length,
		notes: notes.length,
	};

	const TABS: { id: Tab; labelKey: string }[] = [
		{ id: "overview", labelKey: "userwindow.tab.overview" },
		{ id: "messages", labelKey: "userwindow.tab.messages" },
		{ id: "activity", labelKey: "userwindow.tab.activity" },
		{ id: "modhistory", labelKey: "userwindow.tab.modhistory" },
		{ id: "notes", labelKey: "userwindow.tab.notes" },
	];
	// Sprint 57: "My Channel" tab kaldırıldı — Kick public API'sinde
	// rol yönetimi yok.

	// ── Save note ─────────────────────────────────────────────────────────────

	const handleSaveNote = () => {
		const text = noteInput.trim();
		if (!text) return;
		const updated = [...notes, { text, ts: Date.now() }];
		setNotes(updated);
		saveNotes(user.username, updated);
		setNoteInput("");
	};

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<div className="uw-shell" data-app-shell="modern">
			{/* ── MAIN CONTENT ────────────────────────────────────────── */}
			<div className="uw-main">
				{/* ─ Header ─ */}
				<header className="uw-header">
					<UserAvatar
						slug={user.slug || user.username}
						initials={getInitials(user.username)}
					/>

					<div className="uw-header-info">
						<div className="uw-header-row1">
							<span
								className="uw-username"
								style={{ color: user.identity?.color || undefined }}
							>
								{user.username}
							</span>
							<button
								type="button"
								className="uw-copy"
								title="Copy username"
								onClick={() => {
									navigator.clipboard
										.writeText(user.username)
										.then(() => {
											setCopyStatus("Copied");
											setTimeout(() => setCopyStatus(""), 1400);
										})
										.catch(() => setCopyStatus("Failed"));
								}}
							>
								<FiCopy size={12} />
								{copyStatus || "Copy"}
							</button>
							<span
								className={`uw-status${isActive ? " active-now" : " offline"}`}
								title={isActive ? "Last message < 5 min ago" : "No recent messages"}
							>
								<span className="uw-status-dot" />
								{statusLabel}
							</span>
						</div>
						<div className="uw-subtitle">
							{channelName || "—"}
							{" · "}
							<strong>{messages.length}</strong> messages
							{" · "}
							<strong>{modActions.length}</strong> mod actions
						</div>
					</div>

					{/* Sub badge */}
					{subBadge && (
						<div className="uw-header-badge-area">
							<span className="pbadge sub">
								Sub{" "}
								{typeof subBadge.count === "number" && subBadge.count > 0
									? `· ${subBadge.count}mo`
									: ""}
							</span>
						</div>
					)}

					{/* Top-right icons */}
					<div className="uw-header-actions">
						<button
							type="button"
							className="uw-icon-btn"
							title="Mention in chat (no-op)"
							disabled
						>
							<FiMessageSquare size={16} />
						</button>
						<button
							type="button"
							className="uw-icon-btn uw-close-btn"
							title="Close"
							onClick={() => window.close()}
						>
							<FiX size={16} />
						</button>
					</div>
				</header>

				{/* ─ Stat row ─ */}
				<div className="uw-stats">
					<div className="uw-stat">
						<span className="uw-stat-num">{messages.length}</span>
						<span className="uw-stat-label">msgs this session</span>
					</div>
					<div className="uw-stat">
						<span className="uw-stat-num">—</span>
						<span className="uw-stat-label">msgs lifetime</span>
					</div>
					<div className="uw-stat">
						<span className="uw-stat-num">—</span>
						<span className="uw-stat-label">watch time</span>
					</div>
					<div className="uw-stat">
						<span className="uw-stat-num">{timeoutCount}</span>
						<span className="uw-stat-label">timeouts</span>
					</div>
					<div className="uw-stat">
						<span className="uw-stat-num">{banCount}</span>
						<span className="uw-stat-label">bans</span>
					</div>
					<div className="uw-stat">
						<span className="uw-stat-num">{notes.length}</span>
						<span className="uw-stat-label">notes</span>
					</div>
				</div>

				{/* ─ Mod actions strip (Sprint 25 — was vertical right panel, now
				    horizontal between stats and tabs per user request) ─ */}
				<div className="uw-mod-strip">
					{canUseModerationUi && hasBanScope ? (
						<>
							<div className="uw-strip-group uw-strip-timeout">
								<span className="uw-strip-heading">TIMEOUT</span>
								<span className="uw-strip-current">{timeoutLabel}</span>
								<div className="uw-strip-chips">
									{TIMEOUT_PRESETS.map((p) => (
										<button
											key={p.label}
											type="button"
											className={`uw-preset-chip${
												!customSeconds.trim() && selectedPreset === p.seconds
													? " active"
													: ""
											}`}
											onClick={() => {
												setSelectedPreset(p.seconds);
												setCustomSeconds("");
											}}
										>
											{p.label}
										</button>
									))}
								</div>
								<input
									type="number"
									min="1"
									placeholder={t("mod.timeout.custom")}
									className="uw-custom-sec-input uw-strip-input"
									value={customSeconds}
									onChange={(e) => setCustomSeconds(e.target.value)}
								/>
								<span className="uw-muted uw-strip-unit">{t("mod.timeout.seconds")}</span>
								<button
									type="button"
									className="uw-btn-primary uw-strip-apply"
									disabled={!canModerateUser || timeoutSeconds <= 0 || moderationLoading === "timeout"}
									onClick={() => runUserModeration("timeout")}
								>
									{t("mod.timeout.apply")}
								</button>
							</div>

							<span className="uw-strip-divider" aria-hidden />

							{/* Sprint 27: Clear msgs butonu kaldirildi. Kick API'sinde
							    toplu silme yok; tek-mesaj silme zaten Messages tab'inda
							    her satirda mevcut. */}
							{/* Sprint 52: Hem Ban hem Unban her zaman görünür —
							    önceden banlanmış bir kullanıcı için manuel
							    unban yapılabilsin (deriveIsBanned modAction
							    history'sini görmüyorsa). */}
							<div className="uw-strip-group" style={{ display: "flex", gap: 6 }}>
								<button
									type="button"
									className="uw-btn-danger uw-strip-ban"
									disabled={!canModerateUser || moderationLoading === "ban"}
									onClick={() => runUserModeration("ban")}
									title={isBanned ? "Kullanıcı zaten banlı görünüyor" : "Permanently ban"}
								>
									{moderationLoading === "ban" ? "..." : t("userwindow.mod.ban")}
								</button>
								<button
									type="button"
									className="uw-btn-primary uw-strip-unban"
									disabled={!canModerateUser || moderationLoading === "unban"}
									onClick={() => runUserModeration("unban")}
									title="Önceki ban'ı kaldır (varsa)"
								>
									{moderationLoading === "unban" ? "..." : t("userwindow.mod.unban")}
								</button>
							</div>

							{/* Sprint 26: Account section removed — joined dates not
							    available from current IPC, so placeholder "—" was
							    just noise. */}

							{/* Sprint 57: Mod / VIP / OG butonları kaldırıldı —
							    Kick public API'sinde dedicated endpoint yok,
							    slash command'lar parse edilmiyordu. */}
						</>
					) : (
						<div className="uw-strip-empty">
							<span className="uw-muted">
								Mod aksiyonlari icin moderator yetkisi gerekli.
							</span>
						</div>
					)}
				</div>

				{/* ─ Tabs ─ */}
				<nav className="uw-tabs" role="tablist">
					{TABS.map((tab) => (
						<button
							key={tab.id}
							type="button"
							role="tab"
							aria-selected={activeTab === tab.id}
							className={`uw-tab${activeTab === tab.id ? " active" : ""}`}
							onClick={() => setActiveTab(tab.id)}
						>
							{t(tab.labelKey)}
							{tabCounts[tab.id] !== null && (
								<span className="uw-tab-count">{tabCounts[tab.id]}</span>
							)}
						</button>
					))}
				</nav>

				{/* ─ Tab content ─ */}
				<div className="uw-tab-body">
					{/* Overview */}
					{activeTab === "overview" && (
						<div className="uw-tab-content">
							<div className="uw-card uw-messages-card">
								<div className="uw-card-hd">
									<h3>Messages</h3>
									<span className="uw-card-meta">{messages.length} this session</span>
								</div>
								{messages.length === 0 ? (
									<p className="uw-empty-state">No messages this session.</p>
								) : (
									<ul className="uw-msg-list">
										{messages.slice(-3).map((msg) => (
											<li key={msg.id} className={`uw-msg-row${msg.removed ? " is-removed" : ""}`}>
												<span className="uw-msg-time">
													{moment(new Date(msg.created_at)).format("HH:mm")}
												</span>
												<span
													className="uw-msg-name"
													style={{ color: msg.sender.identity?.color || undefined }}
												>
													{msg.sender.username}
												</span>
												<span
												className="uw-msg-content"
												dangerouslySetInnerHTML={{
													__html: renderMessageHtml(
														msg.content,
														emoteIndex,
														blockedEmotesSet
													),
												}}
											/>
											</li>
										))}
									</ul>
								)}
							</div>

							<div className="uw-card uw-mod-card">
								<div className="uw-card-hd">
									<h3>Moderation</h3>
									<span className="uw-card-meta">{modActions.length} actions</span>
								</div>
								{modActions.length === 0 ? (
									<p className="uw-empty-state">No moderation actions captured.</p>
								) : (
									<ul className="uw-msg-list">
										{modActions.slice(-3).map((a) => (
											<li key={a.id} className="uw-mod-row">
												<span className="uw-msg-time">
													{moment(new Date(a.created_at)).format("HH:mm")}
												</span>
												<span className={`uw-action-pill uw-action-${a.type}`}>
													{a.type.toUpperCase()}
												</span>
												<span className="uw-muted">
													{a.banned_by?.username ||
														a.unbanned_by?.username ||
														"system"}
												</span>
												<span
													className={`uw-status-pill uw-status-${a.status || "success"}`}
												>
													{a.status || "success"}
												</span>
											</li>
										))}
									</ul>
								)}
							</div>
						</div>
					)}

					{/* Messages */}
					{activeTab === "messages" && (
						<div className="uw-tab-content">
							{messages.length === 0 ? (
								<p className="uw-empty-state">No messages this session.</p>
							) : (
								<ul className="uw-msg-list uw-msg-list--full">
									{messages.map((msg) => (
										<li key={msg.id} className={`uw-msg-row${msg.removed ? " is-removed" : ""}`}>
											<span className="uw-msg-time">
												{moment(new Date(msg.created_at)).format("HH:mm:ss")}
											</span>
											<span
												className="uw-msg-name"
												style={{ color: msg.sender.identity?.color || undefined }}
											>
												{msg.sender.username}
											</span>
											<span
												className="uw-msg-content"
												dangerouslySetInnerHTML={{
													__html: renderMessageHtml(
														msg.content,
														emoteIndex,
														blockedEmotesSet
													),
												}}
											/>
											{canUseModerationUi && (
												<button
													type="button"
													className="uw-inline-del"
													disabled={!canDeleteMessages || msg.removed || moderationLoading === `delete-${msg.id}`}
													onClick={() => runDeleteMessage(msg)}
												>
													{moderationLoading === `delete-${msg.id}` ? "..." : "Delete"}
												</button>
											)}
										</li>
									))}
								</ul>
							)}
						</div>
					)}

					{/* Activity */}
					{activeTab === "activity" && (
						<div className="uw-tab-content">
							<p className="uw-empty-state">
								No per-user activity captured yet.
							</p>
						</div>
					)}

					{/* Mod history */}
					{activeTab === "modhistory" && (
						<div className="uw-tab-content">
							{modActions.length === 0 ? (
								<p className="uw-empty-state">No moderation actions captured.</p>
							) : (
								<ul className="uw-msg-list uw-msg-list--full">
									{modActions.map((a) => (
										<li key={a.id} className="uw-mod-row">
											<span className="uw-msg-time">
												{moment(new Date(a.created_at)).format("HH:mm:ss")}
											</span>
											<span className={`uw-action-pill uw-action-${a.type}`}>
												{a.type.toUpperCase()}
											</span>
											<span className="uw-muted">
												by{" "}
												{a.banned_by?.username ||
													a.unbanned_by?.username ||
													"system"}
											</span>
											{a.message?.messageList?.[0] && (
												<span
													className="uw-muted uw-msg-excerpt"
													dangerouslySetInnerHTML={{
														__html:
															'"' +
															renderMessageHtmlSnippet(
																a.message.messageList[0].content,
																emoteIndex,
																blockedEmotesSet,
																60
															) +
															'"',
													}}
												/>
											)}
											<span
												className={`uw-status-pill uw-status-${a.status || "success"}`}
											>
												{a.status || "success"}
											</span>
										</li>
									))}
								</ul>
							)}
						</div>
					)}

					{/* Notes */}
					{activeTab === "notes" && (
						<div className="uw-tab-content uw-notes-tab">
							{notes.length === 0 ? (
								<p className="uw-empty-state">No notes yet. Add one below.</p>
							) : (
								<ul className="uw-notes-list">
									{notes.map((n, i) => (
										<li key={i} className="uw-note-row">
											<span className="uw-msg-time">
												{moment(n.ts).format("MM/DD HH:mm")}
											</span>
											<span className="uw-note-text">{n.text}</span>
										</li>
									))}
								</ul>
							)}
							<div className="uw-notes-composer">
								<textarea
									className="uw-notes-input"
									placeholder="Add a note..."
									value={noteInput}
									rows={2}
									onChange={(e) => setNoteInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
											handleSaveNote();
										}
									}}
								/>
								<button
									type="button"
									className="uw-btn-primary"
									onClick={handleSaveNote}
									disabled={!noteInput.trim()}
								>
									Save note
								</button>
							</div>
						</div>
					)}

					{/* Sprint 57: My Channel tab tamamen kaldırıldı (rol verme
					    işlevi Kick API tarafından desteklenmiyordu). */}
				</div>
			</div>

		</div>
	);
};

export default UserWindow;
