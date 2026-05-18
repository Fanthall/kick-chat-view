import {
	Button,
	Chip,
	Input,
	Listbox,
	ListboxItem,
	Modal,
	ModalBody,
	ModalContent,
	ModalFooter,
	ModalHeader,
	useDisclosure,
} from "@nextui-org/react";
import React, {
	FunctionComponent,
	useEffect,
	useMemo,
	useState,
} from "react";
import { FaTrashAlt } from "react-icons/fa";
import { toast } from "react-toastify";
import {
	addBlockedEmote,
	addSuspendedUser,
	getBlockedEmotes,
	getSuspendedUsers,
	removeBlockedEmote,
	removeSuspendedUser,
} from "../../util/localModerationStorage";
import {
	useFanthalDispatch,
	useFanthalSelector,
} from "../../store/hooks/hooks";
import { chatListener } from "../../util/chatConnection";
import {
	DEFAULT_TIMEOUT_SECONDS_STORAGE_KEY,
	getDefaultTimeoutSeconds,
	setDefaultTimeoutSeconds,
} from "../../util/chatCommands";
import {
	ChatViewChannel,
	addChannel,
	getActiveChannelSlug,
	getChannelList,
	removeChannel,
	setActiveChannelSlug,
	updateChannelAutoConnect,
} from "../../util/channelSettings";
import { parseKickScopes } from "../../util/kickScopes";
import { maskSensitive } from "../../util/maskSensitive";
import {
	DEFAULT_MOD_CHECK_MESSAGE,
	getModCheckMessage,
	MOD_CHECK_MESSAGE_STORAGE_KEY,
	setModCheckMessage,
} from "../../util/modDetectionSettings";
interface SettingsProps {}

