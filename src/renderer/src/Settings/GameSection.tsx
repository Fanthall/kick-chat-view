/**
 * Sprint 61 — Bahis oyunu ayar sekmesi.
 *
 * Rutinler (AutomationSection) ile aynı görsel dili kullanır: set-block /
 * set-block-row / set-input / set-toggle. Yeni bir tasarım dili ICAT EDİLMEZ.
 *
 * Paneldeki simülasyon önizlemesi chatte çalışan `simulate()` fonksiyonunun
 * ta kendisini kullanır — yani gösterilen eğri gerçek davranıştır, temsilî
 * bir çizim değildir. Amaç: kullanıcı slider'ı KÖR ayarlamasın.
 */

import React, {
	FunctionComponent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "react-toastify";

import {
	CURVE_PRESETS,
	CurvePresetId,
	DEFAULT_SIMULATION,
	GameCurveConfig,
	simulate,
} from "../../util/gameEconomy";
import { GameCommandKind } from "../../util/gameCommands";
import {
	GameConfig,
	ReplyMode,
	defaultReply,
	leaderboard,
	loadGameConfig,
	loadSessions,
	resetSession,
	saveGameConfig,
	saveSessions,
} from "../../util/gameStorage";
import { getChannelList } from "../../util/channelSettings";
import { useTranslation } from "../../util/i18n";

// ─── Küçük ortak parçalar ────────────────────────────────────────────────────

const Toggle: FunctionComponent<{
	on: boolean;
	onChange: (v: boolean) => void;
	label: string;
}> = ({ on, onChange, label }) => (
	<button
		type="button"
		role="switch"
		aria-checked={on}
		aria-label={label}
		className="set-toggle"
		onClick={() => onChange(!on)}
	>
		<span className="set-toggle-thumb" />
	</button>
);

const NumberField: FunctionComponent<{
	value: number;
	onChange: (v: number) => void;
	min?: number;
	max?: number;
	step?: number;
	width?: number;
	label: string;
}> = ({ value, onChange, min = 0, max, step = 1, width = 110, label }) => (
	<input
		type="number"
		className="set-input"
		aria-label={label}
		style={{ width, textAlign: "right" }}
		value={Number.isFinite(value) ? value : 0}
		min={min}
		max={max}
		step={step}
		onChange={(e) => {
			const next = Number(e.target.value);
			onChange(Number.isFinite(next) ? next : min);
		}}
	/>
);

/** Etiket + alt açıklama + sağda kontrol — projenin standart ayar satırı. */
const Row: FunctionComponent<{
	title: string;
	sub?: string;
	children: React.ReactNode;
}> = ({ title, sub, children }) => (
	<div className="set-block-row">
		<div className="l">
			<b>{title}</b>
			{sub ? <span>{sub}</span> : null}
		</div>
		{children}
	</div>
);

/**
 * Kart içi açıklama satırı. `set-block-help` sınıfının CSS'te KARŞILIĞI YOK
 * (SettingsModern de onu yalnız inline stille kullanıyor); stil verilmezse
 * metin kartın iç boşluğunun dışına taşıyor.
 */
const Hint: FunctionComponent<{ children: React.ReactNode }> = ({ children }) => (
	<div
		className="set-block-help"
		style={{
			padding: "2px 14px 10px",
			fontSize: "var(--ms-fs-12)",
			color: "var(--ms-fg-3)",
			lineHeight: 1.5,
		}}
	>
		{children}
	</div>
);

const formatPoints = (value: number) => Math.round(value).toLocaleString("tr-TR");

// ─── Simülasyon önizlemesi ───────────────────────────────────────────────────

/** Sabit tohumlu üreteç — panel her render'da aynı eğriyi göstersin (titremesin). */
const seededRng = (seed: number) => {
	let state = seed;
	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
};

interface SparklineProps {
	values: number[];
	baseline: number;
	peakIndex: number;
	label: string;
	baselineLabel: string;
	peakLabel: string;
	/** "{n}. bahis" / "bet {n}" — sıra sayısı dile göre kurulur. */
	betLabelTemplate: string;
	lastBetIndex: number;
}

/**
 * Tek serili alan+çizgi grafiği. Tek seri olduğu için legend yoktur (başlık
 * seriyi zaten adlandırır); yalnız ZİRVE doğrudan etiketlenir, her noktaya
 * sayı basılmaz. Renkler uygulamanın kendi token'larından gelir.
 */
const Sparkline: FunctionComponent<SparklineProps> = ({
	values,
	baseline,
	peakIndex,
	label,
	baselineLabel,
	peakLabel,
	betLabelTemplate,
	lastBetIndex,
}) => {
	const [hover, setHover] = useState<number | undefined>(undefined);
	const betLabel = (n: number) => betLabelTemplate.replace("{n}", String(n));

	/**
	 * viewBox konteyner genişliğiyle ÖLÇÜLEREK kurulur (1 birim = 1 px).
	 * Sabit viewBox denendi ve iki ayrı kusur verdi: (a) sabit height ile SVG
	 * içeriği "meet" davranışıyla ortalayıp daraltıyor, (b) height="auto" ile
	 * yazı boyutu konteyner genişliğine göre büyüyüp gövde metnini aşıyor.
	 * Ölçerek her iki sorun da ortadan kalkar: tam genişlik + sabit tipografi.
	 */
	const wrapRef = useRef<HTMLElement | null>(null);
	const [width, setWidth] = useState(880);

	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return undefined;
		const measure = () => setWidth(Math.max(320, el.clientWidth));
		measure();
		if (typeof ResizeObserver === "undefined") return undefined;
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const W = width;
	const H = 180;
	const PAD_X = 12;
	const PAD_TOP = 20;
	const PAD_BOTTOM = 26;

	// Dar bir dikey alan eğriyi düzleştirir; y aralığı veriye sıkı oturtulur.
	const max = Math.max(...values, baseline) * 1.04;
	const min = Math.min(...values, baseline) * 0.96;
	const span = max - min || 1;

	const x = (i: number) =>
		PAD_X + (i / Math.max(1, values.length - 1)) * (W - PAD_X * 2);
	const y = (v: number) =>
		PAD_TOP + (1 - (v - min) / span) * (H - PAD_TOP - PAD_BOTTOM);

	const linePath = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
	const areaPath = `${linePath} L${x(values.length - 1)},${H - PAD_BOTTOM} L${x(0)},${
		H - PAD_BOTTOM
	} Z`;

	const hoverIndex = hover !== undefined ? hover : undefined;

	return (
		// Çok geniş bir kutuda eğri düzleşip anlamını yitiriyor; en-boy oranı sınırlanır.
		<figure ref={wrapRef} style={{ margin: 0, maxWidth: 760 }}>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				width={W}
				height={H}
				role="img"
				aria-label={label}
				style={{ display: "block", width: "100%", height: H, cursor: "crosshair" }}
				onMouseLeave={() => setHover(undefined)}
				onMouseMove={(e) => {
					const rect = e.currentTarget.getBoundingClientRect();
					const ratio = (e.clientX - rect.left) / rect.width;
					const idx = Math.round(
						((ratio * W - PAD_X) / (W - PAD_X * 2)) * (values.length - 1)
					);
					setHover(Math.min(values.length - 1, Math.max(0, idx)));
				}}
			>
				<defs>
					<linearGradient id="game-sim-fill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="var(--ms-ac-mint)" stopOpacity="0.28" />
						<stop offset="100%" stopColor="var(--ms-ac-mint)" stopOpacity="0.02" />
					</linearGradient>
				</defs>

				{/* Başlangıç puanı referansı — "üstünde mi altında mı" tek bakışta okunur */}
				<line
					x1={PAD_X}
					x2={W - PAD_X}
					y1={y(baseline)}
					y2={y(baseline)}
					stroke="var(--ms-fg-4)"
					strokeWidth="1"
					strokeDasharray="3 4"
				/>
				<text
					x={W - PAD_X}
					y={y(baseline) - 5}
					textAnchor="end"
					fontSize="11"
					fill="var(--ms-fg-2)"
				>
					{baselineLabel} {formatPoints(baseline)}
				</text>

				{/* Eksen uçları — okuyucu yatay eksenin "kaçıncı bahis" olduğunu görsün */}
				<text x={PAD_X} y={H - 8} fontSize="11" fill="var(--ms-fg-3)">
					{betLabel(1)}
				</text>
				<text
					x={W - PAD_X}
					y={H - 8}
					textAnchor="end"
					fontSize="11"
					fill="var(--ms-fg-3)"
				>
					{betLabel(lastBetIndex)}
				</text>

				<path d={areaPath} fill="url(#game-sim-fill)" />
				<path
					d={linePath}
					fill="none"
					stroke="var(--ms-ac-mint)"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>

				{/* Zirve — tek doğrudan etiket */}
				<circle
					cx={x(peakIndex)}
					cy={y(values[peakIndex])}
					r="4"
					fill="var(--ms-ac-mint)"
					stroke="var(--ms-bg-1)"
					strokeWidth="2"
				/>
				<text
					x={x(peakIndex)}
					y={y(values[peakIndex]) - 9}
					textAnchor="middle"
					fontSize="10"
					fill="var(--ms-fg-2)"
				>
					{peakLabel}
				</text>

				{hoverIndex !== undefined && (
					<g>
						<line
							x1={x(hoverIndex)}
							x2={x(hoverIndex)}
							y1={PAD_TOP}
							y2={H - PAD_BOTTOM}
							stroke="var(--ms-fg-4)"
							strokeWidth="1"
						/>
						<circle
							cx={x(hoverIndex)}
							cy={y(values[hoverIndex])}
							r="4"
							fill="var(--ms-bg-1)"
							stroke="var(--ms-ac-mint)"
							strokeWidth="2"
						/>
						<text
							x={Math.min(W - 60, Math.max(40, x(hoverIndex)))}
							y={H - 5}
							textAnchor="middle"
							fontSize="10"
							fill="var(--ms-fg-2)"
						>
							{betLabel(hoverIndex)} · {formatPoints(values[hoverIndex])}
						</text>
					</g>
				)}
			</svg>
		</figure>
	);
};

// ─── Ana bölüm ───────────────────────────────────────────────────────────────

const GameSection: FunctionComponent = () => {
	const { t } = useTranslation();
	const [config, setConfig] = useState<GameConfig>(() => loadGameConfig());
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [sessionTick, setSessionTick] = useState(0);

	const channels = useMemo(() => getChannelList(), []);

	/** Tek yerden kaydet — her değişiklik anında kalıcı olur. */
	const update = (patch: Partial<GameConfig>) => {
		const next = { ...config, ...patch };
		setConfig(next);
		saveGameConfig(next);
	};

	const updateEconomy = (patch: Partial<GameConfig["economy"]>) =>
		update({ economy: { ...config.economy, ...patch } });

	const updateCurve = (patch: Partial<GameCurveConfig>) =>
		update({
			economy: { ...config.economy, curve: { ...config.economy.curve, ...patch } },
		});

	const updateReply = (patch: Partial<GameConfig["reply"]>) =>
		update({ reply: { ...config.reply, ...patch } });

	const updateCommand = (kind: GameCommandKind, patch: { enabled?: boolean; names?: string[] }) =>
		update({
			commands: {
				...config.commands,
				commands: {
					...config.commands.commands,
					[kind]: { ...config.commands.commands[kind], ...patch },
				},
			},
		});

	// Simülasyon: ekonomi değiştikçe otomatik yeniden hesaplanır (≈10 ms).
	const sim = useMemo(
		() => simulate(config.economy, DEFAULT_SIMULATION, seededRng(20260723)),
		[config.economy]
	);

	const peakIndex = useMemo(() => {
		const values = sim.averageBalanceByBet;
		return values.indexOf(Math.max(...values));
	}, [sim]);

	const activePreset = useMemo((): CurvePresetId | undefined => {
		const keys = Object.keys(CURVE_PRESETS) as CurvePresetId[];
		return keys.find(
			(key) =>
				JSON.stringify(CURVE_PRESETS[key]) === JSON.stringify(config.economy.curve)
		);
	}, [config.economy.curve]);

	// Oturum bilgisi — motor yazdıkça tazelenir. `sessionTick` kasıtlı bir yeniden
	// okuma tetiği: loadSessions() localStorage'dan okur, React state'i değil, o
	// yüzden tick olmadan güncellenmez.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const sessions = useMemo(() => loadSessions(), [sessionTick]);
	const activeSlug =
		config.channelSlugs[0] || channels[0]?.slug || "";
	const session = activeSlug ? sessions[activeSlug.toLowerCase()] : undefined;
	const top = session ? leaderboard(session, 5) : [];

	useEffect(() => {
		const refresh = () => setSessionTick((n) => n + 1);
		window.addEventListener("chat-view-game-session-changed", refresh);
		return () =>
			window.removeEventListener("chat-view-game-session-changed", refresh);
	}, []);

	const handleResetSession = () => {
		if (!activeSlug) return;
		if (!window.confirm(t("game.session.reset-confirm"))) return;
		saveSessions(resetSession(loadSessions(), activeSlug, Date.now()));
		setSessionTick((n) => n + 1);
		toast.success(t("game.session.reset-done"));
	};

	const toggleChannel = (slug: string) => {
		const current = config.channelSlugs;
		const next = current.includes(slug)
			? current.filter((s) => s !== slug)
			: [...current, slug];
		update({ channelSlugs: next });
	};

	const commandKinds: GameCommandKind[] = [
		"join",
		"bet",
		"balance",
		"top",
		"help",
		"reset",
	];

	return (
		<div className="set-section">
			<div className="auto-head">
				<div>
					<h2 className="set-section-title">{t("game.title")}</h2>
					<p className="set-section-desc">{t("game.desc")}</p>
				</div>
			</div>

			{/* ── Genel ── */}
			<div className="set-block">
				<div className="set-block-section-label">{t("game.general")}</div>

				<Row title={t("game.enabled")} sub={t("game.enabled-sub")}>
					<Toggle
						on={config.enabled}
						label={t("game.enabled")}
						onChange={(v) => update({ enabled: v })}
					/>
				</Row>

				<Row title={t("game.dryrun")} sub={t("game.dryrun-sub")}>
					<Toggle
						on={config.dryRun}
						label={t("game.dryrun")}
						onChange={(v) => update({ dryRun: v })}
					/>
				</Row>

				<Row title={t("game.require-join")} sub={t("game.require-join-sub")}>
					<Toggle
						on={config.requireJoin}
						label={t("game.require-join")}
						onChange={(v) => update({ requireJoin: v })}
					/>
				</Row>

				<Row title={t("game.live-only")} sub={t("game.live-only-sub")}>
					<Toggle
						on={config.liveOnly}
						label={t("game.live-only")}
						onChange={(v) => update({ liveOnly: v })}
					/>
				</Row>

				<Row title={t("game.channels")} sub={t("game.channels-sub")}>
					<div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
						{channels.length === 0 && (
							<span style={{ color: "var(--ms-fg-3)" }}>{t("game.channels-none")}</span>
						)}
						{channels.map((ch) => {
							const on = config.channelSlugs.includes(ch.slug);
							return (
								<button
									key={ch.slug}
									type="button"
									className={`set-btn${on ? " primary" : ""}`}
									aria-pressed={on}
									onClick={() => toggleChannel(ch.slug)}
								>
									{ch.slug}
								</button>
							);
						})}
					</div>
				</Row>
				{config.channelSlugs.length === 0 && (
					<Hint>{t("game.channels-all")}</Hint>
				)}
			</div>

			{/* ── Ekonomi ── */}
			<div className="set-block">
				<div className="set-block-section-label">{t("game.economy")}</div>

				<Row title={t("game.starting")} sub={t("game.starting-sub")}>
					<NumberField
						label={t("game.starting")}
						value={config.economy.startingBalance}
						min={100}
						step={500}
						onChange={(v) => updateEconomy({ startingBalance: v })}
					/>
				</Row>
				<Row title={t("game.min-bet")}>
					<NumberField
						label={t("game.min-bet")}
						value={config.economy.minBet}
						min={1}
						step={50}
						onChange={(v) => updateEconomy({ minBet: v })}
					/>
				</Row>
				<Row title={t("game.max-bet")} sub={t("game.max-bet-sub")}>
					<NumberField
						label={t("game.max-bet")}
						value={config.economy.maxBet}
						min={0}
						step={500}
						onChange={(v) => updateEconomy({ maxBet: v })}
					/>
				</Row>
				<Row title={t("game.payout")} sub={t("game.payout-sub")}>
					<NumberField
						label={t("game.payout")}
						value={config.economy.payoutMultiplier}
						min={0.1}
						max={5}
						step={0.1}
						width={80}
						onChange={(v) => updateEconomy({ payoutMultiplier: v })}
					/>
				</Row>
				<Row title={t("game.cooldown")} sub={t("game.cooldown-sub")}>
					<NumberField
						label={t("game.cooldown")}
						value={config.economy.cooldownSec}
						min={0}
						step={5}
						width={80}
						onChange={(v) => updateEconomy({ cooldownSec: v })}
					/>
				</Row>
				<Row title={t("game.session-limit")} sub={t("game.session-limit-sub")}>
					<NumberField
						label={t("game.session-limit")}
						value={config.economy.maxBetsPerSession}
						min={0}
						step={1}
						width={80}
						onChange={(v) => updateEconomy({ maxBetsPerSession: v })}
					/>
				</Row>
			</div>

			{/* ── Kazanma eğrisi ── */}
			<div className="set-block">
				<div className="set-block-section-label">{t("game.curve")}</div>
				<Hint>{t("game.curve-desc")}</Hint>

				<Row title={t("game.preset")} sub={t("game.preset-sub")}>
					<div style={{ display: "flex", gap: 6 }}>
						{(Object.keys(CURVE_PRESETS) as CurvePresetId[]).map((key) => (
							<button
								key={key}
								type="button"
								className={`set-btn${activePreset === key ? " primary" : ""}`}
								aria-pressed={activePreset === key}
								onClick={() => updateCurve(CURVE_PRESETS[key])}
							>
								{t(`game.preset.${key}`)}
							</button>
						))}
					</div>
				</Row>

				{/* Simülasyon önizlemesi */}
				<div style={{ padding: "4px 14px 14px" }}>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "baseline",
							marginBottom: 4,
						}}
					>
						<b style={{ fontSize: "var(--ms-fs-13)" }}>{t("game.sim.title")}</b>
						<span style={{ color: "var(--ms-fg-3)", fontSize: "var(--ms-fs-12)" }}>
							{t("game.sim.hint")}
						</span>
					</div>

					<Sparkline
						values={sim.averageBalanceByBet}
						baseline={config.economy.startingBalance}
						peakIndex={peakIndex}
						label={t("game.sim.aria")}
						baselineLabel={t("game.sim.start-line")}
						peakLabel={`${t("game.sim.peak-mark")} ${formatPoints(
							sim.averageBalanceByBet[peakIndex]
						)}`}
						betLabelTemplate={t("game.sim.bet-n")}
						lastBetIndex={DEFAULT_SIMULATION.betsPerPlayer}
					/>

					<div
						style={{
							display: "flex",
							gap: 18,
							flexWrap: "wrap",
							fontSize: "var(--ms-fs-12)",
							color: "var(--ms-fg-2)",
							marginTop: 6,
						}}
					>
						<span>
							{t("game.sim.peak")}: <b>{formatPoints(sim.averagePeak)}</b> (
							{t("game.sim.bet-n").replace("{n}", String(peakIndex))})
						</span>
						<span>
							{t("game.sim.final")}: <b>{formatPoints(sim.finalAverageBalance)}</b>
						</span>
						<span>
							{t("game.sim.profitable")}:{" "}
							<b>{Math.round(sim.profitableShare * 100)}%</b>
						</span>
					</div>
				</div>

				<Row title={t("game.cycle")} sub={t("game.cycle-sub")}>
					<NumberField
						label={t("game.cycle")}
						value={config.economy.luckCycleMinutes}
						min={0}
						step={5}
						width={80}
						onChange={(v) => updateEconomy({ luckCycleMinutes: v })}
					/>
				</Row>

				<Row title={t("game.advanced")} sub={t("game.advanced-sub")}>
					<Toggle
						on={showAdvanced}
						label={t("game.advanced")}
						onChange={setShowAdvanced}
					/>
				</Row>

				{showAdvanced && (
					<>
						<Row title={t("game.curve.base")} sub={t("game.curve.base-sub")}>
							<NumberField
								label={t("game.curve.base")}
								value={config.economy.curve.base}
								min={0.1}
								max={1}
								step={0.01}
								width={80}
								onChange={(v) => updateCurve({ base: v })}
							/>
						</Row>
						<Row title={t("game.curve.hotbets")} sub={t("game.curve.hotbets-sub")}>
							<NumberField
								label={t("game.curve.hotbets")}
								value={config.economy.curve.hotBets}
								min={0}
								step={1}
								width={80}
								onChange={(v) => updateCurve({ hotBets: v })}
							/>
						</Row>
						<Row title={t("game.curve.depthstep")} sub={t("game.curve.depthstep-sub")}>
							<NumberField
								label={t("game.curve.depthstep")}
								value={config.economy.curve.depthStep}
								min={0}
								max={0.5}
								step={0.005}
								width={80}
								onChange={(v) => updateCurve({ depthStep: v })}
							/>
						</Row>
						<Row title={t("game.curve.depthcap")} sub={t("game.curve.depthcap-sub")}>
							<NumberField
								label={t("game.curve.depthcap")}
								value={config.economy.curve.depthCap}
								min={0}
								max={0.8}
								step={0.01}
								width={80}
								onChange={(v) => updateCurve({ depthCap: v })}
							/>
						</Row>
						<Row title={t("game.curve.greedfactor")} sub={t("game.curve.greedfactor-sub")}>
							<NumberField
								label={t("game.curve.greedfactor")}
								value={config.economy.curve.greedFactor}
								min={0}
								max={0.5}
								step={0.01}
								width={80}
								onChange={(v) => updateCurve({ greedFactor: v })}
							/>
						</Row>
						<Row title={t("game.curve.floor")} sub={t("game.curve.floor-sub")}>
							<NumberField
								label={t("game.curve.floor")}
								value={config.economy.curve.floor}
								min={0.05}
								max={0.5}
								step={0.01}
								width={80}
								onChange={(v) => updateCurve({ floor: v })}
							/>
						</Row>
						<Row title={t("game.curve.mercy")} sub={t("game.curve.mercy-sub")}>
							<NumberField
								label={t("game.curve.mercy")}
								value={config.economy.curve.mercyBonus}
								min={0}
								max={0.4}
								step={0.01}
								width={80}
								onChange={(v) => updateCurve({ mercyBonus: v })}
							/>
						</Row>
					</>
				)}
			</div>

			{/* ── Komutlar ── */}
			<div className="set-block">
				<div className="set-block-section-label">{t("game.commands")}</div>

				<Row title={t("game.prefix")} sub={t("game.prefix-sub")}>
					<input
						type="text"
						className="set-input"
						aria-label={t("game.prefix")}
						style={{ width: 60, textAlign: "center" }}
						value={config.commands.prefix}
						maxLength={2}
						onChange={(e) =>
							update({
								commands: { ...config.commands, prefix: e.target.value || "!" },
							})
						}
					/>
				</Row>

				{commandKinds.map((kind) => {
					const spec = config.commands.commands[kind];
					return (
						<Row key={kind} title={t(`game.cmd.${kind}`)} sub={t(`game.cmd.${kind}-sub`)}>
							<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
								<input
									type="text"
									className="set-input"
									aria-label={t("game.cmd.names")}
									style={{ width: 180 }}
									value={spec.names.join(", ")}
									placeholder={t("game.cmd.names-ph")}
									onChange={(e) =>
										updateCommand(kind, {
											names: e.target.value
												.split(",")
												.map((s) => s.trim())
												.filter(Boolean),
										})
									}
								/>
								<Toggle
									on={spec.enabled}
									label={t(`game.cmd.${kind}`)}
									onChange={(v) => updateCommand(kind, { enabled: v })}
								/>
							</div>
						</Row>
					);
				})}
			</div>

			{/* ── Chat cevapları ── */}
			<div className="set-block">
				<div className="set-block-section-label">{t("game.reply")}</div>

				<Row title={t("game.reply.mode")} sub={t("game.reply.mode-sub")}>
					<select
						className="set-input"
						aria-label={t("game.reply.mode")}
						style={{ width: 190 }}
						value={config.reply.mode}
						onChange={(e) => updateReply({ mode: e.target.value as ReplyMode })}
					>
						<option value="batch">{t("game.reply.batch")}</option>
						<option value="each">{t("game.reply.each")}</option>
						<option value="silent">{t("game.reply.silent")}</option>
					</select>
				</Row>

				{config.reply.mode === "batch" && (
					<>
						<Row title={t("game.reply.batch-sec")} sub={t("game.reply.batch-sec-sub")}>
							<NumberField
								label={t("game.reply.batch-sec")}
								value={config.reply.batchSeconds}
								min={2}
								max={120}
								step={1}
								width={80}
								onChange={(v) => updateReply({ batchSeconds: v })}
							/>
						</Row>
						<Row title={t("game.reply.prefix")}>
							<input
								type="text"
								className="set-input"
								aria-label={t("game.reply.prefix")}
								style={{ width: 80, textAlign: "center" }}
								value={config.reply.batchPrefix}
								onChange={(e) => updateReply({ batchPrefix: e.target.value })}
							/>
						</Row>
					</>
				)}

				{config.reply.mode !== "silent" && (
					<>
						<Row title={t("game.reply.win")}>
							<input
								type="text"
								className="set-input"
								aria-label={t("game.reply.win")}
								style={{ width: 320 }}
								value={config.reply.winTemplate}
								onChange={(e) => updateReply({ winTemplate: e.target.value })}
							/>
						</Row>
						<Row title={t("game.reply.loss")}>
							<input
								type="text"
								className="set-input"
								aria-label={t("game.reply.loss")}
								style={{ width: 320 }}
								value={config.reply.lossTemplate}
								onChange={(e) => updateReply({ lossTemplate: e.target.value })}
							/>
						</Row>
						<Row title={t("game.reply.join")}>
							<input
								type="text"
								className="set-input"
								aria-label={t("game.reply.join")}
								style={{ width: 320 }}
								value={config.reply.joinTemplate}
								onChange={(e) => updateReply({ joinTemplate: e.target.value })}
							/>
						</Row>
						<Row title={t("game.reply.cycle")} sub={t("game.reply.cycle-sub")}>
							<input
								type="text"
								className="set-input"
								aria-label={t("game.reply.cycle")}
								style={{ width: 320 }}
								value={config.reply.cycleTemplate}
								onChange={(e) => updateReply({ cycleTemplate: e.target.value })}
							/>
						</Row>
						<Row title={t("game.reply.help")} sub={t("game.reply.help-sub")}>
							<input
								type="text"
								className="set-input"
								aria-label={t("game.reply.help")}
								style={{ width: 320 }}
								value={config.reply.helpTemplate}
								onChange={(e) => updateReply({ helpTemplate: e.target.value })}
							/>
						</Row>
						{/* Şablonlar kullanıcı metnidir; dil değişince otomatik EZİLMEZ.
						    Bu yüzden aktif dilin varsayılanına dönmek için açık bir yol gerekir. */}
						<Row title={t("game.reply.restore")} sub={t("game.reply.restore-sub")}>
							<button
								type="button"
								className="set-btn"
								onClick={() => {
									const fresh = defaultReply();
									updateReply({
										winTemplate: fresh.winTemplate,
										lossTemplate: fresh.lossTemplate,
										balanceTemplate: fresh.balanceTemplate,
										topTemplate: fresh.topTemplate,
										helpTemplate: fresh.helpTemplate,
									});
									toast.success(t("game.reply.restore-done"));
								}}
							>
								{t("game.reply.restore-btn")}
							</button>
						</Row>
						<Hint>{t("game.reply.placeholders")}</Hint>
					</>
				)}
			</div>

			{/* ── Oturum ── */}
			<div className="set-block">
				<div className="set-block-section-label">{t("game.session")}</div>

				{!session && <div className="set-block-empty">{t("game.session.none")}</div>}

				{session && (
					<>
						<Row title={t("game.session.channel")}>
							<span className="set-topic-mono">{session.channelSlug}</span>
						</Row>
						<Row title={t("game.session.players")}>
							<b>{Object.keys(session.players).length}</b>
						</Row>
						<Row title={t("game.session.bets")}>
							<b>{session.totalBets}</b>
						</Row>
						{top.length > 0 && (
							<div style={{ padding: "8px 14px" }}>
								<div
									style={{
										fontSize: "var(--ms-fs-12)",
										color: "var(--ms-fg-3)",
										marginBottom: 4,
									}}
								>
									{t("game.session.leaderboard")}
								</div>
								{top.map((p, i) => (
									<div
										key={p.username}
										style={{
											display: "flex",
											justifyContent: "space-between",
											fontSize: "var(--ms-fs-13)",
											padding: "2px 0",
										}}
									>
										<span>
											{i + 1}. {p.username}
										</span>
										<span className="set-topic-mono">{formatPoints(p.balance)}</span>
									</div>
								))}
							</div>
						)}
					</>
				)}

				<Row title={t("game.session.reset")} sub={t("game.session.reset-sub")}>
					<button
						type="button"
						className="set-btn danger"
						disabled={!session}
						onClick={handleResetSession}
					>
						{t("game.session.reset-btn")}
					</button>
				</Row>
			</div>
		</div>
	);
};

export default GameSection;
