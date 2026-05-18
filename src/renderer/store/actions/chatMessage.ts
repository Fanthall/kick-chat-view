import { EmoteSet } from "../../constants/emote";
import { SubscriberBadge } from "../../constants/kick";
import { Emote } from "../../constants/seventv";
import {
	ActivityItem,
	ActivityStatus,
	GiftSubMessage,
	HostInfo,
	ModMessage,
	SubMessage,
	UserMessage,
} from "../../util/chatInterface";
import { StreamMeta } from "../../util/streamMeta";
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
interface AddActivityAction {
	type: ChatMessageTypes.ADD_ACTIVITY_ACTION;
	activity: ActivityItem;
}
interface SetActivityStatusAction {
	type: ChatMessageTypes.SET_ACTIVITY_STATUS_ACTION;
	id: string;
	status: ActivityStatus;
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
	channelSlug?: string;
}
interface SetHostAction {
	type: ChatMessageTypes.SET_HOST_ACTION;
	hostInfo: HostInfo;
}
interface RemoveHostAction {
	type: ChatMessageTypes.REMOVE_HOST_ACTION;
	hostInfo: HostInfo;
}
interface ClearChannelStateAction {
	type: ChatMessageTypes.CLEAR_CHANNEL_STATE_ACTION;
}
interface SetConnectionStatusAction {
	type: ChatMessageTypes.SET_CONNECTION_STATUS_ACTION;
	status: "idle" | "connecting" | "connected" | "disconnected";
	channelSlug?: string;
}
interface SetModActionStatusAction {
	type: ChatMessageTypes.SET_MOD_ACTION_STATUS_ACTION;
	id: string;
	status: "pending" | "success" | "failed";
	error?: string;
}
interface SetGlobalEmoteSetsAction {
	type: ChatMessageTypes.SET_GLOBAL_EMOTE_SETS_ACTION;
	sets: EmoteSet[];
}
interface SetChannelEmoteBundleAction {
	type: ChatMessageTypes.SET_CHANNEL_EMOTE_BUNDLE_ACTION;
	channelSlug: string;
	sets: EmoteSet[];
}
interface ClearChannelEmoteBundleAction {
	type: ChatMessageTypes.CLEAR_CHANNEL_EMOTE_BUNDLE_ACTION;
	channelSlug: string;
}
interface SetStreamMetaAction {
	type: ChatMessageTypes.SET_STREAM_META_ACTION;
	meta: StreamMeta;
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
	| AddActivityAction
	| SetActivityStatusAction
	| SetKickEmotesAction
	| SetSevenTvEmotesAction
	| SetGlobalEmoteSetsAction
	| SetChannelEmoteBundleAction
	| ClearChannelEmoteBundleAction
	| SetStreamMetaAction
	| SetChannelBadgesAction
	| SetHostAction
	| RemoveHostAction
	| ClearChannelStateAction
	| SetConnectionStatusAction
	| SetModActionStatusAction;

export const clearChannelState = (): MessageActions => {
	return {
		type: ChatMessageTypes.CLEAR_CHANNEL_STATE_ACTION,
	};
};

export const setConnectionStatus = (
	status: "idle" | "connecting" | "connected" | "disconnected",
	channelSlug?: string
): MessageActions => {
	return {
		type: ChatMessageTypes.SET_CONNECTION_STATUS_ACTION,
		status,
		channelSlug,
	};
};

export const setModActionStatus = (
	id: string,
	status: "pending" | "success" | "failed",
	error?: string
): MessageActions => {
	return {
		type: ChatMessageTypes.SET_MOD_ACTION_STATUS_ACTION,
		id,
		status,
		error,
	};
};

const addActivityAction = (activity: ActivityItem): MessageActions => {
	return {
		type: ChatMessageTypes.ADD_ACTIVITY_ACTION,
		activity,
	};
};

export const addActivity = (activity: ActivityItem) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(addActivityAction(activity));
	};
};

const setActivityStatusAction = (
	id: string,
	status: ActivityStatus
): MessageActions => {
	return {
		type: ChatMessageTypes.SET_ACTIVITY_STATUS_ACTION,
		id,
		status,
	};
};

export const setActivityStatus = (id: string, status: ActivityStatus) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(setActivityStatusAction(id, status));
	};
};

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
	channelBadges: SubscriberBadge[],
	channelSlug?: string
): MessageActions => {
	return {
		type: ChatMessageTypes.SET_CHANNEL_BADGES_ACTION,
		channelBadges: channelBadges,
		channelSlug,
	};
};

export const setChannelBadges = (
	channelBadges: SubscriberBadge[],
	channelSlug?: string
) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(setChannelBadgesAction(channelBadges, channelSlug));
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

const setGlobalEmoteSetsAction = (sets: EmoteSet[]): MessageActions => {
	return {
		type: ChatMessageTypes.SET_GLOBAL_EMOTE_SETS_ACTION,
		sets,
	};
};
export const setGlobalEmoteSets = (sets: EmoteSet[]) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(setGlobalEmoteSetsAction(sets));
	};
};

const setChannelEmoteBundleAction = (
	channelSlug: string,
	sets: EmoteSet[]
): MessageActions => {
	return {
		type: ChatMessageTypes.SET_CHANNEL_EMOTE_BUNDLE_ACTION,
		channelSlug,
		sets,
	};
};
export const setChannelEmoteBundle = (channelSlug: string, sets: EmoteSet[]) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(setChannelEmoteBundleAction(channelSlug, sets));
	};
};

const clearChannelEmoteBundleAction = (channelSlug: string): MessageActions => {
	return {
		type: ChatMessageTypes.CLEAR_CHANNEL_EMOTE_BUNDLE_ACTION,
		channelSlug,
	};
};
export const clearChannelEmoteBundle = (channelSlug: string) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(clearChannelEmoteBundleAction(channelSlug));
	};
};

const setStreamMetaAction = (meta: StreamMeta): MessageActions => {
	return {
		type: ChatMessageTypes.SET_STREAM_META_ACTION,
		meta,
	};
};
export const setStreamMeta = (meta: StreamMeta) => {
	return (dispatch: FanthalDispatch) => {
		dispatch(setStreamMetaAction(meta));
	};
};

const MessageActionsFunc = {
	newMessage,
	modMessage,
	subMessage,
	gifSubMessage,
	addActivity,
	setActivityStatus,
	setKickEmotes,
	setSevenTvEmotes,
	setGlobalEmoteSets,
	setChannelEmoteBundle,
	clearChannelEmoteBundle,
	setStreamMeta,
	setChannelBadges,
	setHostInfo,
	removeHostInfo,
	clearChannelState,
	setConnectionStatus,
	setModActionStatus,
};

export default MessageActionsFunc;
