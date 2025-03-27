import Moment from "moment";
import React, { FunctionComponent, useEffect, useState } from "react";
import { GoReply } from "react-icons/go";
import { TfiAnnouncement } from "react-icons/tfi";
import { toast } from "react-toastify";
import { fetchGitHubData } from "../../services/githubAccessHandle";
import MessageActionsFunc from "../../store/actions/chatMessage";
import {
	useFanthalDispatch,
	useFanthalSelector,
} from "../../store/hooks/hooks";
import { UserMessage } from "../../util/chatInterface";
import ScrollableView from "../Component/ScrollableView/ScrollableView";
import moderator from "./../../kickBadges/channelMod.png";
import founder from "./../../kickBadges/founder.png";
import og from "./../../kickBadges/og.png";
import verified from "./../../kickBadges/verified.png";
import vip from "./../../kickBadges/vip.png";

interface ChatProps {}
const Chat: FunctionComponent<ChatProps> = () => {
	const messages = useFanthalSelector((state) => state.messages);
	const [messageList, setMessageList] = useState<UserMessage[]>([]);
	const dispatch = useFanthalDispatch();
	const [username, setUsername] = useState<string | undefined>(undefined);
	const kickEmoteRegex = /\[emote:(\d+):(\w+)\]/g;
	const [susUsers, setSusUsers] = useState<string[]>([]);
	const [blockEmotes, setBlockEmotes] = useState<string[]>([]);

	useEffect(() => {
		const setName = () => {
			const username = localStorage.getItem("username");
			const blockEmotes = localStorage.getItem("blockEmotes");
			if (username) setUsername(username);
			setInterval(() => {
				fetchGitHubData().then((res) => {
					setSusUsers(res);
				});
			}, 30000);
			if (blockEmotes) setBlockEmotes(JSON.parse(blockEmotes));
		};
		const setSusAndBlockEmotes = () => {
			const susUsers = localStorage.getItem("susUsers");
			const blockEmotes = localStorage.getItem("blockEmotes");
			if (susUsers) setSusUsers(JSON.parse(susUsers));
			if (blockEmotes) setBlockEmotes(JSON.parse(blockEmotes));
		};

		setName();
		function localStorageChanged(event: StorageEvent) {
			setSusAndBlockEmotes();

			// Değişiklik yapılan localStorage anahtarını kontrol edebilirsiniz.
			// event.key kullanarak.
			// Yeni ve eski değerleri event.newValue ve event.oldValue kullanarak alabilirsiniz.
		}

		window.addEventListener("storage", localStorageChanged);
	}, []);

	useEffect(() => {
		setMessageList(messages.messageList);
	}, [messages.messageList]);

	useEffect(() => {
		for (const hostInfo of messages.hostInfo) {
			toast(
				<div className="flex flex-col justify-center items-center">
					<div className=" font-bold">{`${hostInfo.host_username} ${hostInfo.number_viewers} kişi ile geldi.`}</div>
					<div className="test">{hostInfo.optional_message}</div>
				</div>
			);

			dispatch(MessageActionsFunc.removeHostInfo(hostInfo));
		}
	}, [messages.hostInfo]);

	return (
		<>
			<ScrollableView className="h-[95%] p-2">
				{messageList.map((item) => {
					const sevenTvEmoteSetMessage = item.content
						.split(" ")
						.map((word) => {
							const emoteData = messages.sevenTvEmoteList?.find(
								(obj) => {
									return obj.name === word;
								}
							);
							if (emoteData) {
								return `<img class="chat-emote" src="https:${emoteData?.data.host.url}/${emoteData?.data.host.files[0].name}" alt="${word}" title="${word}" />`;
							} else {
								return word;
							}
						})
						.join(" ");

					const chatBadges = item.sender.identity?.badges.map((badge) => {
						switch (badge.type.toLowerCase()) {
							case "host":
								break;
							case "founder":
								return `<img
													class="chat-badge"
													key="${item.id}-founderBadge"
													width="20px"
													height="20px"
													src="${founder}"
													alt="founder"
													title="founder"
												/>`;
							case "subscriber":
								const userBadge = messages.channelBadges.find(
									(channelBadge) => {
										if (badge.count! >= channelBadge.months)
											return channelBadge;
									}
								);
								return `<img
													class="chat-badge"
													key="${item.id}-subBadge"
													width="20px"
													height="20px"
													src="${userBadge?.badge_image.src}"
													alt="sub-${badge.count}"
													title="sub-${badge.count}"
												/>`;
							case "og":
								return `<img
													class="chat-badge"
													key="${item.id}-ogBadge"
													width="20px"
													height="20px"
													src="${og}"
													alt="og"
													title="og"
												/>`;
							case "vip":
								return `<img
													class="chat-badge"
													key="${item.id}-vipBadge"
													width="20px"
													height="20px"
													src="${vip}"
													alt="vip"
													title="vip"
												/>`;
							case "verified":
								return `<img
													class="chat-badge"
													key="${item.id}-verifiedBadge"
													width="20px"
													height="20px"
													src="${verified}"
													alt="verified"
													title="verified"
												/>`;
							case "moderator":
								return `<img
													class="chat-badge"
													key="${item.id}-modBadge"
													width="20px"
													height="20px"
													src="${moderator}"
													alt="moderator"
													title="vimoderatorp"
													/>`;
							//TODO: Diğer badgeler eklenecek.
						}
					});
					let message =
						`<p style="display: inline-block; vertical-align: middle;">` +
						`<span class="chat-message-timestamp" style="color: gray;">${Moment(
							new Date(item.created_at),
							"YYYY-MM-DDTHH:mm:ss"
						).format("HH:mm:ss")}</span>` +
						chatBadges?.join("") +
						`<span class="${
							item.removed ? "removedMessage" : ""
						}"><span class="chat-user-username" style="color: ${item
							.sender.identity?.color};">${
							item.sender.username
						}</span> : ` +
						sevenTvEmoteSetMessage.replace(
							/\[emote:(\d+):(\w+)\]/g,
							'<img class="chat-emote" src="https://files.kick.com/emotes/$1/fullsize" alt="$2" title="$2" />'
						) +
						"</span></p>";
					// if (blockEmotes.length>0) {
					// 	const regexPattern: string = `<img\\s+[^>]*alt="[^"]*(${blockEmotes.join(
					// 		"|"
					// 	)})[^"]*"[^>]*>`;
					// 	const regex: RegExp = new RegExp(regexPattern, "gi");
					// 	const matchedTags: RegExpMatchArray | null =
					// 		message.match(regex);

					// 	// Bulunan etiketlerin class özniteliğini güncelleme
					// 	if (matchedTags) {
					// 		matchedTags.forEach((tag: string) => {
					// 			message = message.replace(
					// 				tag,
					// 				tag.replace("chat-emote", "chat-emote hidden-emote")
					// 			);
					// 		});
					// 	}
					// }
					const sus = susUsers.filter(
						(i) => i.toLowerCase() === item.sender.username.toLowerCase()
					);
					return (
						<div
							key={"message-list-" + item.id}
							className={`chat-message-container  ${
								item.metadata?.original_sender.username.toLowerCase() ===
									username?.toLowerCase() ||
								item.content
									.toLowerCase()
									.includes(username ? username.toLowerCase() : "")
									? " border border-solid border-danger rounded-small p-1"
									: ""
							} ${sus.length > 0 ? " sus-user" : ""}${
								item.type === "celebration" ? " subs-publication " : ""
							}`}
						>
							<div className="chat-message-background" tabIndex={0}>
								{item.type === "reply" && (
									<div
										className="flex flex-row justify-start items-center ml-2 text-small"
										style={{ color: "gray" }}
									>
										<GoReply style={{ marginRight: 5 }} />
										{`${item.metadata?.original_sender
											.username} : ${item.metadata?.original_message.content.substring(
											0,
											Math.min(
												50,
												item.metadata?.original_message.content
													.length
											)
										)}`}
									</div>
								)}
								{item.type === "celebration" && (
									<div
										className="flex flex-row justify-start items-center ml-2 text-small"
										style={{ color: "gray" }}
									>
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
			<div className="h-[7%] w-full border border-solid border-default-200 flex justify-center items-center flex-row">
				<div className="border border-solid border-default-200 w-[80%] h-[90%] flex justify-start items-center">
					input
					{
						//TODO Login sistemiyle beraber input eklenecek inputun sağ kenarında emote seçim menüsü ve auto complate emote olacak..
					}
				</div>
				<div
					className="border border-solid border-default-200 w-[20%] h-[90%] flex justify-center items-center"
					onClick={() => {
						toast("Wow so easy!", { type: "info" });
					}}
				>
					button
				</div>
			</div>
		</>
	);
};
export default Chat;
