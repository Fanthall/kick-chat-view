import moment from "moment";
import { FunctionComponent, useEffect, useRef, useState } from "react";
import defaultSubBadge from "../../kickBadges/defaultSubBadge.png";
import { useFanthalSelector } from "../../store/hooks/hooks";
import { SubListItem } from "../../util/chatInterface";
import ScrollableView from "../Component/ScrollableView/ScrollableView";
interface SubViewProps {}
const SubView: FunctionComponent<SubViewProps> = (props) => {
	const divRef = useRef<HTMLDivElement>(null);
	const buttonDivRef = useRef<HTMLDivElement>(null);
	const messages = useFanthalSelector((state) => state.messages);
	const [subs, setSubs] = useState<SubListItem[]>([]);

	const [scrollPosition, setScrollPosition] = useState<number>(0);
	const [scrolled, setScrolled] = useState(false);
	const [autoScrolled, setAutoScrolled] = useState(false);
	useEffect(() => {
		setSubs(messages.subList);
	}, [messages.subList]);
	useEffect(() => {
		//Manuel scroll olmayan durumda auto scroll engelleniyor
		if (!scrolled) {
			divRef.current?.lastElementChild?.scrollIntoView();
		}
	}, [subs]);

	useEffect(() => {
		//başlangıçta en alta atar
		setTimeout(() => {
			divRef.current?.lastElementChild?.scrollIntoView();
		}, 1000);
	}, []);

	const Action: FunctionComponent<{
		sub: SubListItem;
	}> = (props) => {
		const [newAction, setNewAction] = useState(false);
		useEffect(() => {
			const now = new Date();
			const createAt = new Date(props.sub.create_at);
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

		const userBadge = messages.channelBadges.find((channelBadge) => {
			if (props.sub.months! >= channelBadge.months) return channelBadge;
		});
		return (
			<div
				className={`${
					newAction
						? "newAction"
						: "border border-solid border-default-300"
				} flex flex-row justify-start items-center w-full mt-1 mb-1 p-1`}
			>
				<img
					style={{ marginRight: 10, marginLeft: 10 }}
					width={26}
					height={26}
					src={
						props.sub.giftedList
							? messages.channelBadges[messages.channelBadges.length - 1]
									.badge_image.src
							: messages.channelBadges.length > 0
							? userBadge?.badge_image.src
							: defaultSubBadge
					}
					alt="sub"
					title="sub"
				/>
				<div className="w-full">
					<div className="flex flex-row justify-between items-center w-full  ">
						<span className="font-semibold ">{props.sub.username}</span>
						<span className="font-semibold ">
							{moment(
								new Date(props.sub.create_at),
								"YYYY-MM-DDTHH:mm:ss"
							).format("DD/MM/YYYY HH:mm")}
						</span>
					</div>
					<div
						style={{
							fontWeight: 500,
							color: "gray",
						}}
					>
						{props.sub.giftedList ? (
							<>
								Subscription gifts went to
								<div
									style={{
										color: "white",
									}}
								>
									{props.sub.giftedList.join("-")}
								</div>
							</>
						) : (
							`Subscribed for ${props.sub.months} months`
						)}
						<span className="font-semibold" style={{ color: "white" }}>
							{}
						</span>
					</div>
				</div>
			</div>
		);
	};
	return (
		<>
			<h1
				className="text-center font-semibold text-secondary-500 border border-solid border-default-200"
				style={{
					backgroundColor: "rgba(0,0,0,0.7)",
				}}
			>
				Subscriptions
			</h1>
			<ScrollableView className="h-[95%]">
				{subs.map((sub) => {
					return <Action sub={sub} />;
				})}
			</ScrollableView>
		</>
	);
};
export default SubView;
