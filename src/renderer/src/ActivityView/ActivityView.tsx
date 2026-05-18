import { Button } from "@nextui-org/react";
import moment from "moment";
import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import defaultSubBadge from "../../kickBadges/defaultSubBadge.png";
import MessageActionsFunc from "../../store/actions/chatMessage";
import {
	useFanthalDispatch,
	useFanthalSelector,
} from "../../store/hooks/hooks";
import {
	ActivityItem,
	ActivityKind,
	ActivityStatus,
} from "../../util/chatInterface";
import { getActiveChannelSlug } from "../../util/channelSettings";
import { hasKickScope, parseKickScopes } from "../../util/kickScopes";
import ScrollableView from "../Component/ScrollableView/ScrollableView";

interface ActivityViewProps {}

const ACTIVITY_LABELS: Record<ActivityKind, string> = {
	subscription_new: "SUB",
	subscription_renewal: "RENEW",
	subscription_gift: "GIFT",
	reward_redemption: "REWARD",
	kicks_gifted: "KICKs",
};

const ACTIVITY_ACCENTS: Record<ActivityKind, string> = {
	subscription_new: "#d626be",
	subscription_renewal: "#b868ff",
	subscription_gift: "#ffb84d",
	reward_redemption: "#26d39b",
	kicks_gifted: "#61a8ff",
};

const toActivityStatus = (value: any): ActivityStatus => {
	if (value === "accepted" || value === "rejected") return value;
	return "pending";
};

