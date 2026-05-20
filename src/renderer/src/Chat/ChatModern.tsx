/**
 * Sprint 3 — ChatModern: Modern chat panel.
 *
 * Mirrors Designs/chat.jsx ChatMessage + ChatPanel structure.
 * CONSTRAINT-4: All message HTML goes through renderMessageHtml (chatHtml.ts)
 * which uses escapeHtml + tokenizeMessage. dangerouslySetInnerHTML only via
 * this sanitized path. Classic Chat.tsx is NOT modified.
 *
 * Redux integration: useFanthalSelector / useFanthalDispatch (same as Chat.tsx).
 * Channel filter: active channel slug from getActiveChannelSlug().
 * Emote autocomplete: EmoteAutocompleteModern (separate file).
 */

import Moment from "moment";
import React, {
	FormEvent,
	FunctionComponent,
	KeyboardEvent,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	LuClock,
	LuCornerUpLeft,
	LuInfo,
	LuPin,
	LuRefreshCw,
	LuSend,
	LuShield,
	LuSmile,
	LuTrash2,
} from "react-icons/lu";
import { toast } from "react-toastify";
import MessageActionsFunc from "../../store/actions/chatMessage";
import {
	useFanthalDispatch,
	useFanthalSelector,
} from "../../store/hooks/hooks";
import {
	chatCommandDefinitions,
	getDefaultTimeoutSeconds,
	parseChatCommand,
} from "../../util/chatCommands";
import { User, UserMessage } from "../../util/chatInterface";
import { getActiveChannelSlug } from "../../util/channelSettings";
import { refreshChannelEmoteBundle } from "../../util/chatConnection";
import { buildBadgesHtml, renderMessageHtml } from "../../util/chatHtml";
import {
	createEmoteImg,
	extractComposerText,
	putCaretAtEnd,
	replaceKickBracketsInDom,
} from "../../util/composerDom";
import { buildEmoteIndex, EmoteIndex, searchEmotes } from "../../util/emoteIndex";
import { escapeHtml, safeColor } from "../../util/htmlSafe";
import {
	getBlockedEmotes,
	getSuspendedUsers,
	LOCAL_MODERATION_SETTINGS_CHANGED,
} from "../../util/localModerationStorage";
import { buildUserWindowPayload } from "../../util/userWindowPayload";
import EmoteAutocompleteModern from "./EmoteAutocompleteModern";
import EmotePickerModern from "./EmotePickerModern";

// ────────── Types ──────────

export interface SystemRow {
	system: "mod-action" | "timeout" | "info";
	actor?: string;
	action?: string;
	target?: string;
	text?: string;
}

export type ChatRowData = UserMessage | SystemRow;

function isSystemRow(row: ChatRowData): row is SystemRow {
	return "system" in row;
}

// ────────── SystemMessage ──────────

interface SystemMessageProps {
	row: SystemRow;
}

const SystemMessage: FunctionComponent<SystemMessageProps> = ({ row }) => {
	if (row.system === "mod-action") {
		return (
			<div className="chat-system" role="status">
				<span className="sys-icon">
					<LuShield size={12} aria-hidden />
				</span>
				<span>
					<span className="sys-actor">{escapeHtml(row.actor ?? "")}</span>
					{" "}
					{row.action}
					{" from "}
					<span className="sys-actor">{escapeHtml(row.target ?? "")}</span>
				</span>
			</div>
		);
	}
	if (row.system === "timeout") {
		return (
			<div className="chat-system" role="status">
				<span className="sys-icon" style={{ color: "var(--ms-ac-warn)" }}>
					<LuClock size={12} aria-hidden />
				</span>
				<span>{row.text}</span>
			</div>
		);
	}
	if (row.system === "info") {
		return (
			<div className="chat-system" role="status">
				<span className="sys-icon" style={{ color: "var(--ms-ac-mint)" }}>
					<LuInfo size={12} aria-hidden />
				</span>
				<span>{row.text}</span>
			</div>
		);
	}
	return null;
};

// ────────── ChatRow ──────────

interface ChatRowProps {
	message: UserMessage;
	username?: string;
	susUsers: string[];
	badgesHtml: string;
	contentHtml: string;
	onReply: (msg: UserMessage) => void;
	onPin: (msg: UserMessage) => void;
	onTimeout: (msg: UserMessage) => void;
	onRemove: (msg: UserMessage) => void;
	/** Single-click on username: set as moderation target (no window). */
	onUsernameClick: (msg: UserMessage) => void;
	/** Double-click on username: open user detail window. */
	onUsernameDoubleClick: (msg: UserMessage) => void;
	onContextMenu: (msg: UserMessage, x: number, y: number) => void;
	canModerate: boolean;
}

