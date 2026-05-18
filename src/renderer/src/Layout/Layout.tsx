import { Button } from "@nextui-org/react";
import React, {
	FunctionComponent,
	ReactNode,
	useEffect,
	useMemo,
	useState,
} from "react";
import { IoSettings } from "react-icons/io5";
import {
	MdEdit,
	MdGavel,
	MdKeyboardDoubleArrowLeft,
	MdOutlineLocalActivity,
} from "react-icons/md";
import { getChannelData } from "../../services/kick";
import MessageActionsFunc from "../../store/actions/chatMessage";
import {
	useFanthalDispatch,
	useFanthalSelector,
} from "../../store/hooks/hooks";
import { chatListener } from "../../util/chatConnection";
import {
	ChatViewChannel,
	getActiveChannelSlug,
	getChannelList,
	setActiveChannelSlug,
} from "../../util/channelSettings";
import { hasKickScope, parseKickScopes } from "../../util/kickScopes";
import ActivityView from "../ActivityView/ActivityView";
import Chat from "../Chat/Chat";
import ModActions from "../ModActions/ModActions";
import Settings from "../Settings/Settings";
import StreamEditModal from "./StreamEditModal";

enum Screens {
	Settings,
	Chat,
}

type PanelKey = "activity" | "moderation";

type PanelLayoutPreference = Record<PanelKey, boolean>;

const PANEL_LAYOUT_STORAGE_KEY = "chatViewPanelLayout";

const defaultPanelLayoutPreference: PanelLayoutPreference = {
	activity: false,
	moderation: false,
};

const DashboardSidePanel: FunctionComponent<{
	title: string;
	collapsed: boolean;
	compactOpen: boolean;
	onToggle: () => void;
	children: ReactNode;
}> = ({ title, collapsed, compactOpen, onToggle, children }) => {
	return (
		<div
			className={`dashboard-panel side-panel ${
				collapsed ? "side-panel-collapsed" : ""
			} ${compactOpen ? "side-panel-compact-open" : ""}`}
		>
			{(!collapsed || compactOpen) && (
				<div className="side-panel-content">
					<Button
						size="sm"
						isIconOnly
						variant="light"
						className="side-panel-collapse-button"
						aria-label={`Collapse ${title}`}
						onPress={onToggle}
					>
						<MdKeyboardDoubleArrowLeft size={18} />
					</Button>
					{children}
				</div>
			)}
		</div>
	);
};

