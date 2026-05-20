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
	useRef,
	useState,
} from "react";
import MessageActionsFunc from "../../store/actions/chatMessage";
import { buildUserWindowPayload } from "../../util/userWindowPayload";
import {
	useFanthalDispatch,
	useFanthalSelector,
} from "../../store/hooks/hooks";
import { ActivityItem, ActivityKind, ActivityStatus } from "../../util/chatInterface";
import { getActiveChannelSlug } from "../../util/channelSettings";
import { hasKickScope, parseKickScopes } from "../../util/kickScopes";
import { useTranslation } from "../../util/i18n";
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

// Sprint 48: Süre formatla — saniye girişi, "1 dk 30 sn" / "10 dk" / "2 sa 5 dk".
function fmtDuration(seconds?: number): string {
	if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "-";
	const s = Math.round(seconds);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const parts: string[] = [];
	if (h > 0) parts.push(`${h} sa`);
	if (m > 0) parts.push(`${m} dk`);
	if (sec > 0 && h === 0) parts.push(`${sec} sn`);
	return parts.join(" ");
}

function fmtDate(ts?: number): string {
	if (!ts) return "-";
	// Sprint 48: lokal saat dilimi (toLocaleString) — UTC değil. Kullanıcı TR
	// bölgesinde +3 ile çıkıyor.
	return new Date(ts).toLocaleString("tr-TR", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

// ─── Filter definitions ──────────────────────────────────────────────────────
type FilterId = "all" | "sub" | "gift" | "kicks" | "reward";

const ACT_FILTERS: { id: FilterId; labelKey: string }[] = [
	{ id: "all", labelKey: "activity.filter.all" },
	{ id: "sub", labelKey: "activity.filter.subs" },
	{ id: "gift", labelKey: "activity.filter.gifts" },
	{ id: "kicks", labelKey: "activity.filter.kicks" },
	{ id: "reward", labelKey: "activity.filter.rewards" },
];

const KIND_TO_FILTER: Record<ActivityKind, FilterId> = {
	subscription_new: "sub",
	subscription_renewal: "sub",
	subscription_gift: "gift",
	kicks_gifted: "kicks",
	reward_redemption: "reward",
	host_raid: "all",
	follow: "all",
};

// ─── Icon + accent per kind ──────────────────────────────────────────────────
type AccentCls = "sub" | "gift" | "kicks" | "reward" | "host" | "follow";

const KIND_META: Record<ActivityKind, { iconName: "crown" | "gift" | "bolt" | "coin" | "user" | "heart"; cls: AccentCls }> = {
	subscription_new: { iconName: "crown", cls: "sub" },
	subscription_renewal: { iconName: "crown", cls: "sub" },
	subscription_gift: { iconName: "gift", cls: "gift" },
	kicks_gifted: { iconName: "bolt", cls: "kicks" },
	reward_redemption: { iconName: "coin", cls: "reward" },
	host_raid: { iconName: "user", cls: "host" },
	follow: { iconName: "heart", cls: "follow" },
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
	onOpenUser: (activity: ActivityItem) => void;
}

const ActivityRow: FunctionComponent<ActivityRowProps> = ({
	activity,
	expanded,
	onToggle,
	canManageRewards,
	onRewardAction,
	onOpenUser,
}) => {
	const { t } = useTranslation();
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
	} else if (activity.kind === "follow") {
		lineNode = (
			<>
				<b>{actorName}</b> takip etti
			</>
		);
	} else if (activity.kind === "host_raid") {
		lineNode = (
			<>
				<b>{actorName}</b> raid yaptı
				{activity.amount != null && (
					<>
						{" "}
						— <b className="mono num">{fmtNum(activity.amount)}</b> izleyici
					</>
				)}
			</>
		);
	} else if (activity.kind === "reward_redemption") {
		lineNode = (
			<>
				<b>{actorName}</b> redeemed <b>{activity.title || "a reward"}</b>
			</>
		);
	}

	return (
		<div
			className={`act-row${expanded ? " is-expanded" : ""}`}
			onClick={onToggle}
			onDoubleClick={(e) => {
				e.stopPropagation();
				onOpenUser(activity);
			}}
			role="button"
			tabIndex={0}
			aria-expanded={expanded}
			onKeyDown={(e) => e.key === "Enter" && onToggle()}
			title="Çift tık: kullanıcı detayı"
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
					{/* Sprint 35: human-readable summary at the top so user sees
					    the gist before any technical detail. */}
					<div className="act-summary">
						{activity.kind === "subscription_new" && (
							<>
								<b>{actorName}</b> <b>{months} aylık abonelik</b> aldı.
								{activity.streak != null && activity.streak > 1 ? (
									<> Streak: <b>{activity.streak}</b> ay.</>
								) : null}
							</>
						)}
						{activity.kind === "subscription_renewal" && (
							<>
								<b>{actorName}</b> aboneliğini yeniledi —{" "}
								<b>{months} ay</b>.
								{activity.streak != null && activity.streak > 1 ? (
									<> Streak: <b>{activity.streak}</b> ay.</>
								) : null}
							</>
						)}
						{activity.kind === "subscription_gift" && (
							<>
								<b>{actorName}</b>{" "}
								<b>{activity.amount ?? targetUsernames.length}</b> kişiye{" "}
								hediye abonelik gönderdi
								{targetUsernames.length === 1
									? <> → <b>{targetUsernames[0]}</b>.</>
									: "."}
								{(activity.raw as any)?.tier
									? <> Tier <b>{(activity.raw as any).tier}</b>.</>
									: null}
								{activity.anonymous ? <> (Anonim)</> : null}
							</>
						)}
						{activity.kind === "kicks_gifted" && (
							<>
								<b>{actorName}</b>{" "}
								<b className="mono num">{fmtNum(activity.amount)}</b>{" "}
								KICKs gönderdi
								{activity.giftName ? <> — <b>{activity.giftName}</b></> : null}
								{activity.giftTier != null ? <> (tier {activity.giftTier})</> : null}
								{activity.pinnedTimeSeconds != null
									? <> · <b>{fmtDuration(activity.pinnedTimeSeconds)}</b> sabitlendi.</>
									: "."}
							</>
						)}
						{activity.kind === "host_raid" && (
							<>
								<b>{actorName}</b> kanalına{" "}
								{activity.amount != null ? (
									<>
										<b className="mono num">{fmtNum(activity.amount)}</b>{" "}
										izleyici ile
									</>
								) : null}{" "}
								raid yaptı.
								{activity.message ? (
									<> Mesaj: <i>&ldquo;{activity.message}&rdquo;</i></>
								) : null}
							</>
						)}
						{activity.kind === "follow" && (
							<>
								<b>{actorName}</b> kanalı <b>takip etti</b>.
							</>
						)}
						{activity.kind === "reward_redemption" && (
							<>
								<b>{actorName}</b>{" "}
								<b>{activity.title || "ödülü"}</b> talep etti
								{activity.amount != null
									? <> ({fmtNum(activity.amount)} puan).</>
									: "."}
								{activity.message ? (
									<> Mesaj: <i>&ldquo;{activity.message}&rdquo;</i></>
								) : null}
							</>
						)}
					</div>
					{/* Sprint 48: Tek düzen "Mesaj" kartı — sub/gift/kicks/reward
					    hepsinde kullanıcının yazdığı mesaj varsa burada gösterilir.
					    activity.message veya raw.message/text/user_input. */}
					{(() => {
						const rawAny = activity.raw as any;
						const msg: string | undefined =
							(typeof activity.message === "string" && activity.message) ||
							(typeof rawAny?.message === "string" && rawAny.message) ||
							(typeof rawAny?.text === "string" && rawAny.text) ||
							(typeof rawAny?.user_input === "string" && rawAny.user_input) ||
							undefined;
						if (!msg) return null;
						return (
							<div className="act-message-card">
								<div className="act-kv-k" style={{ marginBottom: 4 }}>
									Mesaj
								</div>
								<div className="act-message-body">
									&ldquo;{msg}&rdquo;
								</div>
							</div>
						);
					})()}
					<div className="act-kv">
						<div className="act-kv-k">Saat</div>
						<div className="act-kv-v">
							{activity.createdAt
								? new Date(activity.createdAt).toLocaleTimeString("tr-TR")
								: "-"}
						</div>
					</div>
					{/* Sprint 48: Gönderen + Hediye satırları kaldırıldı (üstte
					    summary'de zaten yazıyor). KICKs için Sabitlendi süresi
					    fmtDuration ile formatlanıyor. */}
					{activity.kind === "kicks_gifted" &&
						activity.pinnedTimeSeconds != null && (
							<div className="act-kv">
								<div className="act-kv-k">Sabitlendi</div>
								<div className="act-kv-v">
									{fmtDuration(activity.pinnedTimeSeconds)}
								</div>
							</div>
						)}
					{activity.kind === "subscription_gift" && targetUsernames.length > 0 ? (
						<div className="act-kv" style={{ gridTemplateColumns: "90px 1fr" }}>
							<div className="act-kv-k">
								Alıcılar{" "}
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
					{activity.kind === "reward_redemption" &&
						toActivityStatus(activity.status) === "pending" &&
						canManageRewards && (
							<div className="act-reward-actions">
								<button
									type="button"
									className="act-reward-btn accept"
									onClick={(e) => {
										e.stopPropagation();
										onRewardAction(activity, "accepted");
									}}
									aria-label="Accept reward redemption"
								>
									<Icon name="check" size={13} />
									<span>Kabul et</span>
								</button>
								<button
									type="button"
									className="act-reward-btn reject"
									onClick={(e) => {
										e.stopPropagation();
										onRewardAction(activity, "rejected");
									}}
									aria-label="Reject reward redemption"
								>
									<Icon name="x" size={13} />
									<span>Reddet</span>
								</button>
							</div>
						)}
					{/* Sprint 38: Ham JSON dump tamamen kaldırıldı — human-readable
					    özet artık expand'ın üstünde, JSON'a UI ihtiyacı yok. */}
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
			<div className="lb-tabs" role="tablist" aria-label="Leaderboard period">
				{periods.map((p) => (
					<button
						key={p.id}
						role="tab"
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
	/** Sprint 14: true when rendered inside a pop-out BrowserWindow. */
	isPopOut?: boolean;
}

const ActivityViewModern: FunctionComponent<ActivityViewModernProps> = ({ onClose, isPopOut = false }) => {
	const { t } = useTranslation();
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

	// Load token scopes + broadcaster ownership for active channel.
	const [oauthUserId, setOauthUserId] = useState<number | undefined>();
	const [activeBroadcasterId, setActiveBroadcasterId] = useState<
		number | undefined
	>();

	useEffect(() => {
		Promise.all([
			window.electron.kick.getAuthStatus().catch(() => undefined),
			window.electron.kick.getUsers().catch(() => undefined),
		]).then(([authStatus, userRes]: any[]) => {
			setTokenScopes(
				parseKickScopes(
					authStatus?.grantedScopes,
					authStatus?.tokenScope,
					authStatus?.introspection?.data?.scope,
					authStatus?.introspection?.data?.scopes
				)
			);
			setOauthUserId(userRes?.data?.[0]?.user_id);
		});
	}, []);

	useEffect(() => {
		if (!activeChannelSlug) {
			setActiveBroadcasterId(undefined);
			return;
		}
		window.electron.kick
			.getChannelBySlug(activeChannelSlug)
			.then((res: any) =>
				setActiveBroadcasterId(res?.data?.[0]?.broadcaster_user_id)
			)
			.catch(() => setActiveBroadcasterId(undefined));
	}, [activeChannelSlug]);

	const isOwnerOfActiveChannel =
		!!oauthUserId &&
		!!activeBroadcasterId &&
		oauthUserId === activeBroadcasterId;

	// Reward redemption polling (same pattern as classic)
	const canReadRewards =
		hasKickScope(tokenScopes, "channel:rewards:read") ||
		hasKickScope(tokenScopes, "channel:rewards:write");
	// Sprint 50c: yalnız aktif kanalın sahibi + scope sahibi accept/reject
	// görmeli. İzleyici scope sahibi olsa bile başka kanalda yetkili değil.
	const canManageRewards =
		hasKickScope(tokenScopes, "channel:rewards:write") &&
		isOwnerOfActiveChannel;
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
	// Sprint 41: newest-first sort. activityList kronolojik ekleniyor;
	// kullanıcı en son olayı en üstte görsün.
	const filteredEvents = useMemo(() => {
		const base =
			filter === "all"
				? activities
				: activities.filter((a) => KIND_TO_FILTER[a.kind] === filter);
		return base.slice().sort(
			(a, b) => (b.createdAt ?? b.create_at ?? 0) - (a.createdAt ?? a.create_at ?? 0)
		);
	}, [activities, filter]);

	// Sprint 41: yeni event geldiğinde scrollTop=0 (en üstte yeni satır görünür).
	const actListRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (actListRef.current) {
			actListRef.current.scrollTop = 0;
		}
	}, [filteredEvents.length]);

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

	// Sprint 49: Activity row çift tıklayınca kullanıcı detay penceresi açılsın.
	const handleOpenUser = useCallback(
		(activity: ActivityItem) => {
			const username = activity.actor?.username || activity.username;
			if (!username) return;
			try {
				const synthUser = {
					id: activity.actor?.id ?? 0,
					username,
					slug: activity.actor?.slug || username.toLowerCase(),
					identity: { color: "#7c8089", badges: [] },
				};
				const payload = buildUserWindowPayload({
					user: synthUser,
					messages: messages.messageList,
					modActions: messages.modAction,
					openedFrom: "chat",
					channelName: activeChannelSlug || undefined,
					canModerateChannel: false,
				});
				window.electron.userWindow.open(payload);
			} catch (err: any) {
				console.log("Activity → UserWindow open failed", err);
			}
		},
		[messages.messageList, messages.modAction, activeChannelSlug]
	);

	return (
		<div
			className="panel"
			style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
		>
			{/* Panel header */}
			<div className="panel-hd">
				<h2>
					<Icon name="activity" size={14} ariaLabel={t("activity.title")} />
					{t("activity.title")}
					<span className="count num">{filteredEvents.length}</span>
				</h2>
				<div className="panel-hd-actions">
					<button className="icon-btn" title="Refresh" aria-label="Refresh activity" type="button">
						<Icon name="refresh" size={13} />
					</button>
					{!isPopOut && (
						<button
							className="icon-btn"
							title="Open in new window"
							aria-label="Open activity panel in new window"
							type="button"
							onClick={() => {
								window.electron?.panelWindow?.open("activity");
							}}
						>
							<Icon name="popOut" size={13} />
						</button>
					)}
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

			{/* Sprint 38b: "KICKs Sıralama" alt tabı kaldırıldı — Kick UI'da
			    karşılığı olmayan ve kullanıcının ihtiyaç duymadığı bir özellik
			    olduğu için Olaylar sub-tab navigasyonu da gereksiz. Sadece
			    Olaylar listesi kalıyor. */}

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
								{t(f.labelKey)}
								<span className="chip-count num">{counts[f.id] ?? 0}</span>
							</button>
						))}
					</div>

					{/* Event list */}
					<div ref={actListRef} className="act-list scroll" style={{ flex: "1 1 auto", overflowY: "auto" }}>
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
										onOpenUser={handleOpenUser}
									/>
								);
							})
						)}
					</div>
				</>
			)}

		</div>
	);
};

export default ActivityViewModern;
