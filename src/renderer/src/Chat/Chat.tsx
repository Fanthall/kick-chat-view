import Moment from "moment";
import { Button } from "@nextui-org/react";
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
import { GoReply } from "react-icons/go";
import { TfiAnnouncement } from "react-icons/tfi";
import { toast } from "react-toastify";
import { EmoteEntry } from "../../constants/emote";
import MessageActionsFunc from "../../store/actions/chatMessage";
import {
	useFanthalDispatch,
	useFanthalSelector,
} from "../../store/hooks/hooks";
import { UserMessage } from "../../util/chatInterface";
import {
	chatCommandDefinitions,
	getDefaultTimeoutSeconds,
	parseChatCommand,
} from "../../util/chatCommands";
import { getActiveChannelSlug } from "../../util/channelSettings";
import { refreshChannelEmoteBundle } from "../../util/chatConnection";
import { buildBadgesHtml, renderMessageHtml } from "../../util/chatHtml";
import {
	createEmoteImg,
	extractComposerText,
	putCaretAtEnd,
	replaceKickBracketsInDom,
} from "../../util/composerDom";
import { buildEmoteIndex, searchEmotes } from "../../util/emoteIndex";
import { escapeHtml, safeColor } from "../../util/htmlSafe";
import {
	getBlockedEmotes,
	getSuspendedUsers,
	LOCAL_MODERATION_SETTINGS_CHANGED,
} from "../../util/localModerationStorage";
import { hasKickScope, parseKickScopes } from "../../util/kickScopes";
import {
	getModCheckMessage,
	hasSentModCheckForChannel,
	markModCheckSentForChannel,
} from "../../util/modDetectionSettings";
import { formatTimeoutDuration } from "../../util/timeoutDuration";
import { buildUserWindowPayload } from "../../util/userWindowPayload";
import { resolveUserMessage } from "../../util/userResolver";
import ScrollableView from "../Component/ScrollableView/ScrollableView";
import EmoteAutocomplete from "./EmoteAutocomplete";
import EmotePicker from "./EmotePicker";

