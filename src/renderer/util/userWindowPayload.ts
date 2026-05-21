import { EmoteSet } from "../constants/emote";
import { UserWindowPayload } from "../../shared/userWindow";
import { ModMessage, User, UserMessage } from "./chatInterface";

const normalizeKey = (username: string) => username.trim().toLowerCase();
const LOCAL_MOD_ID_PREFIX = "local-";
const LOCAL_ECHO_WINDOW_MS = 20000;

const isLocalModAction = (action: ModMessage) =>
	action.id.startsWith(LOCAL_MOD_ID_PREFIX);

const isLikelyModEcho = (localAction: ModMessage, incoming: ModMessage) => {
	if (!isLocalModAction(localAction) || isLocalModAction(incoming)) {
		return false;
	}
	if (localAction.type !== incoming.type) {
		return false;
	}
	if (
		normalizeKey(localAction.user?.username || "") !==
		normalizeKey(incoming.user?.username || "")
	) {
		return false;
	}
	if (
		incoming.type === "delete" &&
		localAction.message?.id !== incoming.message?.id
	) {
		return false;
	}

	return (
		Math.abs(Number(localAction.created_at) - Number(incoming.created_at)) <=
		LOCAL_ECHO_WINDOW_MS
	);
};

const dedupeModActions = (actions: ModMessage[]) =>
	actions.reduce<ModMessage[]>((list, action) => {
		const localEcho = list.find((item) => isLikelyModEcho(item, action));
		if (localEcho) {
			return list.map((item) => (item.id === localEcho.id ? action : item));
		}
		if (list.some((item) => item.id === action.id)) {
			return list;
		}
		return list.concat(action);
	}, []);

export const buildUserWindowPayload = (input: {
	user: User;
	messages: UserMessage[];
	modActions: ModMessage[];
	openedFrom: "chat" | "moderation";
	channelName?: string;
	canModerateChannel?: boolean;
	channelEmoteSets?: EmoteSet[];
	globalEmoteSets?: EmoteSet[];
	blockedEmotes?: string[];
}): UserWindowPayload => {
	const username = input.user.username;
	const usernameKey = normalizeKey(username);
	const key = input.channelName
		? `${normalizeKey(input.channelName)}:${usernameKey}`
		: usernameKey;
	const userMessages = input.messages.filter(
		(message) =>
			normalizeKey(message.sender?.username || "") === usernameKey &&
			(!input.channelName || message.channelSlug === input.channelName)
	);
	const userModActions = dedupeModActions(
		input.modActions.filter(
			(action) =>
				normalizeKey(action.user?.username || "") === usernameKey &&
				(!input.channelName || action.channelSlug === input.channelName)
		)
	);

	return {
		key,
		channelName: input.channelName,
		canModerateChannel: input.canModerateChannel,
		openedFrom: input.openedFrom,
		user: input.user,
		messages: userMessages,
		modActions: userModActions,
		updatedAt: Date.now(),
		channelEmoteSets: input.channelEmoteSets ?? [],
		globalEmoteSets: input.globalEmoteSets ?? [],
		blockedEmotes: input.blockedEmotes ?? [],
	};
};