const ChatRow: FunctionComponent<ChatRowProps> = ({
	message,
	username,
	susUsers,
	badgesHtml,
	contentHtml,
	onReply,
	onPin,
	onTimeout,
	onRemove,
	onUsernameClick,
	onUsernameDoubleClick,
	onContextMenu,
	canModerate,
}) => {
	const sender = message.sender;
	const senderUsername = sender?.username || "";
	const senderColor = safeColor(sender?.identity?.color || "white");
	const originalSenderUsername = message.metadata?.original_sender?.username || "";
	const originalMessageContent = message.metadata?.original_message?.content || "";

	const isReply =
		message.type === "reply" &&
		originalSenderUsername !== "" &&
		originalMessageContent !== "";

	const isMention =
		!!username &&
		(originalSenderUsername.toLowerCase() === username.toLowerCase() ||
			message.content.toLowerCase().includes(username.toLowerCase()));

	const isSus = susUsers.some(
		(u) => u.toLowerCase() === senderUsername.toLowerCase()
	);

	const isRemoved = !!message.removed;

	const cls = [
		"chat-row",
		isMention && "is-mention",
		isSus && "is-suspicious",
		isRemoved && "is-removed",
	]
		.filter(Boolean)
		.join(" ");

	const timestamp = Moment(
		new Date(message.created_at),
		"YYYY-MM-DDTHH:mm:ss"
	).format("HH:mm");

	return (
		<div
			className={cls}
			data-message-id={message.id}
			onContextMenu={(e) => {
				e.preventDefault();
				onContextMenu(message, e.clientX, e.clientY);
			}}
		>
			<div className="chat-time mono num">{timestamp}</div>
			<div className="chat-body">
				{isReply && (
					<div className="chat-reply">
						<span className="chat-reply-name">@{originalSenderUsername}</span>
						<span
							style={{
								color: "var(--ms-fg-3)",
								whiteSpace: "nowrap",
								overflow: "hidden",
								textOverflow: "ellipsis",
								maxWidth: 380,
								display: "inline-block",
							}}
						>
							{originalMessageContent.substring(0, 60)}
							{originalMessageContent.length > 60 ? "…" : ""}
						</span>
					</div>
				)}
				{badgesHtml && (
					<span
						className="chat-badges"
						dangerouslySetInnerHTML={{ __html: badgesHtml }}
					/>
				)}
				<span
					className="chat-name"
					style={{ color: senderColor, cursor: "pointer" }}
					onClick={() => onUsernameClick(message)}
					onDoubleClick={(e) => {
						e.preventDefault();
						onUsernameDoubleClick(message);
					}}
					title={`Click to set as mod target · double-click to open profile`}
					aria-label={`${senderUsername} — click to select, double-click for details`}
				>
					{senderUsername}
				</span>
				{": "}
				<span
					className="chat-text"
					dangerouslySetInnerHTML={{ __html: contentHtml }}
				/>
			</div>
			<div className="chat-tools" role="toolbar" aria-label="Message actions">
				<button
					title="Reply"
					aria-label="Reply"
					onClick={() => onReply(message)}
				>
					<LuCornerUpLeft size={12} aria-hidden />
				</button>
				{canModerate && (
					<>
						<button
							title="Pin"
							aria-label="Pin message"
							onClick={() => onPin(message)}
						>
							<LuPin size={12} aria-hidden />
						</button>
						<button
							title="Timeout"
							aria-label="Timeout user"
							onClick={() => onTimeout(message)}
						>
							<LuClock size={12} aria-hidden />
						</button>
						<button
							className="danger"
							title="Remove"
							aria-label="Remove message"
							onClick={() => onRemove(message)}
						>
							<LuTrash2 size={12} aria-hidden />
						</button>
					</>
				)}
			</div>
		</div>
	);
};

// ────────── ChatModern (main component) ──────────

interface ChatModernProps {
	/**
	 * Sprint 11: Notify parent (LayoutModern) when user explicitly picks a
	 * moderation target via username click or right-click "Set as mod target".
	 */
	onSelectModUser?: (user: User) => void;
}

