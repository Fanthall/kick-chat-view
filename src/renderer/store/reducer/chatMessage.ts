import { SubscriberBadge } from "../../constants/kick";
import { Emote } from "../../constants/seventv";
import {
	HostInfo,
	ModMessage,
	SubListItem,
	UserMessage,
} from "../../util/chatInterface";
import { MessageActions } from "../actions/chatMessage";
import { ChatMessageTypes } from "../types/chatMessages";

interface MessageState {
	messageList: UserMessage[];
	subList: SubListItem[];
	modAction: ModMessage[];

	kickEmoteList: any[];
	sevenTvEmoteList: Emote[];
	channelBadges: SubscriberBadge[];
	hostInfo: HostInfo[];
}
const initialState: MessageState = {
	kickEmoteList: [],
	sevenTvEmoteList: [],
	messageList: [],
	subList: [],
	modAction: [],
	channelBadges: [],
	hostInfo: [],
};

const ChatMessageReducers = (
	state = initialState,
	action: MessageActions
): MessageState => {
	if (action.type === ChatMessageTypes.NEW_MESSAGE_ACTION) {
		const newList = state.messageList.concat(action.message);
		if (newList.length > 500) {
			newList.shift();
		}
		return {
			...state,
			messageList: newList,
		};
	} else if (action.type === ChatMessageTypes.MOD_MESSAGE_ACTION) {
		let newList;
		let newMessageList: UserMessage[] | undefined = undefined;
		switch (action.message.type) {
			case "to":
				const toUserMessageList = state.messageList.filter((item) => {
					return item.sender.username === action.message.user?.username;
				});
				newMessageList = state.messageList.map((item) => {
					const findMessage = toUserMessageList.find(
						(i) => item.id === i.id
					);
					if (findMessage) {
						return { ...findMessage, removed: true };
					}
					return item;
				});
				newList = [
					...state.modAction,
					{
						type: action.message.type,
						id: action.message.id,
						user: action.message.user,
						banned_by: action.message.banned_by,
						expires_at: action.message.expires_at,
						created_at: action.message.created_at,
						message: {
							messageList: toUserMessageList,
						},
					},
				];
				break;
			case "ban":
				const banUserMessageList = state.messageList.filter((item) => {
					return item.sender.username === action.message.user?.username;
				});
				newMessageList = state.messageList.map((item) => {
					const findMessage = banUserMessageList.find(
						(i) => item.id === i.id
					);
					if (findMessage) {
						return { ...findMessage, removed: true };
					}
					return item;
				});
				newList = [
					...state.modAction,
					{
						type: action.message.type,
						id: action.message.id,
						user: action.message.user,
						banned_by: action.message.banned_by,
						created_at: action.message.created_at,
						message: {
							id: action.message.message?.id,
							messageList: banUserMessageList,
						},
					},
				];

				break;
			case "unban":
				newList = [
					...state.modAction,
					{
						type: action.message.type,
						id: action.message.id,
						user: action.message.user,
						unbanned_by: action.message.unbanned_by,
						created_at: action.message.created_at,
					},
				];
				break;
			case "delete":
				newMessageList = state.messageList.map((item) => {
					if (item.id === action.message.message?.id) {
						return { ...item, removed: true };
					}
					return item;
				});
				newList = [
					...state.modAction,
					{
						type: action.message.type,
						id: action.message.id,
						created_at: action.message.created_at,
						message: {
							messageList: state.messageList.filter((item) => {
								return item.id === action.message.message?.id;
							}),
						},
					},
				];
				break;
		}
		if (newList.length > 500) {
			newList.shift();
		}
		return {
			...state,
			messageList: newMessageList ?? state.messageList,
			modAction: newList,
		};
	} else if (action.type === ChatMessageTypes.SUB_MESSAGE_ACTION) {
		const newList = state.subList.concat({
			username: action.message.username,
			months: action.message.months,
			streak: action.message.streak,
			create_at: action.message.create_at,
		});
		if (newList.length > 500) {
			newList.shift();
		}
		return {
			...state,
			subList: newList,
		};
	} else if (action.type === ChatMessageTypes.GIF_SUB_MESSAGE_ACTION) {
		const newList = state.subList.concat({
			username: action.message.gifter_username,
			giftedList: action.message.gifted_usernames,
			create_at: action.message.create_at,
		});
		if (newList.length > 500) {
			newList.shift();
		}
		return {
			...state,
			subList: newList,
		};
	} else if (action.type === ChatMessageTypes.SET_KICK_EMOTES_ACTION) {
		return { ...state, kickEmoteList: action.emotes };
	} else if (action.type === ChatMessageTypes.SET_SEVEN_TV_EMOTES_ACTION) {
		return { ...state, sevenTvEmoteList: action.emotes };
	} else if (action.type === ChatMessageTypes.SET_CHANNEL_BADGES_ACTION) {
		return { ...state, channelBadges: action.channelBadges };
	} else if (action.type === ChatMessageTypes.SET_HOST_ACTION) {
		return { ...state, hostInfo: [...state.hostInfo, action.hostInfo] };
	} else if (action.type === ChatMessageTypes.REMOVE_HOST_ACTION) {
		return {
			...state,
			hostInfo: [
				...state.hostInfo.filter((item) => {
					item.host_username === action.hostInfo.host_username;
				}),
			],
		};
	} else {
		return { ...state };
	}
};

export default ChatMessageReducers;
