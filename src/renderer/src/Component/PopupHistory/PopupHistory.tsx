import moment from "moment";
import React, { FunctionComponent } from "react";
import { GoReply } from "react-icons/go";
import { useFanthalSelector } from "../../../store/hooks/hooks";
import { ModUserHistory } from "../../../util/chatInterface";
import {
	buildBadgesHtml,
	buildEmoteMessageHtml,
} from "../../../util/chatHtml";
import { escapeHtml, safeColor } from "../../../util/htmlSafe";
import DraggableView from "../DraggableView/DraggableView";
interface PopupHistoryProps {
	onClose: () => void;

	history: ModUserHistory;
}
const PopupHistory: FunctionComponent<PopupHistoryProps> = (props) => {
	const messages = useFanthalSelector((state) => state.messages);
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
							const badgesHtml = buildBadgesHtml(
								item.sender.identity?.badges,
								messages.channelBadges
							);
							const contentHtml = buildEmoteMessageHtml(
								item.content,
								messages.sevenTvEmoteList
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
										{isReply && (
											<div className="chat-message-reply-preview flex flex-row justify-start items-center ml-2 text-small">
												<GoReply
													style={{
														marginRight: 5,
													}}
												/>
												{`${originalSenderUsername} : ${originalMessageContent.substring(
													0,
													Math.min(
														50,
														originalMessageContent.length
													)
												)}`}
											</div>
										)}

										<span
											className="chat-message-body "
											dangerouslySetInnerHTML={{
												__html:
													`<p style="display: inline-block; vertical-align: middle;">` +
													`<span class="chat-message-timestamp">${moment(
														new Date(item.created_at),
														"YYYY-MM-DDTHH:mm:ss"
													).format("HH:mm:ss")}</span>` +
													badgesHtml +
													`<span class="chat-user-username" style="color: ${safeColor(
														senderColor
													)};">${escapeHtml(senderUsername)}</span> : ` +
													contentHtml +
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
