import moment from "moment";
import React, { FunctionComponent } from "react";
import { GoReply } from "react-icons/go";
import { useFanthalSelector } from "../../../store/hooks/hooks";
import { ModUserHistory } from "../../../util/chatInterface";
import DraggableView from "../DraggableView/DraggableView";
import moderator from "./../../kickBadges/channelMod.png";
import founder from "./../../kickBadges/founder.png";
import og from "./../../kickBadges/og.png";
import verified from "./../../kickBadges/verified.png";
import vip from "./../../kickBadges/vip.png";
interface PopupHistoryProps {
	onClose: () => void;

	history: ModUserHistory;
}
const PopupHistory: FunctionComponent<PopupHistoryProps> = (props) => {
	const messages = useFanthalSelector((state) => state.messages);
	const kickEmoteRegex = /\[emote:(\d+):(\w+)\]/g;
	return (
		<DraggableView
			title={"User History"}
			maxHeight={600}
			maxWidth={400}
			content={
				<div
					className="flex justify-start items-start flex-row h-[90%] w-full border border-solid border-default-200 pl-2"
					style={{
						overflow: "hidden",
						backgroundColor: "rgba(0,0,0,0.6)",
					}}
				>
					<div
						style={{
							width: "100%",
							height: "100%",
							overflowY: "scroll",
							paddingRight: 17 /* Increase/decrease this value for cross-browser compatibility */,
							boxSizing:
								"content-box" /* So the width will be 100% + 17px */,
						}}
					>
						{props.history?.messageList?.map((item) => {
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

							const chatBadges = item.sender.identity?.badges.map(
								(badge) => {
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
								}
							);
							return (
								<div
									key={"message-list-" + item.id}
									className={`chat-message-container`}
								>
									<div
										className="chat-message-background"
										tabIndex={0}
									>
										{item.type === "reply" && (
											<div
												className="flex flex-row justify-start items-center ml-2 text-small"
												style={{ color: "gray" }}
											>
												<GoReply
													style={{
														marginRight: 5,
													}}
												/>
												{`${item.metadata?.original_sender
													.username} : ${item.metadata?.original_message.content.substring(
													0,
													Math.min(
														50,
														item.metadata?.original_message
															.content.length
													)
												)}`}
											</div>
										)}

										<span
											className="chat-message-body "
											dangerouslySetInnerHTML={{
												__html:
													`<p style="display: inline-block; vertical-align: middle;">` +
													`<span class="chat-message-timestamp" style="color: gray;">${moment(
														new Date(item.created_at),
														"YYYY-MM-DDTHH:mm:ss"
													).format("HH:mm:ss")}</span>` +
													chatBadges?.join("") +
													`<span class="chat-user-username" style="color: ${item.sender.identity?.color};">${item.sender.username}</span> : ` +
													sevenTvEmoteSetMessage.replace(
														kickEmoteRegex,
														'<img class="chat-emote" src="https://files.kick.com/emotes/$1/fullsize" alt="$2" title="$2" />'
													) +
													"</p>",
											}}
										></span>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			}
			onClose={props.onClose}
			position={{ top: 50, left: 150 }}
		/>
	);
};

export default PopupHistory;