interface ChatProps {}
const Chat: FunctionComponent<ChatProps> = () => {
	const messages = useFanthalSelector((state) => state.messages);
	const [messageList, setMessageList] = useState<UserMessage[]>([]);
	const dispatch = useFanthalDispatch();
	const [username, setUsername] = useState<string | undefined>(undefined);
	const [susUsers, setSusUsers] = useState<string[]>([]);
	const [blockEmotes, setBlockEmotes] = useState<string[]>([]);
	const [messageText, setMessageText] = useState<string>("");
	const [sendingMessage, setSendingMessage] = useState<boolean>(false);
	const [mentionIndex, setMentionIndex] = useState<number>(0);
	const [commandIndex, setCommandIndex] = useState<number>(0);
	const [commandHistory, setCommandHistory] = useState<string[]>([]);
	const [commandHistoryIndex, setCommandHistoryIndex] = useState<number | undefined>();
	const [userContextMenu, setUserContextMenu] = useState<
		| {
				x: number;
				y: number;
				message: UserMessage;
		  }
		| undefined
	>(undefined);
	const composerRef = useRef<HTMLDivElement>(null);
	const emotePickerButtonRef = useRef<HTMLButtonElement>(null);
	const userContextMenuRef = useRef<HTMLDivElement>(null);
	const pendingModCheckChannelsRef = useRef<Set<string>>(new Set());
	const [broadcasterUserId, setBroadcasterUserId] = useState<
		number | undefined
	>(undefined);
	const [canModerateChannel, setCanModerateChannel] =
		useState<boolean>(false);
	const [tokenScopes, setTokenScopes] = useState<string[]>([]);
	const channelName = getActiveChannelSlug();
	const channelBadges =
		(channelName && messages.channelBadgesByChannel[channelName]) ||
		messages.channelBadges;

	const channelEmoteSets = useMemo(() => {
		if (!channelName) return [];
		return messages.emoteSetsByChannel[channelName] || [];
	}, [channelName, messages.emoteSetsByChannel]);

	const emoteIndex = useMemo(
		() => buildEmoteIndex(channelEmoteSets, messages.globalEmoteSets, channelName),
		[channelEmoteSets, messages.globalEmoteSets, channelName]
	);
	const blockedEmotesSet = useMemo(
		() => new Set(blockEmotes),
		[blockEmotes]
	);

	const [emotePickerOpen, setEmotePickerOpen] = useState(false);
	const [emoteSuggestionIndex, setEmoteSuggestionIndex] = useState(0);
	const [replyTarget, setReplyTarget] = useState<UserMessage | undefined>(
		undefined
	);

	const messageHtmlCacheRef = useRef<
		Map<string, { content: string; html: string }>
	>(new Map());

	useEffect(() => {
		messageHtmlCacheRef.current.clear();
	}, [emoteIndex, blockedEmotesSet]);

	const renderMessageContent = (id: string, content: string) => {
		const cache = messageHtmlCacheRef.current;
		const cached = cache.get(id);
		if (cached && cached.content === content) {
			return cached.html;
		}
		const html = renderMessageHtml(content, emoteIndex, blockedEmotesSet);
		cache.set(id, { content, html });
		return html;
	};

	const focusComposer = () => {
		window.setTimeout(() => {
			composerRef.current?.focus();
		}, 0);
	};

	const setComposerText = (nextText: string) => {
		setMessageText(nextText);
		const composer = composerRef.current;
		if (!composer) return;
		// DOM'u temizle ve dosyali metni yaz, sonra Kick bracketlerini IMG'e cevir
		composer.textContent = nextText;
		replaceKickBracketsInDom(composer, emoteIndex);
		putCaretAtEnd(composer);
	};

	useEffect(() => {
		const setName = () => {
			const username = localStorage.getItem("username");
			if (username) setUsername(username);
			setSusUsers(getSuspendedUsers());
			setBlockEmotes(getBlockedEmotes());
		};
		const setSusAndBlockEmotes = () => {
			const username = localStorage.getItem("username");
			if (username) setUsername(username);
			setSusUsers(getSuspendedUsers());
			setBlockEmotes(getBlockedEmotes());
		};

		setName();
		function localStorageChanged(event: StorageEvent) {
			setSusAndBlockEmotes();

			// Değişiklik yapılan localStorage anahtarını kontrol edebilirsiniz.
			// event.key kullanarak.
			// Yeni ve eski değerleri event.newValue ve event.oldValue kullanarak alabilirsiniz.
		}

		window.addEventListener("storage", localStorageChanged);
		window.addEventListener(
			"kick-channel-settings-changed",
			setSusAndBlockEmotes
		);
		window.addEventListener(
			LOCAL_MODERATION_SETTINGS_CHANGED,
			setSusAndBlockEmotes
		);
		return () => {
			window.removeEventListener("storage", localStorageChanged);
			window.removeEventListener(
				"kick-channel-settings-changed",
				setSusAndBlockEmotes
			);
			window.removeEventListener(
				LOCAL_MODERATION_SETTINGS_CHANGED,
				setSusAndBlockEmotes
			);
		};
	}, []);

	useEffect(() => {
		focusComposer();
	}, []);

	useLayoutEffect(() => {
		if (!userContextMenu) return;
		const el = userContextMenuRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const margin = 8;
		let nextLeft = userContextMenu.x;
		let nextTop = userContextMenu.y;
		if (nextLeft + rect.width > vw - margin) {
			nextLeft = Math.max(margin, vw - rect.width - margin);
		}
		if (nextTop + rect.height > vh - margin) {
			nextTop = Math.max(margin, vh - rect.height - margin);
		}
		el.style.left = `${nextLeft}px`;
		el.style.top = `${nextTop}px`;
	}, [userContextMenu, canModerateChannel]);

	useEffect(() => {
		if (!userContextMenu) return;

		const closeMenu = () => setUserContextMenu(undefined);
		const closeOnEscape = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") {
				closeMenu();
			}
		};

		window.addEventListener("mousedown", closeMenu);
		window.addEventListener("resize", closeMenu);
		window.addEventListener("keydown", closeOnEscape);
		return () => {
			window.removeEventListener("mousedown", closeMenu);
			window.removeEventListener("resize", closeMenu);
			window.removeEventListener("keydown", closeOnEscape);
		};
	}, [userContextMenu]);

	useEffect(() => {
		setMessageList(
			messages.messageList.filter(
				(message) => !channelName || message.channelSlug === channelName
			)
		);
	}, [messages.messageList, channelName]);

	useEffect(() => {
		const latestMessage = messages.messageList[messages.messageList.length - 1];
		if (!latestMessage?.sender?.username) return;

		window.electron.userWindow.update(
			buildUserWindowPayload({
				user: latestMessage.sender,
				messages: messages.messageList,
				modActions: messages.modAction,
				openedFrom: "chat",
				channelName,
				canModerateChannel,
			})
		);
	}, [messages.messageList, messages.modAction, channelName, canModerateChannel]);

	useEffect(() => {
		const loadBroadcasterUserId = () => {
			const channelName = localStorage.getItem("channelName")?.trim();
			if (!channelName) {
				setBroadcasterUserId(undefined);
				setCanModerateChannel(false);
				return;
			}

			Promise.all([
				window.electron.kick.getChannelBySlug(channelName),
				window.electron.kick.getUsers().catch(() => undefined),
				window.electron.kick.getAuthStatus().catch(() => undefined),
			])
				.then(([channelResponse, userResponse, authStatus]) => {
					const broadcasterId =
						channelResponse?.data?.[0]?.broadcaster_user_id;
					const oauthUserId = userResponse?.data?.[0]?.user_id;
					const scopes = parseKickScopes(
						authStatus?.grantedScopes,
						authStatus?.tokenScope,
						authStatus?.introspection?.data?.scope,
						authStatus?.introspection?.data?.scopes
					);
					setBroadcasterUserId(broadcasterId);
					setTokenScopes(scopes);
					setCanModerateChannel(
						!!broadcasterId &&
							!!oauthUserId &&
							broadcasterId === oauthUserId
					);
				})
				.catch(() => {
					setBroadcasterUserId(undefined);
					setTokenScopes([]);
					setCanModerateChannel(false);
				});
		};

		loadBroadcasterUserId();
		window.addEventListener(
			"kick-channel-settings-changed",
			loadBroadcasterUserId
		);

		return () => {
			window.removeEventListener(
				"kick-channel-settings-changed",
				loadBroadcasterUserId
			);
		};
	}, []);

	useEffect(() => {
		if (canModerateChannel || !username) return;

		const ownMessage = messages.messageList.find(
			(message) =>
				(!channelName || message.channelSlug === channelName) &&
				message.sender?.username?.toLowerCase() === username.toLowerCase()
		);
		const hasModeratorBadge = ownMessage?.sender.identity?.badges.some(
			(badge) => badge.type.toLowerCase() === "moderator"
		);

		if (hasModeratorBadge) {
			setCanModerateChannel(true);
		}
	}, [canModerateChannel, messages.messageList, username, channelName]);

	useEffect(() => {
		const modCheckMessage = getModCheckMessage();
		if (!modCheckMessage || !channelName || !username) return;

		const ownModCheckMessage = messages.messageList.find(
			(message) =>
				message.channelSlug === channelName &&
				message.sender?.username?.toLowerCase() === username.toLowerCase() &&
				message.content.trim() === modCheckMessage
		);

		if (ownModCheckMessage) {
			markModCheckSentForChannel(channelName);
			pendingModCheckChannelsRef.current.delete(channelName);
		}
	}, [channelName, messages.messageList, username]);

	useEffect(() => {
		const modCheckMessage = getModCheckMessage();
		if (
			!modCheckMessage ||
			!channelName ||
			!broadcasterUserId ||
			canModerateChannel ||
			!hasKickScope(tokenScopes, "chat:write") ||
			hasSentModCheckForChannel(channelName) ||
			pendingModCheckChannelsRef.current.has(channelName)
		) {
			return;
		}

		pendingModCheckChannelsRef.current.add(channelName);
		window.electron.kick
			.sendChatMessage({
				broadcaster_user_id: broadcasterUserId,
				content: modCheckMessage,
				type: "user",
			})
			.catch(() => {
				pendingModCheckChannelsRef.current.delete(channelName);
			});
	}, [broadcasterUserId, canModerateChannel, channelName, tokenScopes]);

	const mentionSearch = useMemo(() => {
		const match = messageText.match(/(^|\s)@([a-zA-Z0-9_]*)$/);
		return match ? match[2].toLowerCase() : undefined;
	}, [messageText]);

	const emoteSearchMatch = useMemo(() => {
		const colonMatch = messageText.match(/(^|\s):([A-Za-z0-9_]{1,})$/);
		if (!colonMatch) return undefined;
		return {
			query: colonMatch[2],
			leadIndex: colonMatch.index! + colonMatch[1].length,
			length: colonMatch[2].length + 1,
		};
	}, [messageText]);

	const emoteSuggestions = useMemo(() => {
		if (!emoteSearchMatch || emoteIndex.all.length === 0) return [] as EmoteEntry[];
		return searchEmotes(emoteIndex, emoteSearchMatch.query, 8);
	}, [emoteSearchMatch, emoteIndex]);

	const mentionSuggestions = useMemo(() => {
		if (mentionSearch === undefined) {
			return [];
		}

		const uniqueUsers = Array.from(
			new Set(
				messageList
					.map((item) => item.sender?.username)
					.filter((item): item is string => !!item)
			)
		);

		return uniqueUsers
			.filter((item) => item.toLowerCase().includes(mentionSearch))
			.slice(0, 8);
	}, [mentionSearch, messageList]);

	const chatCommands = useMemo(() => chatCommandDefinitions, []);

	const commandSearch = useMemo(() => {
		const match = messageText.match(/^\/([a-zA-Z]*)$/);
		return match ? match[1].toLowerCase() : undefined;
	}, [messageText]);

	const commandSuggestions = useMemo(() => {
		if (commandSearch === undefined) {
			return [];
		}

		return chatCommands.filter((command) =>
			command.name.slice(1).startsWith(commandSearch)
		);
	}, [chatCommands, commandSearch]);

	useEffect(() => {
		setMentionIndex(0);
	}, [mentionSearch]);

	useEffect(() => {
		setCommandIndex(0);
	}, [commandSearch]);

	useEffect(() => {
		setEmoteSuggestionIndex(0);
	}, [emoteSearchMatch?.query]);

	const applyMention = (selectedUsername: string) => {
		const nextText = messageText.replace(
			/(^|\s)@([a-zA-Z0-9_]*)$/,
			`$1@${selectedUsername} `
		);
		setComposerText(nextText);
		setMentionIndex(0);
	};

	const applyEmoteSuggestion = (entry: EmoteEntry) => {
		if (!emoteSearchMatch) return;
		const composer = composerRef.current;
		if (!composer) return;
		composer.focus();

		const selection = window.getSelection();
		// Caret'in onunde duran ":xxx" text node'unu bul ve IMG ile degistir
		if (
			selection &&
			selection.rangeCount > 0 &&
			composer.contains(selection.anchorNode)
		) {
			const range = selection.getRangeAt(0);
			const caretNode = range.endContainer;
			const caretOffset = range.endOffset;
			if (caretNode.nodeType === Node.TEXT_NODE) {
				const text = caretNode.textContent || "";
				const colonIdx = text.lastIndexOf(":", caretOffset - 1);
				if (colonIdx !== -1) {
					const matched = text.slice(colonIdx + 1, caretOffset);
					if (matched === emoteSearchMatch.query) {
						const replaceRange = document.createRange();
						replaceRange.setStart(caretNode, colonIdx);
						replaceRange.setEnd(caretNode, caretOffset);
						replaceRange.deleteContents();
						const img = createEmoteImg(entry, entry.insertText);
						const space = document.createTextNode(" ");
						replaceRange.insertNode(space);
						replaceRange.insertNode(img);
						replaceRange.setStartAfter(space);
						replaceRange.collapse(true);
						selection.removeAllRanges();
						selection.addRange(replaceRange);
						setMessageText(extractComposerText(composer));
						setEmoteSuggestionIndex(0);
						return;
					}
				}
			}
		}

		// Fallback: text-based replacement + re-render
		const start = emoteSearchMatch.leadIndex;
		const end = start + emoteSearchMatch.length;
		const before = messageText.slice(0, start);
		const after = messageText.slice(end);
		const insert = entry.insertText;
		const needsSpace = after.length === 0 || !/^\s/.test(after);
		const nextText = `${before}${insert}${needsSpace ? " " : ""}${after}`;
		setComposerText(nextText);
		setEmoteSuggestionIndex(0);
	};

	const insertEmoteAtCaret = (
		entry: EmoteEntry,
		options: { keepOpen: boolean }
	) => {
		const composer = composerRef.current;
		if (!composer) return;
		composer.focus();

		const selection = window.getSelection();
		let range: Range;
		if (
			selection &&
			selection.rangeCount > 0 &&
			composer.contains(selection.anchorNode)
		) {
			range = selection.getRangeAt(0);
			range.deleteContents();
		} else {
			range = document.createRange();
			range.selectNodeContents(composer);
			range.collapse(false);
		}

		// Onceki karakter bosluk degilse, IMG'den once bir bosluk koy
		const needsLeadingSpace = (() => {
			const text = extractComposerText(composer);
			if (text.length === 0) return false;
			return !/\s$/.test(text);
		})();

		if (needsLeadingSpace) {
			range.insertNode(document.createTextNode(" "));
			range.collapse(false);
		}

		const img = createEmoteImg(entry, entry.insertText);
		const trailingSpace = document.createTextNode(" ");
		range.insertNode(trailingSpace);
		range.insertNode(img);
		range.setStartAfter(trailingSpace);
		range.collapse(true);
		selection?.removeAllRanges();
		selection?.addRange(range);

		setMessageText(extractComposerText(composer));

		if (!options.keepOpen) {
			setEmotePickerOpen(false);
		}
	};

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

	const mentionUser = (selectedUsername: string) => {
		const nextText = messageText.endsWith(" ") || messageText.length === 0
			? `${messageText}@${selectedUsername} `
			: `${messageText} @${selectedUsername} `;
		setComposerText(nextText);
		focusComposer();
	};

	const applyCommand = (commandName: string) => {
		const selectedCommand = chatCommands.find(
			(command) => command.name === commandName
		);
		const nextText = selectedCommand?.template || `${commandName} `;
		setComposerText(nextText);
		setCommandIndex(0);
	};

	const runModerationAction = (
		action: "delete" | "timeout" | "ban" | "unban",
		message: UserMessage,
		timeoutSeconds = getDefaultTimeoutSeconds(),
		reason = "Moderated from Kick Chat Viewer"
	) => {
		if (!canModerateChannel || !broadcasterUserId) {
			toast("Moderation is only available when you are a moderator in this channel.", { type: "warning" });
			return;
		}
		const requiredScope =
			action === "delete"
				? "moderation:chat_message:manage"
				: "moderation:ban";
		if (!hasKickScope(tokenScopes, requiredScope)) {
			toast(
				`Kick did not grant ${requiredScope} to this token. Open Kick Connection and approve moderation scopes.`,
				{ type: "warning" }
			);
			return;
		}

		const userId = message.sender.id;
		const request = {
			broadcaster_user_id: broadcasterUserId,
			user_id: userId,
			reason,
		};
		const actor = {
			id: 0,
			username: username || localStorage.getItem("username") || "Moderator",
			slug: username || localStorage.getItem("username") || "moderator",
			identity: {
				color: "#2fd3a0",
				badges: [],
			},
		};
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
					action === "timeout" || action === "ban" ? actor : undefined,
				unbanned_by: action === "unban" ? actor : undefined,
				expires_at:
					action === "timeout"
						? new Date(Date.now() + timeoutSeconds * 1000).toISOString()
						: undefined,
				created_at: Date.now(),
				message:
					action === "delete"
						? {
								id: message.id,
								messageList: [message],
						  }
						: undefined,
			})
		);
		setUserContextMenu(undefined);

		const task =
			action === "delete"
				? window.electron.kick.deleteChatMessage(message.id)
				: action === "timeout"
				? window.electron.kick.timeoutUser({
						...request,
						duration: timeoutSeconds,
				  })
				: action === "ban"
				? window.electron.kick.banUser(request)
				: window.electron.kick.unbanUser({
						broadcaster_user_id: broadcasterUserId,
						user_id: userId,
				  });

		task
			.then(() => {
				dispatch(MessageActionsFunc.setModActionStatus(localActionId, "success"));
				const actionText =
					action === "timeout"
						? `${action} ${formatTimeoutDuration(timeoutSeconds)}`
						: action;
				toast(`${actionText} request sent for ${message.sender.username}`, {
					type: "success",
				});
			})
			.catch((err) => {
				const message =
					err.message?.includes("401")
						? "Kick rejected this request as Unauthorized. Reconnect Kick OAuth with moderation scopes."
						: err.message || `${action} request failed.`;
				toast(message, {
					type: "error",
				});
				dispatch(
					MessageActionsFunc.setModActionStatus(
						localActionId,
						"failed",
						message
					)
				);
			});
	};

	const runChatCommand = async (content: string) => {
		const parsedCommand = parseChatCommand(content);
		if (!parsedCommand) {
			return false;
		}

		if (parsedCommand.error) {
			toast(parsedCommand.error, {
				type: parsedCommand.error.startsWith("Unknown") ? "warning" : "info",
			});
			return true;
		}

		let targetMessage: UserMessage;
		try {
			targetMessage = await resolveUserMessage(
				parsedCommand.targetUsername || "",
				messageList
			);
		} catch (err: any) {
			toast(err.message || `${parsedCommand.targetUsername} could not be resolved.`, {
				type: "warning",
			});
			return true;
		}

		if (parsedCommand.command === "user") {
			openUserWindow(targetMessage);
			return true;
		}

		if (!canModerateChannel) {
			toast("Moderation commands are hidden unless you are a moderator in this channel.", {
				type: "warning",
			});
			return true;
		}

		if (parsedCommand.command === "ban") {
			runModerationAction("ban", targetMessage, undefined, parsedCommand.reason);
			return true;
		}

		if (parsedCommand.command === "unban") {
			runModerationAction("unban", targetMessage);
			return true;
		}

		if (parsedCommand.command === "to" || parsedCommand.command === "timeout") {
			runModerationAction(
				"timeout",
				targetMessage,
				parsedCommand.timeoutSeconds,
				parsedCommand.reason
			);
			return true;
		}

		return true;
	};

	const sendMessage = async () => {
		const content = messageText.trim();
		const channelName = localStorage.getItem("channelName")?.trim();
		if (!content) {
			return;
		}
		if (content.startsWith("/")) {
			setCommandHistory((prev) =>
				[content, ...prev.filter((item) => item !== content)].slice(0, 30)
			);
			setCommandHistoryIndex(undefined);
			const handled = await runChatCommand(content);
			if (handled) {
				if (composerRef.current) {
					composerRef.current.textContent = "";
				}
				setMessageText("");
				focusComposer();
				return;
			}
		}
		if (!channelName) {
			toast("Channel name is required.", { type: "warning" });
			return;
		}

		const optimisticMessage: UserMessage = {
			id: `local-${Date.now()}`,
			channelSlug: channelName,
			chatroom_id: 0,
			content,
			type: "message",
			created_at: new Date().toISOString(),
			sender: {
				id: 0,
				username: username || localStorage.getItem("username") || "You",
				slug: username || localStorage.getItem("username") || "you",
				identity: {
					color: "#00d084",
					badges: [],
				},
			},
		};
		const replyToMessageId = replyTarget?.id;
		dispatch(MessageActionsFunc.newMessage(optimisticMessage));
		if (composerRef.current) {
			composerRef.current.textContent = "";
			composerRef.current.focus();
		}
		setMessageText("");
		setReplyTarget(undefined);
		setSendingMessage(true);
		const send = (targetBroadcasterUserId: number) =>
			window.electron.kick.sendChatMessage({
				broadcaster_user_id: targetBroadcasterUserId,
				content,
				type: "user",
				...(replyToMessageId
					? { reply_to_message_id: replyToMessageId }
					: {}),
			});

		const sendRequest = broadcasterUserId
			? send(broadcasterUserId)
			: window.electron.kick.getChannelBySlug(channelName).then((response) => {
					const channel = response?.data?.[0];
					if (!channel?.broadcaster_user_id) {
						throw new Error("Kick channel could not be found.");
					}
					setBroadcasterUserId(channel.broadcaster_user_id);
					return send(channel.broadcaster_user_id);
			  });

		sendRequest
			.then(() => {
				// Pusher will echo the official message when Kick accepts it.
			})
			.catch((err) => {
				toast(err.message || "Kick message could not be sent.", {
					type: "error",
				});
			})
			.finally(() => {
				setSendingMessage(false);
				focusComposer();
			});
	};

	const handleComposerInput = (event: FormEvent<HTMLDivElement>) => {
		const composer = event.currentTarget;
		// Yazilan [emote:ID:NAME] desenlerini IMG'e cevir; cevirildiyse caret'i sona koy
		const replaced = replaceKickBracketsInDom(composer, emoteIndex);
		if (replaced) {
			putCaretAtEnd(composer);
		}
		const text = extractComposerText(composer).replace(/\n/g, "");
		setMessageText(text);
	};

	const handleMessageKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (emoteSuggestions.length > 0) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setEmoteSuggestionIndex(
					(prev) => (prev + 1) % emoteSuggestions.length
				);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setEmoteSuggestionIndex(
					(prev) =>
						(prev - 1 + emoteSuggestions.length) % emoteSuggestions.length
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
				if (emoteSearchMatch) {
					const start = emoteSearchMatch.leadIndex;
					const end = start + emoteSearchMatch.length;
					const next = `${messageText.slice(0, start)}${messageText.slice(end)}`;
					setComposerText(next);
				}
				setEmoteSuggestionIndex(0);
				return;
			}
		}

		if (commandSuggestions.length > 0) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setCommandIndex((prev) => (prev + 1) % commandSuggestions.length);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setCommandIndex(
					(prev) =>
						(prev - 1 + commandSuggestions.length) %
						commandSuggestions.length
				);
				return;
			}
			if (event.key === "Tab" || event.key === "Enter") {
				event.preventDefault();
				applyCommand(commandSuggestions[commandIndex].name);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setMessageText("");
				if (composerRef.current) {
					composerRef.current.textContent = "";
				}
				return;
			}
		}

		if (mentionSuggestions.length > 0) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setMentionIndex((prev) => (prev + 1) % mentionSuggestions.length);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setMentionIndex(
					(prev) =>
						(prev - 1 + mentionSuggestions.length) %
						mentionSuggestions.length
				);
				return;
			}
			if (event.key === "Tab") {
				event.preventDefault();
				applyMention(mentionSuggestions[mentionIndex]);
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				applyMention(mentionSuggestions[mentionIndex]);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				const nextText = messageText.replace(/@([a-zA-Z0-9_]*)$/, "");
				setComposerText(nextText);
				return;
			}
		}

		if (
			messageText.trim().startsWith("/") &&
			commandHistory.length > 0 &&
			(event.key === "ArrowUp" || event.key === "ArrowDown")
		) {
			event.preventDefault();
			const nextIndex =
				event.key === "ArrowUp"
					? commandHistoryIndex === undefined
						? 0
						: Math.min(commandHistoryIndex + 1, commandHistory.length - 1)
					: commandHistoryIndex === undefined
					? undefined
					: commandHistoryIndex <= 0
					? undefined
					: commandHistoryIndex - 1;

			setCommandHistoryIndex(nextIndex);
			setComposerText(nextIndex === undefined ? "" : commandHistory[nextIndex]);
			return;
		}

		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	};

	useEffect(() => {
		for (const hostInfo of messages.hostInfo) {
			if (hostInfo.channelSlug && channelName && hostInfo.channelSlug !== channelName) {
				continue;
			}
			toast(
				<div className="flex flex-col justify-center items-center">
					<div className=" font-bold">{`${hostInfo.host_username} ${hostInfo.number_viewers} kişi ile geldi.`}</div>
					<div className="test">{hostInfo.optional_message}</div>
				</div>,
				{ autoClose: 9000 }
			);

			dispatch(MessageActionsFunc.removeHostInfo(hostInfo));
		}
	}, [messages.hostInfo, channelName]);

	return (
		<>
			<ScrollableView className="chat-scroll-area p-2">
				{messageList.map((item) => {
					const senderUsername = item.sender?.username || "";
					const senderColor = item.sender?.identity?.color || "white";
					const originalSenderUsername =
						item.metadata?.original_sender?.username || "";
					const originalMessageContent =
						item.metadata?.original_message?.content || "";
					const isReply =
						item.type === "reply" &&
						originalSenderUsername !== "" &&
						originalMessageContent !== "";
					const isMentioned =
						!!username &&
						(originalSenderUsername.toLowerCase() ===
							username.toLowerCase() ||
							item.content.toLowerCase().includes(username.toLowerCase()));
					const badgesHtml = buildBadgesHtml(
						item.sender.identity?.badges,
						channelBadges
					);
					const contentHtml = renderMessageContent(item.id, item.content);
					const safeSenderColor = safeColor(senderColor);
					const safeSenderUsername = escapeHtml(senderUsername);
					const message =
						`<p style="display: inline-block; vertical-align: middle;">` +
						`<span class="chat-message-timestamp">${Moment(
							new Date(item.created_at),
							"YYYY-MM-DDTHH:mm:ss"
						).format("HH:mm:ss")}</span>` +
						badgesHtml +
						`<span class="${
							item.removed ? "removedMessage" : ""
						}"><span class="chat-user-username" style="color: ${safeSenderColor};">${safeSenderUsername}</span> : ` +
						contentHtml +
						"</span></p>";
					const sus = susUsers.filter(
						(i) => i.toLowerCase() === senderUsername.toLowerCase()
					);
					return (
						<div
							key={"message-list-" + item.id}
							className={`chat-message-container chat-message-hoverable ${
								isMentioned
									? " border border-solid border-danger rounded-small p-1"
									: ""
							} ${sus.length > 0 ? " sus-user" : ""}${
								item.type === "celebration" ? " subs-publication " : ""
							}`}
						>
							<button
								type="button"
								className="chat-message-reply-btn"
								title={`@${senderUsername} mesajina reply`}
								aria-label="Reply"
								onMouseDown={(event) => event.preventDefault()}
								onClick={(event) => {
									event.stopPropagation();
									setReplyTarget(item);
									focusComposer();
								}}
							>
								<GoReply />
							</button>
							<div
								className="chat-message-background"
								tabIndex={0}
								onContextMenu={(event) => {
									event.preventDefault();
									setUserContextMenu({
										x: event.clientX,
										y: event.clientY,
										message: item,
									});
								}}
								onClick={(event) => {
									const target = event.target as HTMLElement;
									if (!target.classList.contains("chat-user-username")) {
										return;
									}
									openUserWindow(item);
								}}
							>
								{isReply && (
									<div className="chat-message-reply-preview flex flex-row justify-start items-center ml-2 text-small">
										<GoReply style={{ marginRight: 5 }} />
										{`${originalSenderUsername} : ${originalMessageContent.substring(
											0,
											Math.min(50, originalMessageContent.length)
										)}`}
									</div>
								)}
								{item.type === "celebration" && (
									<div className="chat-message-celebration-label flex flex-row justify-start items-center ml-2 text-small">
										<TfiAnnouncement style={{ marginRight: 5 }} />
										Abonelik:
									</div>
								)}
								<span
									dangerouslySetInnerHTML={{
										__html: message,
									}}
								></span>
							</div>
						</div>
					);
				})}
			</ScrollableView>
			{userContextMenu && (
				<div
					ref={userContextMenuRef}
					className="chat-user-context-menu"
					style={{
						left: userContextMenu.x,
						top: userContextMenu.y,
					}}
					onMouseDown={(event) => event.stopPropagation()}
				>
					<div className="chat-user-context-title">
						{userContextMenu.message.sender.username}
					</div>
					<button
						type="button"
						onClick={() => {
							openUserWindow(userContextMenu.message);
							setUserContextMenu(undefined);
						}}
					>
						Open user detail
					</button>
					<button
						type="button"
						onClick={() => {
							navigator.clipboard?.writeText(
								userContextMenu.message.sender.username
							);
							setUserContextMenu(undefined);
						}}
					>
						Copy username
					</button>
					<button
						type="button"
						onClick={() => {
							mentionUser(userContextMenu.message.sender.username);
							setUserContextMenu(undefined);
						}}
					>
						Mention
					</button>
					<button
						type="button"
						onClick={() => {
							setReplyTarget(userContextMenu.message);
							setUserContextMenu(undefined);
							focusComposer();
						}}
					>
						Reply
					</button>
					{canModerateChannel && (
						<>
							<div className="chat-user-context-divider" />
							<button
								type="button"
								onClick={() =>
									runModerationAction("delete", userContextMenu.message)
								}
							>
								Delete message
							</button>
							<button
								type="button"
								onClick={() =>
									runModerationAction(
										"timeout",
										userContextMenu.message,
										getDefaultTimeoutSeconds()
									)
								}
							>
								Timeout {formatTimeoutDuration(getDefaultTimeoutSeconds())}
							</button>
							<button
								type="button"
								onClick={() =>
									runModerationAction("ban", userContextMenu.message)
								}
							>
								Ban user
							</button>
							<button
								type="button"
								onClick={() =>
									runModerationAction("unban", userContextMenu.message)
								}
							>
								Unban user
							</button>
						</>
					)}
				</div>
			)}
			<div className="chat-composer-bar">
				{replyTarget && (
					<div className="chat-reply-indicator">
						<GoReply />
						<span className="chat-reply-indicator-label">
							@{replyTarget.sender.username}
						</span>
						<span className="chat-reply-indicator-preview">
							{replyTarget.content.substring(0, 60)}
							{replyTarget.content.length > 60 ? "…" : ""}
						</span>
						<button
							type="button"
							className="chat-reply-indicator-cancel"
							aria-label="Reply iptal"
							onClick={() => setReplyTarget(undefined)}
						>
							×
						</button>
					</div>
				)}
				{emoteSuggestions.length > 0 && (
					<EmoteAutocomplete
						suggestions={emoteSuggestions}
						activeIndex={emoteSuggestionIndex}
						onPick={applyEmoteSuggestion}
						onHover={(index) => setEmoteSuggestionIndex(index)}
					/>
				)}
				{emoteSuggestions.length === 0 && mentionSuggestions.length > 0 && (
					<div className="chat-suggestion-menu">
						{mentionSuggestions.map((item, index) => (
							<button
								key={item}
								type="button"
								className={`chat-suggestion-item ${
									index === mentionIndex ? "active" : ""
								}`}
								onMouseDown={(event) => {
									event.preventDefault();
									applyMention(item);
								}}
							>
								@{item}
							</button>
						))}
					</div>
				)}
				{emoteSuggestions.length === 0 && commandSuggestions.length > 0 && (
					<div className="chat-suggestion-menu">
						{commandSuggestions.map((item, index) => (
							<button
								key={item.name}
								type="button"
								className={`chat-suggestion-item column ${
									index === commandIndex ? "active" : ""
								}`}
								onMouseDown={(event) => {
									event.preventDefault();
									applyCommand(item.name);
								}}
							>
								<span>{item.usage}</span>
								<span className="chat-suggestion-description">
									{item.description}
								</span>
							</button>
						))}
					</div>
				)}
				<EmotePicker
					open={emotePickerOpen}
					onClose={() => setEmotePickerOpen(false)}
					index={emoteIndex}
					onPick={insertEmoteAtCaret}
					anchorRef={emotePickerButtonRef}
					onRefresh={() => {
						if (channelName) {
							dispatch(refreshChannelEmoteBundle(channelName));
						}
					}}
				/>
				<div className="chat-composer-shell">
					<div
						ref={composerRef}
						className="chat-composer-input"
						contentEditable={true}
						role="textbox"
						aria-label="Send a Kick message"
						data-placeholder="Send a Kick message"
						suppressContentEditableWarning
						onInput={handleComposerInput}
						onKeyDown={handleMessageKeyDown}
					/>
					<button
						ref={emotePickerButtonRef}
						type="button"
						className="chat-composer-emote-btn"
						aria-label="Emote picker"
						title="Emote sec"
						onMouseDown={(event) => {
							// contentEditable focus'unu kaybetmemek icin default'u engelle
							event.preventDefault();
						}}
						onClick={() => {
							setEmotePickerOpen((value) => !value);
						}}
					>
						<span aria-hidden>😀</span>
					</button>
				</div>
				<Button
					className="chat-composer-send rounded-none"
					color="primary"
					isLoading={sendingMessage}
					isDisabled={messageText.trim() === ""}
					onPress={sendMessage}
				>
					Send
				</Button>
			</div>
		</>
	);
};
export default Chat;
