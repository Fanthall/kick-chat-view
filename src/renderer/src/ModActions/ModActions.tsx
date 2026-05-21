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
import { getActiveChannelSlug } from "../../util/channelSettings";
import { buildUserWindowPayload } from "../../util/userWindowPayload";
import { getBlockedEmotes } from "../../util/localModerationStorage";
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
	const activeChannelSlug = getActiveChannelSlug();

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
		setModActions(
			messages.modAction.filter(
				(item) => !activeChannelSlug || item.channelSlug === activeChannelSlug
			)
		);
	}, [messages.modAction, activeChannelSlug]);

	useEffect(() => {
		const latestAction = messages.modAction[messages.modAction.length - 1];
		const user =
			latestAction?.user || latestAction?.message?.messageList?.[0]?.sender;
		if (!user) return;

		const channelName = localStorage.getItem("channelName") || undefined;
		window.electron.userWindow.update(
			buildUserWindowPayload({
				user,
				messages: messages.messageList,
				modActions: messages.modAction,
				openedFrom: "moderation",
				channelName,
				canModerateChannel: false,
				channelEmoteSets: channelName
					? messages.emoteSetsByChannel[channelName] || []
					: [],
				globalEmoteSets: messages.globalEmoteSets,
				blockedEmotes: getBlockedEmotes(),
			})
		);
	}, [messages.modAction, messages.messageList]);

	const kickEmoteRegex = /\[emote:(\d+):(\w+)\]/g;
	const Action: FunctionComponent<{
		icon: ReactNode;
		operation: ModMessage;
		title: string;
	}> = (props) => {
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
						<span className={`mod-action-status mod-action-status-${props.operation.status || "success"}`}>
							{props.operation.status || "success"}
						</span>
						&nbsp;
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
									const user =
										props.operation.user ||
										props.operation.message?.messageList?.[0]?.sender;
									if (!user) return;
									const channelName =
										localStorage.getItem("channelName") || undefined;
									window.electron.userWindow.open(
										buildUserWindowPayload({
											user,
											messages: messages.messageList,
											modActions: messages.modAction,
											openedFrom: "moderation",
											channelName,
											canModerateChannel: false,
											channelEmoteSets: channelName
												? messages.emoteSetsByChannel[channelName] ||
													[]
												: [],
											globalEmoteSets: messages.globalEmoteSets,
											blockedEmotes: getBlockedEmotes(),
										})
									);
								}}
								className="text-secondary-500"
								variant="light"
							>
								Open User Window
							</Button>
						</div>
					)}
				</div>
			</div>
		);
	};
	return (
		<>
			<h1 className="panel-title">
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
