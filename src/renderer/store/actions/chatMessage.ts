import { SubscriberBadge } from "../../constants/kick";
import { Emote } from "../../constants/seventv";
import {
	GiftSubMessage,
	HostInfo,
	ModMessage,
	SubMessage,
	UserMessage,
} from "../../util/chatInterface";
import { FanthalDispatch } from "../store";
import { ChatMessageTypes } from "../types/chatMessages";

interface NewMessageAction {
	type: ChatMessageTypes.NEW_MESSAGE_ACTION;
	message: UserMessage;
}
interface ModMessageActions {
	type: ChatMessageTypes.MOD_MESSAGE_ACTION;
	message: ModMessage;
}
interface SubMessageAction {
	type: ChatMessageTypes.SUB_MESSAGE_ACTION;
	message: SubMessage;
}
interface GiftSubMessageAction {
	type: ChatMessageTypes.GIF_SUB_MESSAGE_ACTION;
	message: GiftSubMessage;
}
interface SetKickEmotesAction {
	type: ChatMessageTypes.SET_KICK_EMOTES_ACTION;
	emotes: any[];
}
interface SetSevenTvEmotesAction {
	type: ChatMessageTypes.SET_SEVEN_TV_EMOTES_ACTION;
	emotes: Emote[];
}
interface SetChannelBadgesAction {
	type: ChatMessageTypes.SET_CHANNEL_BADGES_ACTION;
	channelBadges: SubscriberBadge[];
}
interface SetHostAction {
	type: ChatMessageTypes.SET_HOST_ACTION;
	hostInfo: HostInfo;
}
interface RemoveHostAction {
	type: ChatMessageTypes.REMOVE_HOST_ACTION;
	hostInfo: HostInfo;
}
interface AnyAction {
	type: "ANY_ACTION";
}

export type MessageActions =
	| AnyAction
	| NewMessageAction
	| ModMessageActions
	| SubMessageAction
	| GiftSubMessageAction
	| SetKickEmotesAction
	| SetSevenTvEmotesAction
	| SetChannelBadgesAction
	| SetHostAction
	| RemoveHostAction;

const setHostAction = (hostInfo: HostInfo): MessageActions => {
	return {
		type: ChatMessageTypes.SET_HOST_ACTION,
		hostInfo: hostInfo,
	};
};

export const setHostInfo = (hostInfo: HostInfo) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(setHostAction(hostInfo));
	};
};
const removeHostAction = (hostInfo: HostInfo): MessageActions => {
	return {
		type: ChatMessageTypes.REMOVE_HOST_ACTION,
		hostInfo: hostInfo,
	};
};

export const removeHostInfo = (hostInfo: HostInfo) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(removeHostAction(hostInfo));
	};
};
const setChannelBadgesAction = (
	channelBadges: SubscriberBadge[]
): MessageActions => {
	return {
		type: ChatMessageTypes.SET_CHANNEL_BADGES_ACTION,
		channelBadges: channelBadges,
	};
};

export const setChannelBadges = (channelBadges: SubscriberBadge[]) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(setChannelBadgesAction(channelBadges));
	};
};
const newMessageInfoAction = (newMessageInfo: UserMessage): MessageActions => {
	return {
		type: ChatMessageTypes.NEW_MESSAGE_ACTION,
		message: newMessageInfo,
	};
};

export const newMessage = (newMessage: UserMessage) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(newMessageInfoAction(newMessage));
	};
};

const modMessageInfoAction = (modMessageInfo: ModMessage): MessageActions => {
	return {
		type: ChatMessageTypes.MOD_MESSAGE_ACTION,
		message: modMessageInfo,
	};
};

export const modMessage = (modMessage: ModMessage) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(modMessageInfoAction(modMessage));
	};
};

const subMessageInfoAction = (subMessageInfo: SubMessage): MessageActions => {
	return {
		type: ChatMessageTypes.SUB_MESSAGE_ACTION,
		message: subMessageInfo,
	};
};
export const subMessage = (subMessage: SubMessage) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(subMessageInfoAction(subMessage));
	};
};

const gifSubMessageInfoAction = (
	gifSubMessageInfo: GiftSubMessage
): MessageActions => {
	return {
		type: ChatMessageTypes.GIF_SUB_MESSAGE_ACTION,
		message: gifSubMessageInfo,
	};
};
export const gifSubMessage = (gifSubMessageInfo: GiftSubMessage) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(gifSubMessageInfoAction(gifSubMessageInfo));
	};
};

const setKickEmotesInfoAction = (emotes: any[]): MessageActions => {
	return {
		type: ChatMessageTypes.SET_KICK_EMOTES_ACTION,
		emotes: emotes,
	};
};
export const setKickEmotes = (emotes: any[]) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(setKickEmotesInfoAction(emotes));
	};
};

const setSevenTvEmotesInfoAction = (emotes: Emote[]): MessageActions => {
	return {
		type: ChatMessageTypes.SET_SEVEN_TV_EMOTES_ACTION,
		emotes: emotes,
	};
};
export const setSevenTvEmotes = (emotes: Emote[]) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(setSevenTvEmotesInfoAction(emotes));
	};
};

const MessageActionsFunc = {
	newMessage,
	modMessage,
	subMessage,
	gifSubMessage,
	setKickEmotes,
	setSevenTvEmotes,
	setChannelBadges,
	setHostInfo,
	removeHostInfo,
};

export default MessageActionsFunc;
