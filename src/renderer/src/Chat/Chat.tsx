import Moment from "moment";
import { FunctionComponent, useEffect, useRef, useState } from "react";
import { GoReply } from "react-icons/go";
import { toast } from "react-toastify";
import { useFanthalSelector } from "../../store/hooks/hooks";
import { UserMessage } from "../../util/chatInterface";
import ScrollableView from "../Component/ScrollableView/ScrollableView";
import moderator from "./../../kickBadges/channelMod.png";
import founder from "./../../kickBadges/founder.png";
import og from "./../../kickBadges/og.png";
import verified from "./../../kickBadges/verified.png";
import vip from "./../../kickBadges/vip.png";

interface ChatProps {}
const Chat: FunctionComponent<ChatProps> = () => {
	const divRef = useRef<HTMLDivElement>(null);
	const messages = useFanthalSelector((state) => state.messages);
	const [messageList, setMessageList] = useState<UserMessage[]>([]);
	const [username, setUsername] = useState<string | undefined>(undefined);
	const [scrolled, setScrolled] = useState(false);
	const kickEmoteRegex = /\[emote:(\d+):(\w+)\]/g;

	useEffect(() => {
		const funk = (setUsername: (val: string) => void) => {
			const username = localStorage.getItem("username");
			if (username) setUsername(username);
		};
		funk(setUsername);
	}, []);

	useEffect(() => {
		//Manuel scroll olmayan durumda auto scroll engelleniyor
		if (!scrolled) {
			divRef.current?.lastElementChild?.scrollIntoView();
		}
	}, [messageList]);

	useEffect(() => {
		//başlangıçta en alta atar
		setTimeout(() => {
			divRef.current?.lastElementChild?.scrollIntoView();
		}, 1000);
	}, []);

	useEffect(() => {
		setMessageList(messages.messageList);
	}, [messages.messageList]);

	return (
		<>
			<ScrollableView className="h-[95%]">
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
								return `<img class="chat-emote" src="${emoteData?.data.host.url}/${emoteData?.data.host.files[0].name}" alt="${word}" title="${word}" />`;
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
								<span
									dangerouslySetInnerHTML={{
										__html:
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
												kickEmoteRegex,
												'<img class="chat-emote" src="https://files.kick.com/emotes/$1/fullsize" alt="$2" title="$2" />'
											) +
											"</span></p>",
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
						toast("Wow so easy!", {
							type: "info",
						});
					}}
				>
					button
				</div>
			</div>
		</>
	);
};
export default Chat;