const Settings: FunctionComponent<SettingsProps> = (props) => {
	const dispatch = useFanthalDispatch();
	const messages = useFanthalSelector((state) => state.messages);
	const [channelName, setChannelName] = useState<string>("");
	const connectionStatus =
		(channelName && messages.connectionStatusByChannel[channelName]) ||
		messages.connectionStatus;
	const [username, setUsername] = useState<string>("");
	const [showErrorMessage, setShowErrorMessage] = useState<boolean>(false);
	const [susUsers, setSusUsers] = useState<string[]>([]);
	const [blockEmotes, setBlockEmotes] = useState<string[]>([]);
	const [susUser, setSusUser] = useState<string>("");
	const [blockEmote, setBlockEmote] = useState<string>("");
	const [channels, setChannels] = useState<ChatViewChannel[]>([]);
	const [openModalSusUser, setOpenModalSusUser] = useState<boolean>(false);
	const [openModalBlockEmote, setOpenModalBlockEmote] =
		useState<boolean>(false);
	const [kickAuthStatus, setKickAuthStatus] = useState<any>();
	const [kickAuthMessage, setKickAuthMessage] = useState<string>("");
	const [kickUserInfo, setKickUserInfo] = useState<any>();
	const [ownChannels, setOwnChannels] = useState<any[]>([]);
	const [isChannelOwner, setIsChannelOwner] = useState<boolean | undefined>();
	const [kickUserInfoMessage, setKickUserInfoMessage] =
		useState<string>("");
	const [defaultTimeoutText, setDefaultTimeoutText] = useState<string>(
		String(getDefaultTimeoutSeconds())
	);
	const [modCheckMessageText, setModCheckMessageText] = useState<string>(
		getModCheckMessage()
	);

	const { isOpen, onOpen, onOpenChange } = useDisclosure();

	const loadKickAuthStatus = () => {
		window.electron.kick
			.getAuthStatus()
			.then((status) => {
				setKickAuthStatus(status);
			})
			.catch((err) => {
				setKickAuthMessage(err.message);
			});
	};

	const loadKickUserInfo = (targetChannelName = channelName) => {
		setKickUserInfoMessage("");
		const normalizedTargetChannelName =
			targetChannelName.trim() || localStorage.getItem("channelName") || "";
		const ownChannelsRequest = window.electron.kick
			.getOwnChannels()
			.then((channelResponse) => {
				const channels = channelResponse?.data || [];
				setOwnChannels(channels);
				return channels;
			})
			.catch(() => {
				setOwnChannels([]);
				return [];
			});

		return window.electron.kick
			.getUsers()
			.then((userResponse) => {
				const user = userResponse?.data?.[0];
				setKickUserInfo(user);

				if (!normalizedTargetChannelName || !user?.user_id) {
					setIsChannelOwner(undefined);
					return ownChannelsRequest;
				}

				return window.electron.kick
					.getChannelBySlug(normalizedTargetChannelName)
					.then((channelResponse) => {
						const channel = channelResponse?.data?.[0];
						setIsChannelOwner(
							channel?.broadcaster_user_id === user.user_id
						);
						return ownChannelsRequest;
					});
			})
			.catch((err) => {
				setKickUserInfo(undefined);
				setIsChannelOwner(undefined);
				setKickUserInfoMessage(err.message || "Kick user info failed.");
			});
	};

	const hasModeratorBadge = useMemo(() => {
		const names = [
			username,
			kickUserInfo?.name,
		]
			.filter((item): item is string => !!item)
			.map((item) => item.toLowerCase());

		if (names.length === 0) {
			return false;
		}

		return messages.messageList.some((message) => {
			if (channelName && message.channelSlug !== channelName) {
				return false;
			}

			const senderName = message.sender?.username?.toLowerCase();
			if (!senderName || !names.includes(senderName)) {
				return false;
			}

			return message.sender.identity?.badges.some(
				(badge) => badge.type.toLowerCase() === "moderator"
			);
		});
	}, [channelName, kickUserInfo?.name, messages.messageList, username]);

	const channelRole = isChannelOwner
		? "Owner"
		: hasModeratorBadge
		? "Moderator"
		: isChannelOwner === false
		? "Viewer"
		: "Unknown";
	const requestedScopes = parseKickScopes(kickAuthStatus?.scopes);
	const grantedScopes = parseKickScopes(
		kickAuthStatus?.grantedScopes,
		kickAuthStatus?.tokenScope,
		kickAuthStatus?.introspection?.data?.scope,
		kickAuthStatus?.introspection?.data?.scopes
	);
	const missingScopes =
		grantedScopes.length > 0
			? requestedScopes.filter((scope) => !grantedScopes.includes(scope))
			: kickAuthStatus?.missingScopes || [];
	const hasModerationScopes =
		grantedScopes.includes("moderation:ban") &&
		grantedScopes.includes("moderation:chat_message:manage");
	const moderationAccess =
		(isChannelOwner || hasModeratorBadge) && hasModerationScopes
			? "Full access"
			: isChannelOwner || hasModeratorBadge
			? "Missing token scopes"
			: "No access";

	useEffect(() => {
		const channelName = localStorage.getItem("channelName");
		const username = localStorage.getItem("username");
		if (username) setUsername(username);
		if (channelName) setChannelName(channelName);
		setChannels(getChannelList());
		setSusUsers(getSuspendedUsers());
		setBlockEmotes(getBlockedEmotes());
		loadKickAuthStatus();
	}, []);

	useEffect(() => {
		if (kickAuthStatus?.isConnected) {
			setIsChannelOwner(undefined);
			loadKickUserInfo(channelName);
		}
	}, [channelName, kickAuthStatus?.isConnected]);

	const expiresAtText = kickAuthStatus?.expiresAt
		? new Date(kickAuthStatus.expiresAt).toLocaleString()
		: "Not connected";

	const saveAndConnectChannel = () => {
		setShowErrorMessage(true);
		const nextChannelName = channelName.trim() || ownChannels[0]?.slug || "";
		const nextUsername = username.trim();

		if (!nextChannelName || !nextUsername) {
			return;
		}

		localStorage.setItem("channelName", nextChannelName);
		setActiveChannelSlug(nextChannelName);
		setChannels(addChannel(nextChannelName));
		localStorage.setItem("username", nextUsername);
		const parsedTimeout = Number(defaultTimeoutText);
		if (Number.isFinite(parsedTimeout) && parsedTimeout > 0) {
			setDefaultTimeoutSeconds(Math.floor(parsedTimeout));
		}
		window.dispatchEvent(new Event("kick-channel-settings-changed"));
		dispatch(chatListener(nextChannelName));
		loadKickUserInfo(nextChannelName);
		toast(`Connecting to ${nextChannelName}`, { type: "info" });
	};

	const selectChannel = (slug: string) => {
		setChannelName(slug);
		setActiveChannelSlug(slug);
		setShowErrorMessage(false);
		window.dispatchEvent(new Event("kick-channel-settings-changed"));
	};

	const addTypedChannel = () => {
		const nextChannelName = channelName.trim();
		if (!nextChannelName) return;
		const nextChannels = addChannel(nextChannelName);
		setChannels(nextChannels);
		setActiveChannelSlug(nextChannelName);
		window.dispatchEvent(new Event("kick-channel-settings-changed"));
		dispatch(chatListener(nextChannelName));
		loadKickUserInfo(nextChannelName);
	};

	const openAddModal = (
		<Modal
			isOpen={isOpen}
			placement="center"
			onOpenChange={() => {
				onOpenChange();
				openModalSusUser && setOpenModalSusUser(false);
				openModalBlockEmote && setOpenModalBlockEmote(false);
			}}
		>
			<ModalContent>
				{(onClose) => (
					<>
						<ModalHeader className="flex flex-col gap-1">
							{openModalSusUser && "Suspended User"}
							{openModalBlockEmote && "Block Emote"}
						</ModalHeader>
						<ModalBody>
							<Input
								size="sm"
								label={openModalSusUser ? "Username" : "Emote name"}
								value={openModalSusUser ? susUser : blockEmote}
								onChange={(val) => {
									openModalSusUser
										? setSusUser(val.target.value)
										: setBlockEmote(val.target.value);
								}}
							/>
						</ModalBody>
						<ModalFooter>
							<Button color="danger" variant="light" onPress={onClose}>
								Close
							</Button>
							<Button
								color="primary"
								onPress={() => {
									onClose();

									if (openModalBlockEmote) {
										const nextBlockEmotes = addBlockedEmote(blockEmote);
										setBlockEmotes(nextBlockEmotes);
										setBlockEmote("");
									}
									if (openModalSusUser) {
										const nextSusUsers = addSuspendedUser(susUser);
										setSusUsers(nextSusUsers);
										setSusUser("");
									}
								}}
							>
								Save
							</Button>
						</ModalFooter>
					</>
				)}
			</ModalContent>
		</Modal>
	);

	return (
		<>
			<div className="settings-grid">
				<div className="settings-column">
					<div className="settings-card">
						<div className="settings-card-title">Channel</div>
						<div className="settings-card-subtitle">
							Chat listener bu kanal ve kullanıcı adıyla bağlanır.
						</div>
						{ownChannels.length > 0 && (
							<div className="settings-channel-picker settings-channel-picker-compact">
								<div className="settings-status-label">My channel</div>
								<div className="settings-channel-buttons">
									{ownChannels.map((channel) => (
										<Button
											key={channel.slug}
											size="sm"
											className="settings-channel-button"
											variant={
												channelName === channel.slug
													? "solid"
													: "flat"
											}
											color="primary"
											onPress={() => selectChannel(channel.slug)}
										>
											{channel.slug}
										</Button>
									))}
								</div>
							</div>
						)}
						{channels.length > 0 && (
							<div className="settings-channel-picker settings-channel-manager">
								<div className="settings-status-label">Channels</div>
								<div className="settings-channel-list">
									{channels.map((channel) => (
										<div key={channel.slug} className="settings-channel-row">
											<Button
												size="sm"
												className="settings-channel-button"
												variant={
													getActiveChannelSlug() === channel.slug
														? "solid"
														: "flat"
												}
												color="primary"
												onPress={() => selectChannel(channel.slug)}
											>
												{channel.slug}
											</Button>
											<Button
												size="sm"
												variant={channel.autoConnect ? "solid" : "flat"}
												onPress={() => {
													setChannels(
														updateChannelAutoConnect(
															channel.slug,
															!channel.autoConnect
														)
													);
												}}
											>
												Auto
											</Button>
											<Button
												size="sm"
												color="danger"
												variant="flat"
												onPress={() => {
													setChannels(removeChannel(channel.slug));
													window.dispatchEvent(
														new Event("kick-channel-settings-changed")
													);
												}}
											>
												Remove
											</Button>
										</div>
									))}
								</div>
							</div>
						)}
						<div className="settings-status-item settings-network-status">
							<span className="settings-status-label">Network</span>
							<span
								className={`settings-status-value connection-status-text connection-status-${connectionStatus}`}
							>
								{connectionStatus}
							</span>
						</div>
						<div className="settings-field">
							<Input
								size="sm"
								labelPlacement="outside"
								label="Channel Name"
								placeholder={
									ownChannels[0]?.slug
										? `Empty uses ${ownChannels[0].slug}`
										: undefined
								}
								value={channelName}
								onChange={(val) => {
									setShowErrorMessage(false);
									setChannelName(val.target.value);
								}}
								errorMessage={
									showErrorMessage &&
									channelName === "" &&
									ownChannels.length === 0
										? "Please fill the channel name"
										: undefined
								}
							/>
						</div>
						<div className="settings-field">
							<Input
								size="sm"
								labelPlacement="outside"
								label="Username"
								value={username}
								onChange={(val) => {
									setShowErrorMessage(false);
									setUsername(val.target.value);
								}}
								errorMessage={
									showErrorMessage && username === ""
										? "Please fill the username"
										: undefined
								}
							/>
						</div>
						<div className="settings-field">
							<Input
								size="sm"
								labelPlacement="outside"
								label="Default Timeout Seconds"
								value={defaultTimeoutText}
								onChange={(val) => {
									setDefaultTimeoutText(val.target.value);
									localStorage.setItem(
										DEFAULT_TIMEOUT_SECONDS_STORAGE_KEY,
										val.target.value
									);
								}}
							/>
						</div>
						<div className="settings-field">
							<Input
								size="sm"
								labelPlacement="outside"
								label="Mod Check Emote / Message"
								placeholder={DEFAULT_MOD_CHECK_MESSAGE}
								value={modCheckMessageText}
								onChange={(val) => {
									setModCheckMessageText(val.target.value);
									const nextValue = setModCheckMessage(val.target.value);
									if (!nextValue) {
										localStorage.removeItem(MOD_CHECK_MESSAGE_STORAGE_KEY);
									}
								}}
							/>
						</div>
						<Button
							size="sm"
							color="primary"
							onPress={saveAndConnectChannel}
						>
							Save & Connect
						</Button>
						<Button size="sm" variant="flat" onPress={addTypedChannel}>
							Add Channel
						</Button>
					</div>
					<div className="settings-card">
						<div className="settings-card-row">
							<div>
								<div className="settings-card-title">Kick Account</div>
								<div className="settings-card-subtitle">
									OAuth bilgileri ayrı güvenli bağlantı penceresinde yönetilir.
								</div>
							</div>
							<Chip
								size="sm"
								color={kickAuthStatus?.isConnected ? "success" : "default"}
							>
								{kickAuthStatus?.isConnected ? "Connected" : "Disconnected"}
							</Chip>
						</div>
						<div className="settings-status-list">
							<div className="settings-status-item">
								<span className="settings-status-label">Client ID</span>
								<span className="settings-status-value">
									{maskSensitive(kickAuthStatus?.clientId)}
								</span>
							</div>
							<div className="settings-status-item">
								<span className="settings-status-label">Expires</span>
								<span className="settings-status-value">{expiresAtText}</span>
							</div>
							<div className="settings-status-item">
								<span className="settings-status-label">Requested Scopes</span>
								<span className="settings-status-value">
									{kickAuthStatus?.scopes?.join(", ") || "-"}
								</span>
							</div>
							<div className="settings-status-item">
								<span className="settings-status-label">Granted Scopes</span>
								<span className="settings-status-value">
									{grantedScopes.join(", ") || "unknown"}
								</span>
							</div>
							{missingScopes.length > 0 && (
								<div className="settings-status-item">
									<span className="settings-status-label">Missing Scopes</span>
									<span className="settings-status-value">
										{missingScopes.join(", ")}
									</span>
								</div>
							)}
							<div className="settings-status-item">
								<span className="settings-status-label">Introspection</span>
								<span className="settings-status-value">
									{kickAuthStatus?.introspection?.data?.active === true
										? "active"
										: kickAuthStatus?.introspection?.data?.active === false
										? "inactive"
										: "unknown"}
								</span>
							</div>
						</div>
						{kickAuthMessage && (
							<div className="settings-message">{kickAuthMessage}</div>
						)}
						<div className="settings-actions">
							<Button
								color="primary"
								onPress={() => window.electron.kickConnectionWindow.open()}
							>
								Manage Connection
							</Button>
							<Button variant="flat" onPress={loadKickAuthStatus}>
								Refresh Status
							</Button>
						</div>
					</div>
					<div className="settings-card">
						<div className="settings-card-title">User Info</div>
						<div className="settings-card-subtitle">
							OAuth kullanıcısı ve girili kanal için rol kontrolü.
						</div>
						<div className="settings-status-list">
							<div className="settings-status-item">
								<span className="settings-status-label">OAuth User</span>
								<span className="settings-status-value">
									{kickUserInfo?.name || "-"}
								</span>
							</div>
							<div className="settings-status-item">
								<span className="settings-status-label">User ID</span>
								<span className="settings-status-value">
									{kickUserInfo?.user_id || "-"}
								</span>
							</div>
							<div className="settings-status-item">
								<span className="settings-status-label">Target Channel</span>
								<span className="settings-status-value">
									{channelName || "-"}
								</span>
							</div>
							<div className="settings-status-item">
								<span className="settings-status-label">Channel Role</span>
								<span className="settings-status-value">{channelRole}</span>
							</div>
							<div className="settings-status-item">
								<span className="settings-status-label">Moderation</span>
								<span className="settings-status-value">
									{moderationAccess}
								</span>
							</div>
							<div className="settings-status-item">
								<span className="settings-status-label">Required Scopes</span>
								<span className="settings-status-value">
									{hasModerationScopes
										? "Granted"
										: "Missing moderation scopes in token"}
								</span>
							</div>
							<div className="settings-status-item">
								<span className="settings-status-label">Moderator Source</span>
								<span className="settings-status-value">
									{isChannelOwner
										? "Owner by API"
										: hasModeratorBadge
										? "Chat badge observed"
										: "Not observed"}
								</span>
							</div>
						</div>
						{kickUserInfoMessage && (
							<div className="settings-message">{kickUserInfoMessage}</div>
						)}
						<div className="settings-actions">
							<Button variant="flat" onPress={() => loadKickUserInfo()}>
								Refresh User Info
							</Button>
						</div>
					</div>
				</div>
				<div className="settings-column">
					<div className="settings-card">
						<div className="moderation-card-header">
							<div>
								<div className="settings-card-title">Blocked Emotes</div>
								<div className="settings-card-subtitle">
									Listedeki emote isimleri chat akışında gizlenir.
								</div>
							</div>
							<Button
								color="secondary"
								size="sm"
								onPress={() => {
									setOpenModalBlockEmote(true);
									onOpen();
								}}
							>
								Add
							</Button>
						</div>
						{blockEmotes.length === 0 ? (
							<div className="moderation-list moderation-empty">No items.</div>
						) : (
							<Listbox aria-label="Blocked emotes" className="moderation-list">
								{blockEmotes.map((item) => {
									return (
										<ListboxItem key={item}>
											<div className="moderation-list-item">
												<div className="moderation-list-text">{item}</div>
												<Button
													size="sm"
													isIconOnly
													color="danger"
													aria-label="Remove blocked emote"
													onClick={() => {
														setBlockEmotes(removeBlockedEmote(item));
													}}
												>
													<FaTrashAlt size={16} />
												</Button>
											</div>
										</ListboxItem>
									);
								})}
							</Listbox>
						)}
					</div>
					<div className="settings-card">
						<div className="moderation-card-header">
							<div>
								<div className="settings-card-title">Suspended Users</div>
								<div className="settings-card-subtitle">
									Bu kullanıcılar chat akışında belirgin şekilde işaretlenir.
								</div>
							</div>
							<Button
								color="secondary"
								size="sm"
								onPress={() => {
									setOpenModalSusUser(true);
									onOpen();
								}}
							>
								Add
							</Button>
						</div>
						{susUsers.length === 0 ? (
							<div className="moderation-list moderation-empty">No items.</div>
						) : (
							<Listbox
								aria-label="Suspended users"
								className="moderation-list"
							>
								{susUsers.map((item) => {
									return (
										<ListboxItem key={item}>
											<div className="moderation-list-item">
												<div className="moderation-list-text">{item}</div>
												<Button
													size="sm"
													isIconOnly
													color="danger"
													aria-label="Remove suspended user"
													onClick={() => {
														setSusUsers(removeSuspendedUser(item));
													}}
												>
													<FaTrashAlt size={16} />
												</Button>
											</div>
										</ListboxItem>
									);
								})}
							</Listbox>
						)}
					</div>
				</div>
			</div>
			{openAddModal}
		</>
	);
};
export default Settings;