const Layout: FunctionComponent = () => {
	const dispatch = useFanthalDispatch();
	const messages = useFanthalSelector((state) => state.messages);
	const [channelName, setChannelName] = useState<string>("");
	const [channels, setChannels] = useState<ChatViewChannel[]>([]);
	const [appUsername, setAppUsername] = useState<string>("");
	const [streamTitle, setStreamTitle] = useState<string>("Not live");
	const [streamCategory, setStreamCategory] = useState<string>("");
	const [oauthUserId, setOauthUserId] = useState<number | undefined>();
	const [oauthScopes, setOauthScopes] = useState<string[]>([]);
	const [streamEditOpen, setStreamEditOpen] = useState(false);
	const [screen, setScreen] = useState<Screens>(Screens.Chat);
	const [compactPanel, setCompactPanel] = useState<PanelKey | undefined>();
	const [isCompactLayout, setIsCompactLayout] = useState<boolean>(false);
	const [panelLayout, setPanelLayout] = useState<PanelLayoutPreference>(
		defaultPanelLayoutPreference
	);
	const connectionStatus =
		(channelName && messages.connectionStatusByChannel[channelName]) ||
		messages.connectionStatus;
	const isDisconnected = connectionStatus === "disconnected";

	const streamMeta = channelName
		? messages.streamMetaByChannel[channelName]
		: undefined;
	const isChannelOwner =
		!!oauthUserId &&
		!!streamMeta?.broadcasterUserId &&
		streamMeta.broadcasterUserId === oauthUserId;
	const canEditStream =
		isChannelOwner && hasKickScope(oauthScopes, "channel:write");
	const appUserRole = useMemo(() => {
		if (!appUsername) {
			return "unknown";
		}

		const ownMessage = messages.messageList
			.slice()
			.reverse()
			.find(
				(message) =>
					(!channelName || message.channelSlug === channelName) &&
					message.sender?.username?.toLowerCase() ===
					appUsername.toLowerCase()
			);

		if (!ownMessage) {
			return "unknown";
		}

		const isModerator = ownMessage.sender.identity?.badges.some(
			(badge) => badge.type.toLowerCase() === "moderator"
		);

		return isModerator ? "moderator" : "viewer";
	}, [appUsername, messages.messageList, channelName]);

	useEffect(() => {
		const loadOauth = () => {
			Promise.all([
				window.electron.kick.getUsers().catch(() => undefined),
				window.electron.kick.getAuthStatus().catch(() => undefined),
			]).then(([userResponse, authStatus]) => {
				setOauthUserId(userResponse?.data?.[0]?.user_id);
				setOauthScopes(
					parseKickScopes(
						authStatus?.grantedScopes,
						authStatus?.tokenScope,
						authStatus?.introspection?.data?.scope,
						authStatus?.introspection?.data?.scopes
					)
				);
			});
		};
		loadOauth();
		window.addEventListener("kick-channel-settings-changed", loadOauth);
		return () => {
			window.removeEventListener("kick-channel-settings-changed", loadOauth);
		};
	}, []);

	useEffect(() => {
		const savedPanelLayout = localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY);
		if (!savedPanelLayout) return;

		try {
			const parsedLayout = JSON.parse(savedPanelLayout) as Partial<
				PanelLayoutPreference & { subscriptions: boolean }
			>;
			setPanelLayout({
				...defaultPanelLayoutPreference,
				...parsedLayout,
				activity: parsedLayout.activity ?? parsedLayout.subscriptions ?? false,
			});
		} catch {
			setPanelLayout(defaultPanelLayoutPreference);
		}
	}, []);

	useEffect(() => {
		const syncCompactLayout = () => {
			const compact = window.innerWidth <= 1260;
			setIsCompactLayout(compact);
			if (!compact) {
				setCompactPanel(undefined);
			}
		};

		syncCompactLayout();
		window.addEventListener("resize", syncCompactLayout);
		return () => {
			window.removeEventListener("resize", syncCompactLayout);
		};
	}, []);

	const togglePanel = (key: PanelKey) => {
		if (isCompactLayout) {
			setCompactPanel((prev) => (prev === key ? undefined : key));
			return;
		}

		setPanelLayout((prev) => {
			const next = {
				...prev,
				[key]: !prev[key],
			};
			localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(next));
			return next;
		});
	};

	const shouldShowTopbarPanelButton = (key: PanelKey) =>
		isCompactLayout || panelLayout[key];

	const shouldRenderPanel = (key: PanelKey) => {
		if (isCompactLayout) {
			return compactPanel === key;
		}

		return !panelLayout[key];
	};

	useEffect(() => {
		const channelName = getActiveChannelSlug();
		const username = localStorage.getItem("username");
		if (channelName) setChannelName(channelName);
		if (username) setAppUsername(username);
		setChannels(getChannelList());
		const localSettingsChanged = () => {
			const nextChannelName = getActiveChannelSlug();
			const nextUsername = localStorage.getItem("username");
			setChannelName(nextChannelName || "");
			setAppUsername(nextUsername || "");
			setChannels(getChannelList());
		};
		window.addEventListener(
			"kick-channel-settings-changed",
			localSettingsChanged
		);
		return () => {
			window.removeEventListener(
				"kick-channel-settings-changed",
				localSettingsChanged
			);
		};
	}, []);
	useEffect(() => {
		const handleOffline = () => {
				dispatch(MessageActionsFunc.setConnectionStatus("disconnected", channelName));
		};
		const handleOnline = () => {
			const nextChannelName = localStorage.getItem("channelName")?.trim();
			if (nextChannelName) {
				dispatch(chatListener(nextChannelName));
			} else {
				dispatch(MessageActionsFunc.setConnectionStatus("idle", channelName));
			}
		};

		if (!navigator.onLine) {
			handleOffline();
		}

		window.addEventListener("offline", handleOffline);
		window.addEventListener("online", handleOnline);
		return () => {
			window.removeEventListener("offline", handleOffline);
			window.removeEventListener("online", handleOnline);
		};
	}, [dispatch, channelName]);
	useEffect(() => {
		if (channelName === "") return;
		const loadChannelInfo = () => {
			getChannelData(channelName)
				.then((res) => {
					if (res.data.livestream) {
						setStreamTitle(res.data["livestream"].session_title);
						setStreamCategory(res.data["livestream"].categories[0].name);
					} else {
						setStreamTitle("Not live");
						setStreamCategory("");
					}
				})
				.catch(() => {
					dispatch(
						MessageActionsFunc.setConnectionStatus(
							"disconnected",
							channelName
						)
					);
				});
		};
		loadChannelInfo();
		const interval = setInterval(loadChannelInfo, 60000);
		return () => {
			clearInterval(interval);
		};
	}, [channelName, dispatch]);
	return (
		<div className="app-shell">
			<div className="app-topbar">
				<div className="stream-summary">
					<div
						className={`stream-status-dot stream-status-${connectionStatus}`}
					/>
					<div className="stream-copy">
						<div className="stream-title">
							{isDisconnected
								? "Disconnected"
								: screen === Screens.Chat
								? streamTitle
								: "Settings"}
						</div>
						<div className="stream-subtitle">
							{isDisconnected
								? "Network or Kick connection lost"
								: screen === Screens.Chat
								? `${streamCategory || channelName || "No channel selected"}${
										appUserRole === "moderator"
											? " - Moderator"
											: appUserRole === "unknown"
											? " - Role unknown"
											: ""
								  }`
								: "Kick account, channel and moderation preferences"}
						</div>
					</div>
				</div>
				<div className="topbar-actions">
					{screen === Screens.Chat && canEditStream && (
						<Button
							size="sm"
							isIconOnly
							variant="light"
							className="topbar-panel-button"
							aria-label="Yayın bilgilerini düzenle"
							title="Başlık ve kategoriyi düzenle"
							onPress={() => setStreamEditOpen(true)}
						>
							<MdEdit size={20} />
						</Button>
					)}
					{screen === Screens.Chat &&
						shouldShowTopbarPanelButton("activity") && (
							<Button
								size="sm"
								isIconOnly
								variant="light"
								className={`topbar-panel-button ${
									compactPanel === "activity" ? "active" : ""
								}`}
								aria-label="Activity"
								onPress={() => togglePanel("activity")}
							>
								<MdOutlineLocalActivity size={21} />
							</Button>
						)}
					{screen === Screens.Chat &&
						shouldShowTopbarPanelButton("moderation") && (
							<Button
								size="sm"
								isIconOnly
								variant="light"
								className={`topbar-panel-button ${
									compactPanel === "moderation" ? "active" : ""
								}`}
								aria-label="Moderation"
								onPress={() => togglePanel("moderation")}
							>
								<MdGavel size={21} />
							</Button>
						)}
					<Button
						size="sm"
						variant="light"
						className="settings-button"
						onPress={() => {
							setScreen(
								Screens.Settings === screen
									? Screens.Chat
									: Screens.Settings
							);
						}}
					>
						<IoSettings size={22} />
					</Button>
				</div>
			</div>
			{channels.length > 0 && (
				<div className="channel-tabs">
					{channels.map((channel) => (
						<Button
							key={channel.slug}
							size="sm"
							className="channel-tab-button"
							variant={channel.slug === channelName ? "solid" : "flat"}
							color={channel.slug === channelName ? "primary" : "default"}
							onPress={() => {
								setActiveChannelSlug(channel.slug);
								setChannelName(channel.slug);
								window.dispatchEvent(
									new Event("kick-channel-settings-changed")
								);
								dispatch(chatListener(channel.slug));
							}}
						>
							{channel.slug}
						</Button>
					))}
					<Button
						size="sm"
						variant="light"
						className="channel-tab-add"
						onPress={() => setScreen(Screens.Settings)}
					>
						+ Add
					</Button>
				</div>
			)}
			{screen === Screens.Chat && (
				<div
					className={`chat-dashboard-grid ${
						panelLayout.activity ? "activity-collapsed" : ""
					} ${panelLayout.moderation ? "moderation-collapsed" : ""}`}
				>
					<div className="dashboard-panel chat-panel">
						<Chat />
					</div>
					{shouldRenderPanel("activity") && (
						<DashboardSidePanel
							title="Activity"
							collapsed={panelLayout.activity}
							compactOpen={
								isCompactLayout && compactPanel === "activity"
							}
							onToggle={() => togglePanel("activity")}
						>
							<ActivityView />
						</DashboardSidePanel>
					)}
					{shouldRenderPanel("moderation") && (
						<DashboardSidePanel
							title="Moderation"
							collapsed={panelLayout.moderation}
							compactOpen={
								isCompactLayout && compactPanel === "moderation"
							}
							onToggle={() => togglePanel("moderation")}
						>
							<ModActions />
						</DashboardSidePanel>
					)}
				</div>
			)}
			{screen === Screens.Settings && (
				<div className="settings-stage">
					<div className="settings-panel">
						<Settings />
					</div>
				</div>
			)}
			{channelName && (
				<StreamEditModal
					isOpen={streamEditOpen}
					onClose={() => setStreamEditOpen(false)}
					channelSlug={channelName}
					meta={streamMeta}
				/>
			)}
		</div>
	);
};
export default Layout;
