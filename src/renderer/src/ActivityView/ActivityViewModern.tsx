/**
 * Sprint 4 — ActivityViewModern
 *
 * Modern activity panel with sub-tab strip (Events | KICKs Leaderboard),
 * filter chips, expand drawer, raw JSON inspect, and KICKs leaderboard.
 *
 * Design ref: workspace/prds/chat-view/modern-usage-design/Designs/activity.jsx
 * REQ-5 (KICKs leaderboard), REQ-6 (Activity filter + detail + raw inspect).
 */

import React, {
	FunctionComponent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import MessageActionsFunc from "../../store/actions/chatMessage";
import {
	useFanthalDispatch,
	useFanthalSelector,
} from "../../store/hooks/hooks";
import { ActivityItem, ActivityKind, ActivityStatus } from "../../util/chatInterface";
import { getActiveChannelSlug } from "../../util/channelSettings";
import { hasKickScope, parseKickScopes } from "../../util/kickScopes";
import Icon from "../Component/Icon/Icon";

// ─── Token-aware JSON masker ────────────────────────────────────────────────
const TOKEN_RE = /^[A-Za-z0-9+/._-]{32,}$/;

function maskJsonValue(val: unknown): unknown {
	if (typeof val === "string") {
		return TOKEN_RE.test(val) ? "********" : val;
	}
	if (Array.isArray(val)) {
		return val.map(maskJsonValue);
	}
	if (val !== null && typeof val === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
			out[k] = maskJsonValue(v);
		}
		return out;
	}
	return val;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtNum(n?: number): string {
	if (n == null) return "0";
	return n.toLocaleString();
}

function fmtTime(ts?: number): string {
	if (!ts) return "";
	const diff = Date.now() - ts;
	if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
	return `${Math.floor(diff / 86_400_000)}d`;
}

function fmtDate(ts?: number): string {
	if (!ts) return "-";
	return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

// ─── Filter definitions ──────────────────────────────────────────────────────
type FilterId = "all" | "sub" | "gift" | "kicks" | "reward";

const ACT_FILTERS: { id: FilterId; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "sub", label: "Subs" },
	{ id: "gift", label: "Gifts" },
	{ id: "kicks", label: "KICKs" },
	{ id: "reward", label: "Rewards" },
];

const KIND_TO_FILTER: Record<ActivityKind, FilterId> = {
	subscription_new: "sub",
	subscription_renewal: "sub",
	subscription_gift: "gift",
	kicks_gifted: "kicks",
	reward_redemption: "reward",
};

// ─── Icon + accent per kind ──────────────────────────────────────────────────
type AccentCls = "sub" | "gift" | "kicks" | "reward";

const KIND_META: Record<ActivityKind, { iconName: "crown" | "gift" | "bolt" | "coin"; cls: AccentCls }> = {
	subscription_new: { iconName: "crown", cls: "sub" },
	subscription_renewal: { iconName: "crown", cls: "sub" },
	subscription_gift: { iconName: "gift", cls: "gift" },
	kicks_gifted: { iconName: "bolt", cls: "kicks" },
	reward_redemption: { iconName: "coin", cls: "reward" },
};

const toActivityStatus = (value: unknown): ActivityStatus => {
	if (value === "accepted" || value === "rejected") return value as ActivityStatus;
	return "pending";
};

// ─── ActivityRow ─────────────────────────────────────────────────────────────
interface ActivityRowProps {
	activity: ActivityItem;
	expanded: boolean;
	onToggle: () => void;
	canManageRewards: boolean;
	onRewardAction: (activity: ActivityItem, status: "accepted" | "rejected") => void;
}

const ActivityRow: FunctionComponent<ActivityRowProps> = ({
	activity,
	expanded,
	onToggle,
	canManageRewards,
	onRewardAction,
}) => {
	const [showJson, setShowJson] = useState(false);
	const meta = KIND_META[activity.kind];

	const targetUsernames = useMemo(
		() =>
			activity.targetUsers?.map((u) => u.username).filter(Boolean) ||
			activity.giftedList ||
			[],
		[activity]
	);

	const isBulkGift = activity.kind === "subscription_gift" && (targetUsernames.length > 1 || (activity.amount ?? 0) > 1);
	const months = activity.months ?? 1;

	// Build line text
	const actorName = activity.actor?.username || activity.username || "Anonymous";

	let lineNode: React.ReactNode;
	if (activity.kind === "subscription_new" || activity.kind === "subscription_renewal") {
		lineNode = (
			<>
				<b>{actorName}</b>{" "}
				{activity.kind === "subscription_new" ? "subscribed" : "renewed"} —{" "}
				{months}{months === 1 ? " mo" : " mos"}
				{activity.streak != null && activity.streak >= 6 ? (
					<span className="act-tag" style={{ marginLeft: 6 }}>
						{activity.streak}mo streak
					</span>
				) : null}
			</>
		);
	} else if (activity.kind === "subscription_gift") {
		lineNode = isBulkGift ? (
			<>
				<b>{actorName}</b> gifted <b>{activity.amount ?? targetUsernames.length}</b> subs
			</>
		) : (
			<>
				<b>{actorName}</b> gifted sub to{" "}
				<b>{targetUsernames[0] ?? "someone"}</b>
			</>
		);
	} else if (activity.kind === "kicks_gifted") {
		lineNode = (
			<>
				<b>{actorName}</b> sent{" "}
				<b className="mono num">{fmtNum(activity.amount)}</b> KICKs
				{activity.giftName ? <span> · {activity.giftName}</span> : null}
			</>
		);
	} else if (activity.kind === "reward_redemption") {
		lineNode = (
			<>
				<b>{actorName}</b> redeemed <b>{activity.title || "a reward"}</b>
			</>
		);
	}

	const maskedRaw = useMemo(
		() => JSON.stringify(maskJsonValue(activity.raw as unknown), null, 2),
		[activity.raw]
	);

	return (
		<div
			className={`act-row${expanded ? " is-expanded" : ""}`}
			onClick={onToggle}
			role="button"
			tabIndex={0}
			aria-expanded={expanded}
			onKeyDown={(e) => e.key === "Enter" && onToggle()}
		>
			<div className={`act-icon ${meta.cls}`} aria-hidden="true">
				<Icon name={meta.iconName} size={14} />
			</div>

			<div className="act-body">
				<div className="act-line">{lineNode}</div>
				<div className="act-meta">
					{activity.kind === "subscription_new" && (
						<span
							className="act-tag"
							style={{ color: "var(--ms-ac-sub)", borderColor: "color-mix(in oklch, var(--ms-ac-sub) 30%, var(--ms-bd-2))" }}
						>
							NEW
						</span>
					)}
					{activity.kind === "kicks_gifted" && activity.pinnedTimeSeconds != null && (
						<span className="act-tag">
							<Icon name="pin" size={10} /> pinned {activity.pinnedTimeSeconds}s
						</span>
					)}
					{activity.kind === "reward_redemption" && activity.message && (
						<span style={{ color: "var(--ms-fg-2)", fontStyle: "italic" }}>
							&ldquo;{activity.message.slice(0, 42)}{activity.message.length > 42 ? "…" : ""}&rdquo;
						</span>
					)}
					{activity.kind === "subscription_gift" && isBulkGift && (
						<span className="act-tag">tier {(activity.raw as any)?.tier ?? 1}</span>
					)}
					{activity.expiresAt && activity.kind !== "subscription_new" && activity.kind !== "subscription_renewal" ? null : null}
				</div>
			</div>

			<div className="act-right">
				{activity.kind === "kicks_gifted" && (
					<div className="act-amount kicks num">{fmtNum(activity.amount)}</div>
				)}
				{activity.kind === "subscription_gift" && isBulkGift && (
					<div className="act-amount gift num">×{activity.amount ?? targetUsernames.length}</div>
				)}
				{activity.kind === "reward_redemption" && (
					<>
						<div className="act-amount num">{fmtNum(activity.amount)}</div>
						<div className={`act-status ${toActivityStatus(activity.status)}`}>
							{toActivityStatus(activity.status)}
						</div>
					</>
				)}
				{(activity.kind === "subscription_new" || activity.kind === "subscription_renewal") && (
					<div className="act-amount num" style={{ color: "var(--ms-ac-sub)" }}>
						{months}mo
					</div>
				)}
				<div className="act-time mono num">{fmtTime(activity.createdAt)}</div>
			</div>

			{expanded && (
				<div
					className="act-expand"
					onClick={(ev) => ev.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					<div className="act-kv">
						<div className="act-kv-k">Event ID</div>
						<div className="act-kv-v">{activity.id ?? "-"}</div>
					</div>
					<div className="act-kv">
						<div className="act-kv-k">Actor</div>
						<div className="act-kv-v">
							{actorName}
							{activity.actor?.id ? ` · #${activity.actor.id}` : ""}
						</div>
					</div>
					<div className="act-kv">
						<div className="act-kv-k">Created</div>
						<div className="act-kv-v">{fmtDate(activity.createdAt)}</div>
					</div>
					{activity.expiresAt ? (
						<div className="act-kv">
							<div className="act-kv-k">Expires</div>
							<div className="act-kv-v">{fmtDate(activity.expiresAt)}</div>
						</div>
					) : null}
					{activity.kind === "kicks_gifted" && activity.giftName ? (
						<>
							<div className="act-kv">
								<div className="act-kv-k">Gift</div>
								<div className="act-kv-v">
									{activity.giftName}
									{activity.giftTier != null ? ` · tier ${activity.giftTier}` : ""}
								</div>
							</div>
							{activity.pinnedTimeSeconds != null && (
								<div className="act-kv">
									<div className="act-kv-k">Pinned</div>
									<div className="act-kv-v">{activity.pinnedTimeSeconds}s</div>
								</div>
							)}
						</>
					) : null}
					{activity.kind === "subscription_gift" && targetUsernames.length > 0 ? (
						<div className="act-kv" style={{ gridTemplateColumns: "90px 1fr" }}>
							<div className="act-kv-k">
								Recipients{" "}
								<span style={{ color: "var(--ms-fg-4)" }}>
									({targetUsernames.length})
								</span>
							</div>
							<div className="act-recipients">
								{targetUsernames.map((r) => (
									<span key={r} className="pill">
										{r}
									</span>
								))}
							</div>
						</div>
					) : null}
					{activity.kind === "reward_redemption" && activity.message ? (
						<div className="act-kv">
							<div className="act-kv-k">User input</div>
							<div
								className="act-kv-v"
								style={{ whiteSpace: "normal", fontFamily: "inherit", fontSize: 12 }}
							>
								&ldquo;{activity.message}&rdquo;
							</div>
						</div>
					) : null}
					{activity.kind === "reward_redemption" &&
						toActivityStatus(activity.status) === "pending" &&
						canManageRewards && (
							<div style={{ display: "flex", gap: 6, marginTop: 4 }}>
								<button
									className="btn primary"
									style={{ padding: "5px 10px" }}
									onClick={(e) => {
										e.stopPropagation();
										onRewardAction(activity, "accepted");
									}}
									aria-label="Accept reward redemption"
								>
									<Icon name="check" size={12} /> Accept
								</button>
								<button
									className="btn danger"
									style={{ padding: "5px 10px" }}
									onClick={(e) => {
										e.stopPropagation();
										onRewardAction(activity, "rejected");
									}}
									aria-label="Reject reward redemption"
								>
									<Icon name="x" size={12} /> Reject
								</button>
							</div>
						)}
					<button
						className="act-json-toggle"
						onClick={(e) => {
							e.stopPropagation();
							setShowJson((v) => !v);
						}}
						aria-expanded={showJson}
						aria-label={showJson ? "Hide raw JSON" : "Show raw JSON"}
					>
						<Icon name={showJson ? "chevd" : "chevron"} size={10} />
						{showJson ? "Hide" : "Show"} raw JSON
					</button>
					{showJson && (
						<pre className="act-json">{maskedRaw}</pre>
					)}
				</div>
			)}
		</div>
	);
};

// ─── KICKs Leaderboard ───────────────────────────────────────────────────────
type LbPeriod = "week" | "month" | "lifetime";

interface KicksLeaderboardEntry {
	rank: number;
	username: string;
	gifted_amount: number;
	user_id?: number;
}

interface KicksLeaderboardProps {
	hasScope: boolean;
}

const KicksLeaderboard: FunctionComponent<KicksLeaderboardProps> = ({ hasScope }) => {
	const [period, setPeriod] = useState<LbPeriod>("week");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [data, setData] = useState<Record<LbPeriod, KicksLeaderboardEntry[]>>({
		week: [],
		month: [],
		lifetime: [],
	});
	const [fetched, setFetched] = useState(false);

	const fetchLeaderboard = useCallback(() => {
		if (!hasScope) return;
		setLoading(true);
		setError(null);
		window.electron.kick
			.getKicksLeaderboard(25)
			.then((res: any) => {
				const d = res?.data ?? res ?? {};
				setData({
					week: d.week ?? [],
					month: d.month ?? [],
					lifetime: d.lifetime ?? [],
				});
				setFetched(true);
			})
			.catch((err: unknown) => {
				setError(err instanceof Error ? err.message : "Failed to load leaderboard");
			})
			.finally(() => setLoading(false));
	}, [hasScope]);

	useEffect(() => {
		fetchLeaderboard();
	}, [fetchLeaderboard]);

	if (!hasScope) {
		return (
			<div className="lb-empty" style={{ padding: "24px 16px", textAlign: "center", color: "var(--ms-fg-3)", fontSize: 12 }}>
				<Icon name="bolt" size={24} />
				<div style={{ marginTop: 8, marginBottom: 12 }}>
					KICKs leaderboard requires <code>kicks:read</code> permission.
				</div>
				<div style={{ fontSize: 11, color: "var(--ms-fg-4)" }}>
					Connect with KICKs permission in Settings → Permissions.
				</div>
			</div>
		);
	}

	const periods: { id: LbPeriod; label: string }[] = [
		{ id: "week", label: "Week" },
		{ id: "month", label: "Month" },
		{ id: "lifetime", label: "Lifetime" },
	];

	const rows = data[period];

	return (
		<div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
			<div className="lb-tabs">
				{periods.map((p) => (
					<button
						key={p.id}
						className={`lb-tab${period === p.id ? " is-active" : ""}`}
						onClick={() => setPeriod(p.id)}
						aria-selected={period === p.id}
					>
						{p.label}
					</button>
				))}
				<div style={{ flex: 1 }} />
				<button
					className="icon-btn"
					onClick={fetchLeaderboard}
					aria-label="Refresh leaderboard"
					title="Refresh"
					style={{ width: 26, height: 26 }}
				>
					<Icon name="refresh" size={12} />
				</button>
			</div>

			{loading && (
				<div className="lb-list scroll" style={{ flex: 1 }}>
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="lb-row lb-skeleton" style={{ opacity: 0.35 + i * 0.1 }}>
							<div className="lb-rank">#{i + 1}</div>
							<div className="lb-user">
								<div
									style={{
										height: 10,
										background: "var(--ms-bg-3)",
										borderRadius: 4,
										width: `${60 + i * 10}px`,
									}}
								/>
							</div>
							<div className="lb-amount">—</div>
						</div>
					))}
				</div>
			)}

			{!loading && error && (
				<div
					style={{
						padding: "16px",
						color: "var(--ms-ac-warn)",
						fontSize: 12,
						display: "flex",
						flexDirection: "column",
						gap: 8,
						alignItems: "flex-start",
					}}
				>
					<span>
						<Icon name="warn" size={13} /> {error}
					</span>
					<button className="btn ghost" onClick={fetchLeaderboard}>
						<Icon name="refresh" size={12} /> Retry
					</button>
				</div>
			)}

			{!loading && !error && fetched && rows.length === 0 && (
				<div
					style={{
						flex: 1,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						color: "var(--ms-fg-3)",
						fontSize: 12,
						gap: 8,
						padding: 24,
					}}
				>
					<Icon name="bolt" size={22} />
					<span>No KICKs activity yet</span>
				</div>
			)}

			{!loading && !error && rows.length > 0 && (
				<div className="lb-list scroll" style={{ flex: 1 }}>
					{rows.map((entry, idx) => (
						<div key={entry.user_id ?? entry.username ?? idx} className="lb-row">
							<div className="lb-rank">#{entry.rank ?? idx + 1}</div>
							<div className="lb-user">
								<span className="lb-username">{entry.username}</span>
							</div>
							<div className="lb-amount num">{fmtNum(entry.gifted_amount)}</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

// ─── Main component ───────────────────────────────────────────────────────────
type SubTab = "events" | "leaderboard";

interface ActivityViewModernProps {
	onClose?: () => void;
}

const ActivityViewModern: FunctionComponent<ActivityViewModernProps> = ({ onClose }) => {
	const dispatch = useFanthalDispatch();
	const messages = useFanthalSelector((state) => state.messages);
	const [filter, setFilter] = useState<FilterId>("all");
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [subTab, setSubTab] = useState<SubTab>("events");
	const [tokenScopes, setTokenScopes] = useState<string[]>([]);

	const activeChannelSlug = getActiveChannelSlug();

	const activities = useMemo(
		() =>
			messages.activityList.filter(
				(item) => !activeChannelSlug || item.channelSlug === activeChannelSlug
			),
		[messages.activityList, activeChannelSlug]
	);

	// Load token scopes (same pattern as classic ActivityView)
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

	// Reward redemption polling (same pattern as classic)
	const canReadRewards =
		hasKickScope(tokenScopes, "channel:rewards:read") ||
		hasKickScope(tokenScopes, "channel:rewards:write");
	const canManageRewards = hasKickScope(tokenScopes, "channel:rewards:write");
	const hasKicksScope = hasKickScope(tokenScopes, "kicks:read");

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
				// Best-effort; activity still renders.
			});
	}, [activeChannelSlug, canReadRewards, dispatch]);

	// Count chips
	const counts = useMemo(() => {
		const c: Record<string, number> = { all: activities.length };
		for (const a of activities) {
			const fid = KIND_TO_FILTER[a.kind];
			c[fid] = (c[fid] ?? 0) + 1;
		}
		return c;
	}, [activities]);

	// Filtered events
	const filteredEvents = useMemo(() => {
		if (filter === "all") return activities;
		return activities.filter((a) => KIND_TO_FILTER[a.kind] === filter);
	}, [activities, filter]);

	const handleRewardAction = useCallback(
		(activity: ActivityItem, status: "accepted" | "rejected") => {
			if (!activity.id) return;
			const task =
				status === "accepted"
					? window.electron.kick.acceptChannelRewardRedemptions([activity.id])
					: window.electron.kick.rejectChannelRewardRedemptions([activity.id]);
			task.then(() => {
				dispatch(MessageActionsFunc.setActivityStatus(activity.id!, status));
			});
		},
		[dispatch]
	);

	const handleToggle = useCallback(
		(id: string | undefined) => {
			const key = id ?? "no-id";
			setExpandedId((cur) => (cur === key ? null : key));
		},
		[]
	);

	return (
		<div
			className="panel"
			style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
		>
			{/* Panel header */}
			<div className="panel-hd">
				<h2>
					<Icon name="activity" size={14} ariaLabel="Activity" />
					Activity
					<span className="count num">{filteredEvents.length}</span>
				</h2>
				<div className="panel-hd-actions">
					<button className="icon-btn" title="Refresh" aria-label="Refresh activity" type="button">
						<Icon name="refresh" size={13} />
					</button>
					{onClose && (
						<button
							className="icon-btn"
							onClick={onClose}
							title="Collapse"
							aria-label="Collapse activity panel"
							type="button"
						>
							<Icon name="x" size={13} />
						</button>
					)}
				</div>
			</div>

			{/* Sub-tab strip: Events | KICKs Leaderboard */}
			<div className="act-subtab-strip">
				<button
					className={`act-subtab${subTab === "events" ? " is-active" : ""}`}
					onClick={() => setSubTab("events")}
					aria-selected={subTab === "events"}
				>
					Events
				</button>
				<button
					className={`act-subtab${subTab === "leaderboard" ? " is-active" : ""}`}
					onClick={() => setSubTab("leaderboard")}
					aria-selected={subTab === "leaderboard"}
				>
					<Icon name="bolt" size={11} />
					KICKs Leaderboard
				</button>
			</div>

			{subTab === "events" && (
				<>
					{/* Filter chip row */}
					<div className="filter-row">
						{ACT_FILTERS.map((f) => (
							<button
								key={f.id}
								className={`chip${filter === f.id ? " is-active" : ""}`}
								onClick={() => setFilter(f.id)}
								aria-pressed={filter === f.id}
							>
								{f.label}
								<span className="chip-count num">{counts[f.id] ?? 0}</span>
							</button>
						))}
					</div>

					{/* Event list */}
					<div className="act-list scroll" style={{ flex: "1 1 auto", overflowY: "auto" }}>
						{filteredEvents.length === 0 ? (
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									justifyContent: "center",
									flex: 1,
									padding: "32px 16px",
									color: "var(--ms-fg-3)",
									fontSize: 12,
									gap: 10,
								}}
							>
								<Icon name="activity" size={22} />
								<span>No {filter === "all" ? "" : filter + " "}events</span>
								{filter !== "all" && (
									<button className="btn ghost" onClick={() => setFilter("all")}>
										Clear filter
									</button>
								)}
							</div>
						) : (
							filteredEvents.map((activity) => {
								const key =
									activity.id ||
									`${activity.kind}-${activity.actor?.username}-${activity.createdAt}`;
								return (
									<ActivityRow
										key={key}
										activity={activity}
										expanded={expandedId === key}
										onToggle={() => handleToggle(activity.id || key)}
										canManageRewards={canManageRewards}
										onRewardAction={handleRewardAction}
									/>
								);
							})
						)}
					</div>
				</>
			)}

			{subTab === "leaderboard" && (
				<div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
					<KicksLeaderboard hasScope={hasKicksScope} />
				</div>
			)}
		</div>
	);
};

export default ActivityViewModern;