const ActivityView: FunctionComponent<ActivityViewProps> = () => {
	const dispatch = useFanthalDispatch();
	const messages = useFanthalSelector((state) => state.messages);
	const [activities, setActivities] = useState<ActivityItem[]>([]);
	const [tokenScopes, setTokenScopes] = useState<string[]>([]);
	const activeChannelSlug = getActiveChannelSlug();
	const channelBadges =
		(activeChannelSlug && messages.channelBadgesByChannel[activeChannelSlug]) ||
		messages.channelBadges;

	const canReadRewards =
		hasKickScope(tokenScopes, "channel:rewards:read") ||
		hasKickScope(tokenScopes, "channel:rewards:write");
	const canManageRewards = hasKickScope(tokenScopes, "channel:rewards:write");

	useEffect(() => {
		setActivities(
			messages.activityList.filter(
				(item) => !activeChannelSlug || item.channelSlug === activeChannelSlug
			)
		);
	}, [messages.activityList, activeChannelSlug]);

	useEffect(() => {
		window.electron.kick
			.getAuthStatus()
			.then((authStatus) => {
				setTokenScopes(
					parseKickScopes(
						authStatus?.grantedScopes,
						authStatus?.tokenScope,
						authStatus?.introspection?.data?.scope,
						authStatus?.introspection?.data?.scopes
					)
				);
			})
			.catch(() => setTokenScopes([]));
	}, []);

	useEffect(() => {
		if (!activeChannelSlug || !canReadRewards) return;
		window.electron.kick
			.getChannelRewardRedemptions({ status: "pending" })
			.then((response) => {
				response.data?.forEach((redemption: any) => {
					const createdAt = redemption.redeemed_at
						? new Date(redemption.redeemed_at).getTime()
						: Date.now();
					dispatch(
						MessageActionsFunc.addActivity({
							id: redemption.id,
							channelSlug: activeChannelSlug,
							kind: "reward_redemption",
							actor: {
								id: redemption.user?.user_id,
								username: redemption.user?.username || "unknown",
								slug: redemption.user?.channel_slug,
								profilePicture: redemption.user?.profile_picture,
							},
							amount: redemption.reward?.cost,
							title: redemption.reward?.title,
							message: redemption.user_input,
							status: toActivityStatus(redemption.status),
							createdAt,
							create_at: createdAt,
							raw: redemption,
						})
					);
				});
			})
			.catch(() => {
				// Reward polling is best-effort; chat activity should still render.
			});
	}, [activeChannelSlug, canReadRewards, dispatch]);

	const formatActivityText = (activity: ActivityItem) => {
		switch (activity.kind) {
			case "subscription_new":
				return `Subscribed for ${activity.months ?? 1} month${
					activity.months === 1 ? "" : "s"
				}`;
			case "subscription_renewal":
				return `Renewed for ${activity.months ?? 1} month${
					activity.months === 1 ? "" : "s"
				}`;
			case "subscription_gift":
				return `Gifted ${activity.amount ?? activity.targetUsers?.length ?? 0} subscription${
					(activity.amount ?? activity.targetUsers?.length ?? 0) === 1 ? "" : "s"
				}`;
			case "reward_redemption":
				return `Redeemed ${activity.title || "a channel reward"}${
					activity.amount ? ` for ${activity.amount} points` : ""
				}`;
			case "kicks_gifted":
				return `Sent ${activity.amount ?? 0} KICKs${
					activity.title ? ` - ${activity.title}` : ""
				}`;
			default:
				return "";
		}
	};

	const getSubscriptionBadge = (activity: ActivityItem) => {
		if (activity.kind === "subscription_gift") {
			return channelBadges[channelBadges.length - 1]?.badge_image.src || defaultSubBadge;
		}
		const userBadge = channelBadges.find(
			(channelBadge) =>
				activity.months !== undefined && activity.months >= channelBadge.months
		);
		return userBadge?.badge_image.src || defaultSubBadge;
	};

	const handleRewardStatus = (
		activity: ActivityItem,
		status: "accepted" | "rejected"
	) => {
		if (!activity.id) return;
		const task =
			status === "accepted"
				? window.electron.kick.acceptChannelRewardRedemptions([activity.id])
				: window.electron.kick.rejectChannelRewardRedemptions([activity.id]);
		task.then(() => {
			dispatch(MessageActionsFunc.setActivityStatus(activity.id!, status));
		});
	};

	const Action: FunctionComponent<{
		activity: ActivityItem;
	}> = ({ activity }) => {
		const [newAction, setNewAction] = useState(false);
		const isSubscription = activity.kind.startsWith("subscription_");
		const accent = ACTIVITY_ACCENTS[activity.kind];
		const targetUsernames = useMemo(
			() =>
				activity.targetUsers?.map((user) => user.username).filter(Boolean) ||
				activity.giftedList ||
				[],
			[activity]
		);

		useEffect(() => {
			const now = new Date();
			const createAt = new Date(activity.createdAt || activity.create_at);
			if (now.getTime() < createAt.getTime() + 300000) {
				setNewAction(true);
				const timer = setTimeout(
					() => {
						setNewAction(false);
					},
					300000 - (now.getTime() - createAt.getTime())
				);
				return () => clearTimeout(timer);
			}
			setNewAction(false);
			return undefined;
		}, [activity]);

		return (
			<div
				className={`${
					newAction ? "newAction" : "border border-solid border-default-300"
				} flex flex-row justify-start items-center w-full mt-1 mb-1 p-1`}
			>
				{isSubscription ? (
					<img
						style={{ marginRight: 10, marginLeft: 10 }}
						width={26}
						height={26}
						src={getSubscriptionBadge(activity)}
						alt={ACTIVITY_LABELS[activity.kind]}
						title={ACTIVITY_LABELS[activity.kind]}
					/>
				) : (
					<div
						className="activity-type-icon"
						style={{
							borderColor: accent,
							color: accent,
						}}
						title={ACTIVITY_LABELS[activity.kind]}
					>
						{ACTIVITY_LABELS[activity.kind].slice(0, 1)}
					</div>
				)}
				<div className="w-full min-w-0">
					<div className="flex flex-row justify-between items-center w-full gap-2">
						<span className="font-semibold truncate">
							{activity.actor.username || activity.username}
						</span>
						<span className="font-semibold whitespace-nowrap">
							{moment(
								new Date(activity.createdAt || activity.create_at),
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
						<span
							className="activity-kind-badge"
							style={{ borderColor: accent, color: accent }}
						>
							{ACTIVITY_LABELS[activity.kind]}
						</span>
						&nbsp;
						{formatActivityText(activity)}
						{activity.status && (
							<>
								&nbsp;
								<span className={`activity-status activity-status-${activity.status}`}>
									{activity.status}
								</span>
							</>
						)}
						{activity.message && (
							<div style={{ color: "white" }}>{activity.message}</div>
						)}
						{targetUsernames.length > 0 && (
							<div style={{ color: "white" }}>
								{targetUsernames.join(" - ")}
							</div>
						)}
						{activity.kind === "reward_redemption" &&
							activity.status === "pending" &&
							canManageRewards && (
								<div className="activity-actions">
									<Button
										size="sm"
										color="success"
										variant="flat"
										onPress={() => handleRewardStatus(activity, "accepted")}
									>
										Accept
									</Button>
									<Button
										size="sm"
										color="danger"
										variant="flat"
										onPress={() => handleRewardStatus(activity, "rejected")}
									>
										Reject
									</Button>
								</div>
							)}
					</div>
				</div>
			</div>
		);
	};

	return (
		<>
			<h1 className="panel-title">Activity</h1>
			<ScrollableView className="w-full" style={{ flexGrow: 1 }}>
				{activities.map((activity) => (
					<Action
						key={activity.id || `${activity.kind}-${activity.actor.username}-${activity.createdAt}`}
						activity={activity}
					/>
				))}
			</ScrollableView>
		</>
	);
};

export default ActivityView;
