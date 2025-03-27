import { getChannelData } from "../services/kick";
import MessageActionsFunc from "../store/actions/chatMessage";
import { FanthalDispatch } from "../store/store";
import {
	BanToMessage,
	DeleteMessage,
	GiftSubMessage,
	HostInfo,
	SubMessage,
	UnBanTOMessage,
	UserMessage,
} from "./chatInterface";
interface EventType {
	channel: string;
	data: string;
	event: string;
}
export const chatListener = () => {
	return (dispatch: FanthalDispatch) => {
		const socket = new WebSocket(
			"wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false"
		);

		socket.addEventListener("open", (event) => {
			const channelName = localStorage.getItem("channelName");
			if (channelName) {
				getChannelData(channelName).then((res) => {
					dispatch(
						MessageActionsFunc.setChannelBadges(
							res.data.subscriber_badges.reverse()
						)
					);
					socket.send(
						`{"event":"pusher:subscribe","data":{"auth":"","channel":"chatrooms.${res.data.chatroom.id}.v2"}}`
					);
				});
			}
		});

		// Listen for messages
		socket.addEventListener("message", (event) => {
			const parsedEvent: EventType = JSON.parse(event.data);
			switch (parsedEvent.event) {
				case "App\\Events\\ChatMessageEvent":
					const parsedMessage: UserMessage = JSON.parse(parsedEvent.data);
					dispatch(MessageActionsFunc.newMessage(parsedMessage));
					break;
				case "App\\Events\\SubscriptionEvent":
					const parsedSubMessage: SubMessage = JSON.parse(
						parsedEvent.data
					);
					dispatch(
						MessageActionsFunc.subMessage({
							...parsedSubMessage,
							create_at: new Date().getTime(),
						})
					);
					break;
				case "App\\Events\\GiftedSubscriptionsEvent":
					const parsedGiftSubMessage: GiftSubMessage = JSON.parse(
						parsedEvent.data
					);
					dispatch(
						MessageActionsFunc.gifSubMessage({
							...parsedGiftSubMessage,
							create_at: new Date().getTime(),
						})
					);
					break;
				case "App\\Events\\MessageDeletedEvent":
					const parsedDeleteMessage: DeleteMessage = JSON.parse(
						parsedEvent.data
					);
					dispatch(
						MessageActionsFunc.modMessage({
							created_at: new Date().getTime(),
							type: "delete",
							id: parsedDeleteMessage.id,
							message: parsedDeleteMessage.message,
						})
					);
					break;
				case "App\\Events\\UserBannedEvent":
					const parsedBannedMessage: BanToMessage = JSON.parse(
						parsedEvent.data
					);
					dispatch(
						MessageActionsFunc.modMessage({
							created_at: new Date().getTime(),
							type: parsedBannedMessage.expires_at ? "to" : "ban",
							id: parsedBannedMessage.id,
							banned_by: parsedBannedMessage.banned_by,
							user: parsedBannedMessage.user,
							expires_at: parsedBannedMessage.expires_at,
						})
					);
					break;
				case "App\\Events\\UserUnbannedEvent":
					const parsedUnbannedMessage: UnBanTOMessage = JSON.parse(
						parsedEvent.data
					);
					dispatch(
						MessageActionsFunc.modMessage({
							type: "unban",
							created_at: new Date().getTime(),
							id: parsedUnbannedMessage.id,
							unbanned_by: parsedUnbannedMessage.unbanned_by,
							user: parsedUnbannedMessage.user,
						})
					);
					break;
				case "App\\Events\\FollowersUpdated":
					break;
				case "App\\Events\\StreamHostEvent":
					const parsedHostInfo: HostInfo = JSON.parse(parsedEvent.data);
					dispatch(
						MessageActionsFunc.setHostInfo({
							host_username: parsedHostInfo.host_username,
							number_viewers: parsedHostInfo.number_viewers,
							optional_message: parsedHostInfo.optional_message,
						})
					);
					break;
				default:
					break;
			}
		});
	};
};
