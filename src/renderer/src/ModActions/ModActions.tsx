import {
	Button,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@nextui-org/react";
import moment from "moment";
import React, {
	FunctionComponent,
	ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { BsBan, BsTrash3 } from "react-icons/bs";
import { GoReply } from "react-icons/go";
import { LuTimerReset } from "react-icons/lu";
import { MdAccessTime } from "react-icons/md";
import { TbSwordOff } from "react-icons/tb";
import { useFanthalSelector } from "../../store/hooks/hooks";
import { ModMessage } from "../../util/chatInterface";
import DraggableView from "../Component/DraggableView/DraggableView";
import ScrollableView from "../Component/ScrollableView/ScrollableView";
import moderator from "./../../kickBadges/channelMod.png";
import founder from "./../../kickBadges/founder.png";
import og from "./../../kickBadges/og.png";
import verified from "./../../kickBadges/verified.png";
import vip from "./../../kickBadges/vip.png";
interface ModActionsProps {}
const ModActions: FunctionComponent<ModActionsProps> = () => {
	const divRef = useRef<HTMLDivElement>(null);
	const buttonDivRef = useRef<HTMLDivElement>(null);
	const messages = useFanthalSelector((state) => state.messages);
	const [modActions, setModActions] = useState<ModMessage[]>([]);

	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		//Manuel scroll olmayan durumda auto scroll engelleniyor
		if (!scrolled) {
			divRef.current?.lastElementChild?.scrollIntoView();
		}
	}, [modActions]);

	useEffect(() => {
		//başlangıçta en alta atar
		setTimeout(() => {
			divRef.current?.lastElementChild?.scrollIntoView();
		}, 1000);
	}, []);

	useEffect(() => {
		setModActions(messages.modAction);
	}, [messages.modAction]);

	const kickEmoteRegex = /\[emote:(\d+):(\w+)\]/g;
	const Action: FunctionComponent<{
		icon: ReactNode;
		operation: ModMessage;
		title: string;
	}> = (props) => {
		const [isOpen, setOpen] = useState<boolean>(false);
		const [newAction, setNewAction] = useState<boolean>(false);
		useEffect(() => {
			const now = new Date();
			const createAt = new Date(props.operation.created_at);
			if (now.getTime() < createAt.getTime() + 300000) {
				setNewAction(true);
				setTimeout(
					() => {
						setNewAction(false);
					},
					300000 - (now.getTime() - createAt.getTime())
				);
			} else {
				setNewAction(false);
			}
		});
		return (
			<div
				className={`${
					newAction
						? "newAction"
						: "border border-solid border-default-300"
				} flex flex-row justify-between items-center w-full mt-1 mb-1 p-1 `}
			>
				<div className="w-[20%] flex flex-col justify-center items-center">
					<div>{props.icon}</div>
					<div className="text-tiny">
						{moment(
							new Date(props.operation.created_at),
							"YYYY-MM-DDTHH:mm:ss"
						).format("YYYY-MM-DD")}
					</div>
					<div className="text-tiny">
						{moment(
							new Date(props.operation.created_at),
							"YYYY-MM-DDTHH:mm:ss"
						).format("HH:mm:ss")}
					</div>
				</div>
				<div className="w-[75%]">
					<div className="font-semibold w-full flex flex-row justify-between items-center">
						{props.operation.user?.username}
						<span className="text-tiny">
							{props.operation.expires_at && (
								<Popover placement="bottom" showArrow={true}>
									<PopoverTrigger>
										<Button size="sm" variant="light">
											<LuTimerReset />
											End
										</Button>
									</PopoverTrigger>
									<PopoverContent>
										{moment(
											new Date(props.operation.expires_at),
											"YYYY-MM-DDTHH:mm:ss"
										).format("YYYY-MM-DD HH:mm:ss")}
									</PopoverContent>
								</Popover>
							)}
						</span>
					</div>
					<div
						style={{
							fontWeight: 500,
							color: "gray",
						}}
					>
						{props.title}&nbsp;
						{props.operation.type === "delete" ? (
							<span className="font-semibold" style={{ color: "white" }}>
								<>
									{props.operation.message?.messageList?.map(
										(item) => {
											return `${item.sender.username}`;
										}
									)}
								</>
							</span>
						) : (
							<>
								<span
									className="font-semibold"
									style={{ color: "white" }}
								>
									{props.operation.type === "unban"
										? props.operation.unbanned_by?.username
										: props.operation.banned_by?.username}
								</span>
							</>
						)}
					</div>
					{props.operation.type !== "unban" && (
						<div className="w-full flex flex-row justify-end">
							<Button
								size="sm"
								onPress={() => {
									setOpen(true);
								}}
								className="text-secondary-500"
								variant="light"
							>
								Message History
							</Button>
						</div>
					)}
				</div>
				{isOpen && (
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
									{props.operation.message?.messageList?.map(
										(item) => {
											const sevenTvEmoteSetMessage = item.content
												.split(" ")
												.map((word) => {
													const emoteData =
														messages.sevenTvEmoteList?.find(
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

											const chatBadges =
												item.sender.identity?.badges.map(
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
																const userBadge =
																	messages.channelBadges.find(
																		(channelBadge) => {
																			if (
																				badge.count! >=
																				channelBadge.months
																			)
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
																{`${item.metadata
																	?.original_sender
																	.username} : ${item.metadata?.original_message.content.substring(
																	0,
																	Math.min(
																		50,
																		item.metadata
																			?.original_message
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
																	).format(
																		"HH:mm:ss"
																	)}</span>` +
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
										}
									)}
								</div>
							</div>
						}
						onClose={() => {
							setOpen(false);
						}}
						position={{ top: 50, left: 150 }}
					/>
				)}
			</div>
		);
	};
	return (
		<>
			<h1
				className="w-full text-center font-semibold text-secondary-500 border border-solid border-default-200"
				style={{
					backgroundColor: "rgba(0,0,0,0.7)",
				}}
			>
				Mod İşlemleri
			</h1>

			<ScrollableView className="w-full" style={{ flexGrow: 1 }}>
				{modActions.map((operation) => {
					switch (operation.type) {
						case "to":
							return (
								<Action
									key={operation.id}
									title="Timeout by"
									icon={
										<MdAccessTime
											size={26}
											style={{ marginRight: 10 }}
										/>
									}
									operation={operation}
								/>
							);
						case "ban":
							return (
								<Action
									key={operation.id}
									title="Banned by"
									icon={
										<BsBan size={26} style={{ marginRight: 10 }} />
									}
									operation={operation}
								/>
							);
						case "unban":
							return (
								<Action
									key={operation.id}
									title="Unbanned by"
									icon={
										<TbSwordOff
											size={26}
											style={{ marginRight: 10 }}
										/>
									}
									operation={operation}
								/>
							);
						case "delete":
							return (
								<Action
									key={operation.id}
									title="Deleted message : "
									icon={
										<BsTrash3 size={26} style={{ marginRight: 10 }} />
									}
									operation={operation}
								/>
							);
						default:
							break;
					}
				})}
			</ScrollableView>
		</>
	);
};

export default ModActions;