const ChatModern: FunctionComponent<ChatModernProps> = ({ onSelectModUser }) => {
	const messages = useFanthalSelector((state) => state.messages);
	const dispatch = useFanthalDispatch();

	const [messageList, setMessageList] = useState<UserMessage[]>([]);
	const [username, setUsername] = useState<string | undefined>(undefined);
	const [susUsers, setSusUsers] = useState<string[]>([]);
	const [blockEmotes, setBlockEmotes] = useState<string[]>([]);
	const [messageText, setMessageText] = useState<string>("");
	const [sendingMessage, setSendingMessage] = useState<boolean>(false);
	const [paused, setPaused] = useState<boolean>(false);
	const [replyTarget, setReplyTarget] = useState<UserMessage | undefined>(undefined);
	const [emoteSuggestionIndex, setEmoteSuggestionIndex] = useState<number>(0);
	const [broadcasterUserId, setBroadcasterUserId] = useState<number | undefined>(undefined);
	const [canModerateChannel, setCanModerateChannel] = useState<boolean>(false);
	const [pickerOpen, setPickerOpen] = useState<boolean>(false);

	// Sprint 11: inline user context menu (right-click on chat row)
	const [userMenu, setUserMenu] = useState<
		{ message: UserMessage; x: number; y: number } | undefined
	>(undefined);
	const userMenuRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!userMenu) return;
		const onDocClick = (e: MouseEvent) => {
			if (
				userMenuRef.current &&
				!userMenuRef.current.contains(e.target as Node)
			) {
				setUserMenu(undefined);
			}
		};
		const onEsc = (e: Event) => {
			if ((e as unknown as { key: string }).key === "Escape") {
				setUserMenu(undefined);
			}
		};
		document.addEventListener("mousedown", onDocClick);
		document.addEventListener("keydown", onEsc);
		return () => {
			document.removeEventListener("mousedown", onDocClick);
			document.removeEventListener("keydown", onEsc);
		};
	}, [userMenu]);

	const composerRef = useRef<HTMLTextAreaElement>(null);
	const smileButtonRef = useRef<HTMLButtonElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const channelName = getActiveChannelSlug();
	const channelBadges =
		(channelName && messages.channelBadgesByChannel[channelName]) ||
		messages.channelBadges;

	const channelEmoteSets = useMemo(() => {
		if (!channelName) return [];
		return messages.emoteSetsByChannel[channelName] || [];
	}, [channelName, messages.emoteSetsByChannel]);

	const emoteIndex: EmoteIndex = useMemo(
		() => buildEmoteIndex(channelEmoteSets, messages.globalEmoteSets, channelName),
		[channelEmoteSets, messages.globalEmoteSets, channelName]
	);

	const blockedEmotesSet = useMemo(
		() => new Set(blockEmotes),
		[blockEmotes]
	);

	// Cache message HTML to avoid re-rendering on every emote index change
	const messageHtmlCacheRef = useRef<Map<string, { content: string; html: string }>>(new Map());

	useEffect(() => {
		messageHtmlCacheRef.current.clear();
	}, [emoteIndex, blockedEmotesSet]);

	const renderMessageContent = (id: string, content: string): string => {
		const cache = messageHtmlCacheRef.current;
		const cached = cache.get(id);
		if (cached && cached.content === content) {
			return cached.html;
		}
		const html = renderMessageHtml(content, emoteIndex, blockedEmotesSet);
		cache.set(id, { content, html });
		return html;
	};

	// ── Load username + sus/block lists ──
	useEffect(() => {
		const loadSettings = () => {
			const u = localStorage.getItem("username");
			if (u) setUsername(u);
			setSusUsers(getSuspendedUsers());
			setBlockEmotes(getBlockedEmotes());
		};
		loadSettings();

		const onStorage = () => loadSettings();
		window.addEventListener("storage", onStorage);
		window.addEventListener("kick-channel-settings-changed", loadSettings);
		window.addEventListener(LOCAL_MODERATION_SETTINGS_CHANGED, loadSettings);
		return () => {
			window.removeEventListener("storage", onStorage);
			window.removeEventListener("kick-channel-settings-changed", loadSettings);
			window.removeEventListener(LOCAL_MODERATION_SETTINGS_CHANGED, loadSettings);
		};
	}, []);

	// ── Filter messages by channel ──
	useEffect(() => {
		setMessageList(
			messages.messageList.filter(
				(msg) => !channelName || msg.channelSlug === channelName
			)
		);
	}, [messages.messageList, channelName]);

	// ── Auto-scroll ──
	useLayoutEffect(() => {
		if (!paused && listRef.current) {
			listRef.current.scrollTop = listRef.current.scrollHeight;
		}
	}, [messageList, paused]);

	const handleScroll = () => {
		if (!listRef.current) return;
		const el = listRef.current;
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
		setPaused(!atBottom);
	};

	// ── Load broadcaster / mod status ──
	useEffect(() => {
		const load = () => {
			const ch = localStorage.getItem("channelName")?.trim();
			if (!ch) {
				setBroadcasterUserId(undefined);
				setCanModerateChannel(false);
				return;
			}
			Promise.all([
				window.electron.kick.getChannelBySlug(ch),
				window.electron.kick.getUsers().catch(() => undefined),
			])
				.then(([channelResponse, userResponse]) => {
					const broadcasterId = channelResponse?.data?.[0]?.broadcaster_user_id;
					const oauthUserId = userResponse?.data?.[0]?.user_id;
					setBroadcasterUserId(broadcasterId);
					setCanModerateChannel(
						!!broadcasterId && !!oauthUserId && broadcasterId === oauthUserId
					);
				})
				.catch(() => {
					setBroadcasterUserId(undefined);
					setCanModerateChannel(false);
				});
		};
		load();
		window.addEventListener("kick-channel-settings-changed", load);
		return () => window.removeEventListener("kick-channel-settings-changed", load);
	}, []);

	// ── Detect mod badge fallback ──
	useEffect(() => {
		if (canModerateChannel || !username) return;
		const ownMessage = messages.messageList.find(
			(msg) =>
				(!channelName || msg.channelSlug === channelName) &&
				msg.sender?.username?.toLowerCase() === username.toLowerCase()
		);
		if (
			ownMessage?.sender.identity?.badges.some(
				(b) => b.type.toLowerCase() === "moderator"
			)
		) {
			setCanModerateChannel(true);
		}
	}, [canModerateChannel, messages.messageList, username, channelName]);

	// ── Emote autocomplete ──
	const emoteSearchMatch = useMemo(() => {
		const m = messageText.match(/(^|\s)(:([A-Za-z0-9_]{1,})$|([A-Za-z]{2,})$)/);
		if (!m) return undefined;
		// Prefer colon-triggered query
		const colonMatch = messageText.match(/(^|\s):([A-Za-z0-9_]{1,})$/);
		if (colonMatch) {
			return {
				query: colonMatch[2],
				leadIndex: colonMatch.index! + colonMatch[1].length,
				length: colonMatch[2].length + 1,
				colonTriggered: true,
			};
		}
		const wordMatch = messageText.match(/(^|\s)([A-Za-z]{2,})$/);
		if (wordMatch) {
			return {
				query: wordMatch[2],
				leadIndex: wordMatch.index! + wordMatch[1].length,
				length: wordMatch[2].length,
				colonTriggered: false,
			};
		}
		return undefined;
	}, [messageText]);

	const emoteSuggestions = useMemo(() => {
		if (!emoteSearchMatch || emoteIndex.all.length === 0) return [];
		return searchEmotes(emoteIndex, emoteSearchMatch.query, 6);
	}, [emoteSearchMatch, emoteIndex]);

	// Sprint 14: slash command autocomplete — yalniz mesaj basinda /word formatinda
	const slashMatch = useMemo(() => {
		const m = messageText.match(/^\/(\w*)$/);
		if (!m) return undefined;
		return { query: m[1].toLowerCase() };
	}, [messageText]);
	const slashSuggestions = useMemo(() => {
		if (!slashMatch) return [];
		return chatCommandDefinitions.filter((c) =>
			c.name.slice(1).startsWith(slashMatch.query)
		);
	}, [slashMatch]);
	const [slashIndex, setSlashIndex] = useState<number>(0);
	useEffect(() => {
		setSlashIndex(0);
	}, [slashMatch?.query]);

	const acOpen = emoteSuggestions.length > 0;
	const slashOpen = slashSuggestions.length > 0;

	const applySlashSuggestion = (def: typeof chatCommandDefinitions[number]) => {
		const next = def.template;
		setMessageText(next);
		if (composerRef.current) {
			composerRef.current.value = next;
			composerRef.current.focus();
			composerRef.current.setSelectionRange(next.length, next.length);
		}
	};

	useEffect(() => {
		setEmoteSuggestionIndex(0);
	}, [emoteSearchMatch?.query]);

	// ── Apply emote suggestion ──
	const applyEmoteSuggestion = (entry: { name: string; insertText: string }) => {
		if (!emoteSearchMatch) return;
		const start = emoteSearchMatch.leadIndex;
		const end = start + emoteSearchMatch.length;
		const before = messageText.slice(0, start);
		const after = messageText.slice(end);
		const insert = entry.insertText;
		const needsSpace = after.length === 0 || !/^\s/.test(after);
		const nextText = `${before}${insert}${needsSpace ? " " : ""}${after}`;
		setMessageText(nextText);
		setEmoteSuggestionIndex(0);
		if (composerRef.current) {
			composerRef.current.value = nextText;
			composerRef.current.focus();
		}
	};

	// ── Moderation ──
	const runModerationAction = (
		action: "delete" | "timeout" | "ban",
		message: UserMessage
	) => {
		if (!canModerateChannel || !broadcasterUserId) {
			toast("Moderation is only available when you are a moderator.", {
				type: "warning",
			});
			return;
		}
		const timeoutSeconds = 300;
		const reason = "Moderated from Kick Chat Viewer";
		const userId = message.sender.id;
		const localActionId = `local-mod-${action}-${Date.now()}`;
		dispatch(
			MessageActionsFunc.modMessage({
				type: action === "timeout" ? "to" : action,
				id: localActionId,
				channelSlug: channelName,
				status: "pending",
				reason,
				user: message.sender,
				banned_by:
					action === "timeout" || action === "ban"
						? {
								id: 0,
								username: username || "Moderator",
								slug: username || "moderator",
								identity: { color: "#2fd3a0", badges: [] },
						  }
						: undefined,
				expires_at:
					action === "timeout"
						? new Date(Date.now() + timeoutSeconds * 1000).toISOString()
						: undefined,
				created_at: Date.now(),
				message:
					action === "delete"
						? { id: message.id, messageList: [message] }
						: undefined,
			})
		);

		const request = {
			broadcaster_user_id: broadcasterUserId,
			user_id: userId,
			reason,
		};
		const task =
			action === "delete"
				? window.electron.kick.deleteChatMessage(message.id)
				: action === "timeout"
				? window.electron.kick.timeoutUser({ ...request, duration: timeoutSeconds })
				: window.electron.kick.banUser(request);

		task
			.then(() => {
				dispatch(MessageActionsFunc.setModActionStatus(localActionId, "success"));
				toast(`${action} sent for ${message.sender.username}`, { type: "success" });
			})
			.catch((err: any) => {
				const msg = err?.message || `${action} request failed.`;
				toast(msg, { type: "error" });
				dispatch(MessageActionsFunc.setModActionStatus(localActionId, "failed", msg));
			});
	};

	// ── Open user detail ──
	const openUserWindow = (message: UserMessage) => {
		window.electron.userWindow.open(
			buildUserWindowPayload({
				user: message.sender,
				messages: messages.messageList,
				modActions: messages.modAction,
				openedFrom: "chat",
				channelName,
				canModerateChannel,
			})
		);
	};

	// ── Composer send ──
	const sendMessage = async () => {
		const content = messageText.trim();
		const ch = localStorage.getItem("channelName")?.trim();
		if (!content) return;
		if (!ch) {
			toast("Channel name is required.", { type: "warning" });
			return;
		}

		// Sprint 18: slash command interception. If the composer starts with /,
		// parse + execute locally instead of sending as a chat message.
		if (content.startsWith("/")) {
			const parsed = parseChatCommand(content);
			if (parsed?.error) {
				toast(parsed.error, { type: "warning" });
				return;
			}
			if (parsed) {
				const findUserMessage = (uname: string) =>
					messages.messageList.find(
						(m) =>
							m.sender?.username?.toLowerCase() === uname.toLowerCase()
					);
				const targetMsg = parsed.targetUsername
					? findUserMessage(parsed.targetUsername)
					: undefined;
				const targetUserId = targetMsg?.sender?.id;

				if (parsed.command === "user") {
					if (!targetMsg) {
						toast(
							`User "${parsed.targetUsername}" not found in current chat.`,
							{ type: "warning" }
						);
						return;
					}
					openUserWindow(targetMsg);
					setMessageText("");
					return;
				}

				if (!broadcasterUserId) {
					toast("Channel is still loading; try again in a moment.", {
						type: "warning",
					});
					return;
				}
				if (!targetUserId) {
					toast(
						`User "${parsed.targetUsername}" not found in current chat.`,
						{ type: "warning" }
					);
					return;
				}

				if (parsed.command === "ban") {
					window.electron.kick
						.banUser({
							broadcaster_user_id: broadcasterUserId,
							user_id: targetUserId,
							reason: parsed.reason,
						})
						.then(() =>
							toast(`Banned @${parsed.targetUsername}.`, { type: "success" })
						)
						.catch((err: any) =>
							toast(err?.message || "Ban failed.", { type: "error" })
						);
					setMessageText("");
					return;
				}
				if (parsed.command === "unban") {
					window.electron.kick
						.unbanUser({
							broadcaster_user_id: broadcasterUserId,
							user_id: targetUserId,
						})
						.then(() =>
							toast(`Unbanned @${parsed.targetUsername}.`, {
								type: "success",
							})
						)
						.catch((err: any) =>
							toast(err?.message || "Unban failed.", { type: "error" })
						);
					setMessageText("");
					return;
				}
				if (parsed.command === "to" || parsed.command === "timeout") {
					const duration = parsed.timeoutSeconds || getDefaultTimeoutSeconds();
					window.electron.kick
						.timeoutUser({
							broadcaster_user_id: broadcasterUserId,
							user_id: targetUserId,
							duration,
							reason: parsed.reason,
						})
						.then(() =>
							toast(
								`Timed out @${parsed.targetUsername} for ${duration}s.`,
								{ type: "success" }
							)
						)
						.catch((err: any) =>
							toast(err?.message || "Timeout failed.", { type: "error" })
						);
					setMessageText("");
					return;
				}
			}
		}
		const optimistic: UserMessage = {
			id: `local-${Date.now()}`,
			channelSlug: ch,
			chatroom_id: 0,
			content,
			type: "message",
			created_at: new Date().toISOString(),
			sender: {
				id: 0,
				username: username || "You",
				slug: username || "you",
				identity: { color: "#00d084", badges: [] },
			},
		};
		const replyToMessageId = replyTarget?.id;
		dispatch(MessageActionsFunc.newMessage(optimistic));
		setMessageText("");
		setReplyTarget(undefined);
		if (composerRef.current) {
			composerRef.current.value = "";
			composerRef.current.focus();
		}
		setSendingMessage(true);

		const send = (targetId: number) =>
			window.electron.kick.sendChatMessage({
				broadcaster_user_id: targetId,
				content,
				type: "user",
				...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
			});

		const request = broadcasterUserId
			? send(broadcasterUserId)
			: window.electron.kick
					.getChannelBySlug(ch)
					.then((resp: any) => {
						const bid = resp?.data?.[0]?.broadcaster_user_id;
						if (!bid) throw new Error("Channel not found.");
						setBroadcasterUserId(bid);
						return send(bid);
					});

		request
			.catch((err: any) => {
				toast(err?.message || "Message could not be sent.", { type: "error" });
			})
			.finally(() => {
				setSendingMessage(false);
				composerRef.current?.focus();
			});
	};

	// ── Keyboard handler ──
	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (slashOpen) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setSlashIndex((prev) => (prev + 1) % slashSuggestions.length);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setSlashIndex(
					(prev) => (prev - 1 + slashSuggestions.length) % slashSuggestions.length
				);
				return;
			}
			if (event.key === "Tab" || event.key === "Enter") {
				event.preventDefault();
				applySlashSuggestion(slashSuggestions[slashIndex]);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setSlashIndex(0);
				return;
			}
		}
		if (acOpen) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setEmoteSuggestionIndex((prev) => (prev + 1) % emoteSuggestions.length);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setEmoteSuggestionIndex(
					(prev) => (prev - 1 + emoteSuggestions.length) % emoteSuggestions.length
				);
				return;
			}
			if (event.key === "Tab" || event.key === "Enter") {
				event.preventDefault();
				applyEmoteSuggestion(emoteSuggestions[emoteSuggestionIndex]);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setEmoteSuggestionIndex(0);
				return;
			}
		}
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	};

	// Sprint 14: composer textarea auto-grow up to 3 lines, scroll inside after.
	useEffect(() => {
		const el = composerRef.current;
		if (!el) return;
		el.style.height = "auto";
		// 3 satir + padding ~= 64px (line-height 1.45 * 13px * 3 + ~6 padding)
		const next = Math.min(el.scrollHeight, 64);
		el.style.height = next + "px";
	}, [messageText, replyTarget]);

	// ── Refresh emotes ──
	const handleRefresh = () => {
		if (channelName) {
			dispatch(refreshChannelEmoteBundle(channelName));
		}
	};

	// ── Ctrl+E opens emote picker ──
	useEffect(() => {
		const handleGlobalKey = (e: globalThis.KeyboardEvent) => {
			if (e.ctrlKey && e.key === "e") {
				e.preventDefault();
				setPickerOpen((v) => !v);
			}
		};
		window.addEventListener("keydown", handleGlobalKey);
		return () => window.removeEventListener("keydown", handleGlobalKey);
	}, []);

	// ── Insert emote from picker at cursor or end ──
	const handlePickerInsert = (entry: { insertText: string }) => {
		const insert = entry.insertText;
		const ta = composerRef.current;
		if (ta) {
			const start = ta.selectionStart ?? ta.value.length;
			const end = ta.selectionEnd ?? ta.value.length;
			const before = ta.value.slice(0, start);
			const after = ta.value.slice(end);
			const needsSpace = before.length > 0 && !/\s$/.test(before);
			const nextText = `${before}${needsSpace ? " " : ""}${insert} ${after}`;
			setMessageText(nextText);
			ta.value = nextText;
			ta.focus();
		} else {
			const needsSpace = messageText.length > 0 && !/\s$/.test(messageText);
			setMessageText((prev) => `${prev}${needsSpace ? " " : ""}${insert} `);
		}
	};

	return (
		<div
			className="chat-panel-modern"
			style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
		>
			{/* Panel header */}
			<div className="panel-hd">
				<h2>
					Chat
					{/* Fix 12: message count badge */}
					<span className="count num" style={{ fontFamily: "var(--ms-font-mono, ui-monospace, monospace)", fontVariantNumeric: "tabular-nums", fontSize: 11, color: "var(--ms-fg-3, #828690)", fontWeight: 400 }}>
						{messageList.length}
					</span>
				</h2>
				<div className="panel-hd-actions">
					<button
						className="icon-btn"
						title={paused ? "Resume scroll" : "Pause scroll"}
						aria-label={paused ? "Resume auto-scroll" : "Pause auto-scroll"}
						onClick={() => setPaused((v) => !v)}
					>
						{paused ? (
							<LuRefreshCw size={14} aria-hidden />
						) : (
							<LuRefreshCw size={14} aria-hidden />
						)}
					</button>
					<button
						className="icon-btn"
						title="Refresh emotes"
						aria-label="Refresh emotes"
						onClick={handleRefresh}
					>
						<LuRefreshCw size={14} aria-hidden />
					</button>
				</div>
			</div>

			{/* Message list */}
			<div
				ref={listRef}
				className="chat-list scroll"
				onScroll={handleScroll}
				style={{ flex: "1 1 auto", overflowY: "auto", position: "relative" }}
				role="log"
				aria-live="polite"
				aria-label="Chat messages"
			>
				{messageList.map((msg) => {
					const badgesHtml = buildBadgesHtml(
						msg.sender?.identity?.badges,
						channelBadges
					);
					const contentHtml = renderMessageContent(msg.id, msg.content);
					return (
						<ChatRow
							key={`chat-row-${msg.id}`}
							message={msg}
							username={username}
							susUsers={susUsers}
							badgesHtml={badgesHtml}
							contentHtml={contentHtml}
							onReply={(m) => {
								setReplyTarget(m);
								composerRef.current?.focus();
							}}
							onPin={(m) => {
								toast(`Pin not yet implemented for ${m.sender.username}.`, {
									type: "info",
								});
							}}
							onTimeout={(m) => runModerationAction("timeout", m)}
							onRemove={(m) => runModerationAction("delete", m)}
							onUsernameClick={(m) => {
								// Sprint 11 → 12: single click ONLY sets mod target.
								// User detail window now opens on double-click below.
								if (m.sender) {
									onSelectModUser?.(m.sender);
								}
							}}
							onUsernameDoubleClick={(m) => openUserWindow(m)}
							onContextMenu={(m, x, y) => setUserMenu({ message: m, x, y })}
							canModerate={canModerateChannel}
						/>
					);
				})}
			</div>

			{/* Sprint 11: user context menu (right-click) */}
			{userMenu && (
				<div
					ref={userMenuRef}
					className="chat-user-menu"
					style={{
						position: "fixed",
						left: Math.min(userMenu.x, window.innerWidth - 220),
						top: Math.min(userMenu.y, window.innerHeight - 220),
						zIndex: 200,
					}}
					role="menu"
					aria-label={`Actions for ${userMenu.message.sender?.username}`}
				>
					<div className="chat-user-menu-title">
						{userMenu.message.sender?.username}
					</div>
					<button
						type="button"
						role="menuitem"
						onClick={() => {
							if (userMenu.message.sender) {
								onSelectModUser?.(userMenu.message.sender);
							}
							setUserMenu(undefined);
						}}
					>
						Set as mod target
					</button>
					<button
						type="button"
						role="menuitem"
						onClick={() => {
							openUserWindow(userMenu.message);
							setUserMenu(undefined);
						}}
					>
						Open user detail
					</button>
					<button
						type="button"
						role="menuitem"
						onClick={() => {
							const name = userMenu.message.sender?.username || "";
							const next = messageText.endsWith(" ") || messageText.length === 0
								? `${messageText}@${name} `
								: `${messageText} @${name} `;
							setMessageText(next);
							if (composerRef.current) {
								composerRef.current.value = next;
								composerRef.current.focus();
							}
							setUserMenu(undefined);
						}}
					>
						Mention @{userMenu.message.sender?.username}
					</button>
					<button
						type="button"
						role="menuitem"
						onClick={() => {
							navigator.clipboard?.writeText(
								userMenu.message.sender?.username || ""
							);
							setUserMenu(undefined);
						}}
					>
						Copy username
					</button>
					{canModerateChannel && (
						<>
							<div className="chat-user-menu-divider" />
							<button
								type="button"
								role="menuitem"
								onClick={() => {
									runModerationAction("timeout", userMenu.message);
									setUserMenu(undefined);
								}}
							>
								Timeout (default)
							</button>
							<button
								type="button"
								role="menuitem"
								className="danger"
								onClick={() => {
									runModerationAction("delete", userMenu.message);
									setUserMenu(undefined);
								}}
							>
								Delete message
							</button>
						</>
					)}
				</div>
			)}

			{/* Auto-scroll paused pill */}
			{paused && (
				<button
					className="chat-pause"
					aria-live="polite"
					onClick={() => {
						setPaused(false);
						if (listRef.current) {
							listRef.current.scrollTop = listRef.current.scrollHeight;
						}
					}}
				>
					<span className="chat-pause-dot" aria-hidden />
					Auto-scroll paused · jump to live
				</button>
			)}

			{/* Composer area */}
			<div className="composer-wrap">
				{replyTarget && (
					<div className="composer-reply">
						<span>
							Replying to{" "}
							<b style={{ color: "var(--ms-fg-1)" }}>
								@{replyTarget.sender.username}
							</b>
							<span style={{ margin: "0 6px", color: "var(--ms-fg-3)" }}>·</span>
							{replyTarget.content.substring(0, 50)}
							{replyTarget.content.length > 50 ? "…" : ""}
						</span>
						<button
							aria-label="Cancel reply"
							style={{ color: "var(--ms-fg-3)" }}
							onClick={() => setReplyTarget(undefined)}
						>
							×
						</button>
					</div>
				)}

				<div
					className={`composer${replyTarget ? " has-reply" : ""}`}
					style={{ position: "relative" }}
				>
					{/* Emote autocomplete — floats above composer */}
					{acOpen && (
						<EmoteAutocompleteModern
							suggestions={emoteSuggestions}
							activeIndex={emoteSuggestionIndex}
							onPick={applyEmoteSuggestion}
							onHover={(index) => setEmoteSuggestionIndex(index)}
						/>
					)}

					{/* Sprint 14: slash command suggestions */}
					{slashOpen && (
						<div
							className="autocomplete chat-suggestion-menu"
							role="listbox"
							aria-label="Chat commands"
						>
							{slashSuggestions.map((def, i) => (
								<div
									key={def.name}
									role="option"
									aria-selected={i === slashIndex}
									className={`ac-row ${i === slashIndex ? "is-active" : ""}`}
									onMouseEnter={() => setSlashIndex(i)}
									onMouseDown={(e) => {
										e.preventDefault();
										applySlashSuggestion(def);
									}}
								>
									<div className="ac-emote" style={{ width: 22, fontFamily: "var(--ms-font-mono)" }}>/</div>
									<div className="ac-name">
										<span style={{ color: "var(--ms-fg-1, #ebecef)", fontFamily: "var(--ms-font-mono)" }}>
											{def.name}
										</span>
										<div className="chat-suggestion-description" style={{ fontSize: 11, color: "var(--ms-fg-3, #828690)" }}>
											{def.description} — <span className="mono">{def.usage}</span>
										</div>
									</div>
								</div>
							))}
						</div>
					)}

					<textarea
						ref={composerRef}
						className="composer-input"
						placeholder={
							replyTarget
								? `Reply to @${replyTarget.sender.username}…`
								: "Send a message"
						}
						value={messageText}
						rows={1}
						disabled={sendingMessage}
						onChange={(e) => setMessageText(e.target.value)}
						onKeyDown={handleKeyDown}
						aria-label="Chat message input"
					/>

					<div className="composer-tools">
						<button
							ref={smileButtonRef}
							className="icon-btn"
							title="Emote picker (Ctrl+E)"
							aria-label="Open emote picker"
							type="button"
							style={{ width: 28, height: 28 }}
							onClick={() => setPickerOpen((v) => !v)}
							data-testid="smile-btn"
						>
							<LuSmile size={15} aria-hidden />
						</button>
						<button
							className="composer-send"
							type="button"
							disabled={!messageText.trim() || sendingMessage}
							onClick={sendMessage}
							aria-label="Send message"
						>
							Send <LuSend size={11} aria-hidden />
						</button>
					</div>
				</div>

				<div className="composer-meta">
					<span>
						{username ? (
							<>
								<span style={{ color: "var(--ms-ac-mint)" }}>●</span>
								{" Connected as "}
								<b style={{ color: "var(--ms-fg-1)" }}>{username}</b>
							</>
						) : (
							<span style={{ color: "var(--ms-fg-3)" }}>Not connected</span>
						)}
					</span>
					<span className="mono num" style={{ color: "var(--ms-fg-3)", fontSize: 11 }}>
						⏎ send · ⇧⏎ newline · : emote · Ctrl+E picker
					</span>
				</div>
			</div>

			{/* Emote picker modal */}
			<EmotePickerModern
				open={pickerOpen}
				onClose={() => setPickerOpen(false)}
				index={emoteIndex}
				onPick={(entry) => {
					handlePickerInsert(entry);
				}}
				onRefresh={handleRefresh}
				anchorRef={smileButtonRef}
			/>
		</div>
	);
};

export default ChatModern;
