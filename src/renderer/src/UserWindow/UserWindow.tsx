import { Button } from "@nextui-org/react";
import moment from "moment";
import React, { FunctionComponent, useEffect, useState } from "react";
import { FiCopy } from "react-icons/fi";
import { toast } from "react-toastify";
import { UserWindowPayload } from "../../../shared/userWindow";
import { ModMessage, UserMessage } from "../../util/chatInterface";
import { hasKickScope, parseKickScopes } from "../../util/kickScopes";
import {
	DEFAULT_TIMEOUT_SECONDS,
	formatTimeoutDuration,
	parseTimeoutSeconds,
} from "../../util/timeoutDuration";

const UserWindow: FunctionComponent = () => {
	const [payload, setPayload] = useState<UserWindowPayload | undefined>();
	const [copyStatus, setCopyStatus] = useState<string>("");
	const [broadcasterUserId, setBroadcasterUserId] = useState<
		number | undefined
	>();
	const [grantedScopes, setGrantedScopes] = useState<string[]>([]);
	const [moderationLoading, setModerationLoading] = useState<string>("");
	const [timeoutSecondsText, setTimeoutSecondsText] = useState<string>(
		String(DEFAULT_TIMEOUT_SECONDS)
	);

	useEffect(() => {
		return window.electron.userWindow.onPayload((nextPayload) => {
			setPayload(nextPayload);
			document.title = `${nextPayload.user.username} - User Details`;
		});
	}, []);

	useEffect(() => {
		if (!payload?.channelName) {
			setBroadcasterUserId(undefined);
			setGrantedScopes([]);
			return;
		}

		Promise.all([
			window.electron.kick.getChannelBySlug(payload.channelName),
			window.electron.kick.getAuthStatus().catch(() => undefined),
		])
			.then(([channelResponse, authStatus]) => {
				setBroadcasterUserId(
					channelResponse?.data?.[0]?.broadcaster_user_id
				);
				setGrantedScopes(
					parseKickScopes(
						authStatus?.grantedScopes,
						authStatus?.tokenScope,
						authStatus?.introspection?.data?.scope,
						authStatus?.introspection?.data?.scopes
					)
				);
			})
			.catch(() => {
				setBroadcasterUserId(undefined);
				setGrantedScopes([]);
			});
	}, [payload?.channelName]);

	if (!payload) {
		return (
			<div className="user-window-shell">
				<div className="user-window-empty">Waiting for user details...</div>
			</div>
		);
	}

	const hasBanScope = hasKickScope(grantedScopes, "moderation:ban");
	const hasMessageManageScope = hasKickScope(
		grantedScopes,
		"moderation:chat_message:manage"
	);
	const canUseModerationUi = payload.canModerateChannel === true;
	const canModerateUser = canUseModerationUi && !!broadcasterUserId && hasBanScope;
	const canDeleteMessages =
		canUseModerationUi && !!broadcasterUserId && hasMessageManageScope;

	const addLocalModAction = (action: ModMessage) => {
		setPayload((current) => {
			if (!current) return current;

			return {
				...current,
				messages:
					action.type === "delete" || action.type === "ban" || action.type === "to"
						? current.messages.map((message) =>
								action.type === "delete"
									? message.id === action.message?.id
										? { ...message, removed: true }
										: message
									: { ...message, removed: true }
						  )
						: current.messages,
				modActions: current.modActions.concat(action),
				updatedAt: Date.now(),
			};
		});
	};

	const createLocalAction = (
		action: "delete" | "timeout" | "ban" | "unban",
		message?: UserMessage,
		timeoutSeconds = DEFAULT_TIMEOUT_SECONDS
	): ModMessage => {
		const actor = {
			id: 0,
			username: "You",
			slug: "you",
			identity: {
				color: "#2fd3a0",
				badges: [],
			},
		};

		return {
			type: action === "timeout" ? "to" : action,
			id: `local-window-mod-${action}-${Date.now()}`,
			channelSlug: payload.channelName,
			status: "pending",
			user: payload.user,
			banned_by:
				action === "timeout" || action === "ban" ? actor : undefined,
			unbanned_by: action === "unban" ? actor : undefined,
			expires_at:
				action === "timeout"
					? new Date(Date.now() + timeoutSeconds * 1000).toISOString()
					: undefined,
			created_at: Date.now(),
			message:
				action === "delete" && message
					? {
							id: message.id,
							messageList: [message],
					  }
					: undefined,
		};
	};

	const runUserModeration = (
		action: "timeout" | "ban" | "unban",
		message?: UserMessage
	) => {
		if (!broadcasterUserId || !hasBanScope) {
			toast("Kick moderation:ban scope is not available.", {
				type: "warning",
			});
			return;
		}

		const userId = payload.user.id || message?.sender.id;
		if (!userId) {
			toast("User id is missing for moderation.", { type: "warning" });
			return;
		}

		const timeoutSeconds =
			action === "timeout"
				? parseTimeoutSeconds(timeoutSecondsText)
				: undefined;
		if (action === "timeout" && !timeoutSeconds) {
			toast("Timeout duration must be seconds, e.g. 300.", {
				type: "warning",
			});
			return;
		}

		const localAction = createLocalAction(
			action,
			message,
			timeoutSeconds || DEFAULT_TIMEOUT_SECONDS
		);
		addLocalModAction(localAction);
		setModerationLoading(action);

		const request = {
			broadcaster_user_id: broadcasterUserId,
			user_id: userId,
			reason: "Moderated from Kick Chat Viewer",
		};
		const task =
			action === "timeout"
				? window.electron.kick.timeoutUser({
						...request,
						duration: timeoutSeconds || DEFAULT_TIMEOUT_SECONDS,
				  })
				: action === "ban"
				? window.electron.kick.banUser(request)
				: window.electron.kick.unbanUser({
						broadcaster_user_id: broadcasterUserId,
						user_id: userId,
				  });

		task
			.then(() => {
				setPayload((current) =>
					current
						? {
								...current,
								modActions: current.modActions.map((item) =>
									item.id === localAction.id
										? { ...item, status: "success" }
										: item
								),
								updatedAt: Date.now(),
						  }
						: current
				);
				const actionText =
					action === "timeout"
						? `${action} ${formatTimeoutDuration(
								timeoutSeconds || DEFAULT_TIMEOUT_SECONDS
						  )}`
						: action;
				toast(`${actionText} request sent for ${payload.user.username}`, {
					type: "success",
				});
			})
			.catch((err) => {
				setPayload((current) =>
					current
						? {
								...current,
								modActions: current.modActions.map((item) =>
									item.id === localAction.id
										? {
												...item,
												status: "failed",
												error: err.message || `${action} request failed.`,
										  }
										: item
								),
								updatedAt: Date.now(),
						  }
						: current
				);
				toast(err.message || `${action} request failed.`, {
					type: "error",
				});
			})
			.finally(() => setModerationLoading(""));
	};

	const runDeleteMessage = (message: UserMessage) => {
		if (!hasMessageManageScope) {
			toast("Kick moderation:chat_message:manage scope is not available.", {
				type: "warning",
			});
			return;
		}

		const localAction = createLocalAction("delete", message);
		addLocalModAction(localAction);
		setModerationLoading(`delete-${message.id}`);
		window.electron.kick
			.deleteChatMessage(message.id)
			.then(() => {
				setPayload((current) =>
					current
						? {
								...current,
								modActions: current.modActions.map((item) =>
									item.id === localAction.id
										? { ...item, status: "success" }
										: item
								),
								updatedAt: Date.now(),
						  }
						: current
				);
				toast("Delete request sent.", { type: "success" });
			})
			.catch((err) => {
				setPayload((current) =>
					current
						? {
								...current,
								modActions: current.modActions.map((item) =>
									item.id === localAction.id
										? {
												...item,
												status: "failed",
												error: err.message || "Delete request failed.",
										  }
										: item
								),
								updatedAt: Date.now(),
						  }
						: current
				);
				toast(err.message || "Delete request failed.", { type: "error" });
			})
			.finally(() => setModerationLoading(""));
	};

	return (
		<div className="user-window-shell">
			<header className="user-window-header">
				<div>
					<div className="user-window-title-row">
						<div className="user-window-title">{payload.user.username}</div>
						<button
							type="button"
							className="user-window-copy"
							title="Copy username"
							onClick={() => {
								navigator.clipboard
									.writeText(payload.user.username)
									.then(() => {
										setCopyStatus("Copied");
										setTimeout(() => setCopyStatus(""), 1400);
									})
									.catch(() => {
										setCopyStatus("Copy failed");
									});
							}}
						>
							<FiCopy size={14} />
							{copyStatus || "Copy"}
						</button>
					</div>
					<div className="user-window-subtitle">
						{payload.channelName || "No channel"} - {payload.messages.length} messages - {payload.modActions.length} mod actions
					</div>
				</div>
				<div className="user-window-badges">
					{payload.user.identity?.badges?.map((badge) => {
						const label = badge.text || badge.type;
						const isSubscriber =
							badge.type?.toLowerCase() === "subscriber" &&
							typeof badge.count === "number" &&
							badge.count > 0;
						return (
							<span
								key={`${badge.type}-${badge.text}-${badge.count ?? ""}`}
								className="user-window-badge"
								title={
									isSubscriber
										? `${badge.count} ay abone`
										: undefined
								}
							>
								{label}
								{isSubscriber && (
									<span className="user-window-badge-count">
										{badge.count}
										<span className="user-window-badge-count-unit">ay</span>
									</span>
								)}
							</span>
						);
					})}
				</div>
			</header>
			{canUseModerationUi && (
				<section className="user-window-actions">
					<Button
						size="sm"
						color="warning"
						variant="flat"
						isDisabled={!canModerateUser}
						isLoading={moderationLoading === "timeout"}
						onPress={() => runUserModeration("timeout")}
					>
						Timeout
					</Button>
					<input
						className="user-window-timeout-input"
						value={timeoutSecondsText}
						onChange={(event) => setTimeoutSecondsText(event.target.value)}
						title="Timeout seconds"
					/>
					<Button
						size="sm"
						color="danger"
						variant="flat"
						isDisabled={!canModerateUser}
						isLoading={moderationLoading === "ban"}
						onPress={() => runUserModeration("ban")}
					>
						Ban
					</Button>
					<Button
						size="sm"
						variant="flat"
						isDisabled={!canModerateUser}
						isLoading={moderationLoading === "unban"}
						onPress={() => runUserModeration("unban")}
					>
						Unban
					</Button>
					<span className="user-window-muted">
						{canModerateUser || canDeleteMessages
							? "Moderation ready"
							: "Missing moderation scopes"}
					</span>
				</section>
			)}
			<section className="user-window-section user-window-section--messages">
				<div className="user-window-section-title">Messages</div>
				<div className="user-window-list">
					{payload.messages.length === 0 && (
						<div className="user-window-muted">No messages captured yet.</div>
					)}
					{payload.messages.map((message) => (
						<div key={message.id} className="user-window-message">
							<span className="user-window-time">
								{moment(new Date(message.created_at)).format("HH:mm:ss")}
							</span>
							<span
								className="user-window-name"
								style={{ color: message.sender.identity?.color || "#2fd3a0" }}
							>
								{message.sender.username}
							</span>
							<span className={message.removed ? "removedMessage" : ""}>
								{message.content}
							</span>
							{canUseModerationUi && (
								<Button
									size="sm"
									color="danger"
									variant="flat"
									className="user-window-inline-action"
									isDisabled={!canDeleteMessages || message.removed}
									isLoading={moderationLoading === `delete-${message.id}`}
									onPress={() => runDeleteMessage(message)}
								>
									Delete
								</Button>
							)}
						</div>
					))}
				</div>
			</section>
			<section className="user-window-section user-window-section--moderation">
				<div className="user-window-section-title">Moderation</div>
				<div className="user-window-list">
					{payload.modActions.length === 0 && (
						<div className="user-window-muted">No moderation actions captured.</div>
					)}
					{payload.modActions.map((action) => (
						<div key={action.id} className="user-window-mod-action">
							<span className="user-window-time">
								{moment(new Date(action.created_at)).format("HH:mm:ss")}
							</span>
							<span>{action.type.toUpperCase()}</span>
							<span className={`user-window-status user-window-status-${action.status || "success"}`}>
								{action.status || "success"}
							</span>
							<span className="user-window-muted">
								{action.banned_by?.username ||
									action.unbanned_by?.username ||
									"system"}
							</span>
						</div>
					))}
				</div>
			</section>
		</div>
	);
};

export default UserWindow;
