/**
 * Sprint 58 — Otomasyon rutinleri editörü (UI sadeleştirme rev).
 *
 * Liste / ekle / sil / düzenle / aç-kapa. Quick templates ile hızlı oluştur.
 * Storage: chatViewAutomationRules localStorage anahtarı.
 */

import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
	ChannelRule,
	RuleAction,
	RuleRepeat,
	RuleTrigger,
	createBlankRule,
	defaultRepeat,
} from "../../util/automationRules";
import {
	deleteAutomationRule,
	loadAutomationRules,
	upsertAutomationRule,
} from "../../util/automationRulesStorage";
import { getChannelList } from "../../util/channelSettings";
// Sprint 58c/58d: contentEditable emote render — ortak EmoteEditable component
import { buildEmoteIndex, EmoteIndex } from "../../util/emoteIndex";
import { useFanthalSelector } from "../../store/hooks/hooks";
import { useTranslation } from "../../util/i18n";
import EmoteEditable from "./EmoteEditable";

type TFn = (key: string) => string;

const PLACEHOLDERS: { key: string; hintKey: string }[] = [
	{ key: "{username}", hintKey: "automation.ph.username" },
	{ key: "{amount}", hintKey: "automation.ph.amount" },
	{ key: "{months}", hintKey: "automation.ph.months" },
	{ key: "{tier}", hintKey: "automation.ph.tier" },
	{ key: "{message}", hintKey: "automation.ph.message" },
	{ key: "{channel}", hintKey: "automation.ph.channel" },
	{ key: "{reward}", hintKey: "automation.ph.reward" },
];

const TRIGGER_OPTIONS: RuleTrigger["type"][] = [
	"chat_match",
	"mention",
	"sub_event",
	"gift_sub_event",
	"follow_event",
	"kicks_event",
	"host_event",
	"reward_redeemed",
	"interval",
];

const INTERVAL_PRESETS: { labelKey: string; minutes: number }[] = [
	{ labelKey: "automation.interval-preset.15m", minutes: 15 },
	{ labelKey: "automation.interval-preset.30m", minutes: 30 },
	{ labelKey: "automation.interval-preset.1h", minutes: 60 },
	{ labelKey: "automation.interval-preset.2h", minutes: 120 },
];

const ACTION_OPTIONS: RuleAction["type"][] = ["send_message", "send_toast"];

// ─── Quick templates ────────────────────────────────────────────────────────

interface Template {
	id: string;
	label: string;
	emoji: string;
	build: () => ChannelRule;
}

const buildTemplates = (t: TFn): Template[] => [
	{
		id: "sub-thanks",
		label: t("automation.tpl.sub-thanks.label"),
		emoji: "🎉",
		build: () => ({
			...createBlankRule(),
			name: t("automation.tpl.sub-thanks.name"),
			trigger: { type: "sub_event" },
			action: {
				type: "send_message",
				content: t("automation.tpl.sub-thanks.content"),
			},
			cooldownSec: 5,
		}),
	},
	{
		id: "follow-hello",
		label: t("automation.tpl.follow.label"),
		emoji: "👋",
		build: () => ({
			...createBlankRule(),
			name: t("automation.tpl.follow.name"),
			trigger: { type: "follow_event" },
			action: {
				type: "send_message",
				content: t("automation.tpl.follow.content"),
			},
			cooldownSec: 60,
		}),
	},
	{
		id: "mention-reply",
		label: t("automation.tpl.mention.label"),
		emoji: "💬",
		build: () => ({
			...createBlankRule(),
			name: t("automation.tpl.mention.name"),
			trigger: { type: "mention" },
			action: {
				type: "send_message",
				content: t("automation.tpl.mention.content"),
			},
			cooldownSec: 30,
		}),
	},
	{
		id: "keyword-discord",
		label: t("automation.tpl.discord.label"),
		emoji: "🔗",
		build: () => ({
			...createBlankRule(),
			name: t("automation.tpl.discord.name"),
			trigger: {
				type: "chat_match",
				pattern: "^!discord$",
				isRegex: true,
				caseInsensitive: true,
			},
			action: {
				type: "send_message",
				content: t("automation.tpl.discord.content"),
			},
			cooldownSec: 15,
		}),
	},
	{
		id: "interval-reminder",
		label: t("automation.tpl.interval.label"),
		emoji: "⏰",
		build: () => ({
			...createBlankRule(),
			name: t("automation.tpl.interval.name"),
			trigger: {
				type: "interval",
				intervalMinutes: 30,
				liveOnly: true,
				fireImmediately: false,
			},
			action: {
				type: "send_message",
				content: t("automation.tpl.interval.content"),
			},
			cooldownSec: 0,
		}),
	},
];

// ─── Channel chip selector ──────────────────────────────────────────────────

interface ChannelChipsProps {
	available: { slug: string }[];
	selected: string[];
	onChange: (next: string[]) => void;
	t: TFn;
}

const ChannelChips: FunctionComponent<ChannelChipsProps> = ({
	available,
	selected,
	onChange,
	t,
}) => {
	if (available.length === 0) {
		return (
			<div className="auto-empty-hint">
				{t("automation.channels-empty")}
			</div>
		);
	}
	const toggle = (slug: string) => {
		const lower = slug.toLowerCase();
		const exists = selected.some((s) => s.toLowerCase() === lower);
		onChange(
			exists
				? selected.filter((s) => s.toLowerCase() !== lower)
				: [...selected, slug]
		);
	};
	const allActive = selected.length === 0;
	return (
		<div className="auto-chip-row">
			<button
				type="button"
				className={`auto-chip ${allActive ? "is-on" : ""}`}
				onClick={() => onChange([])}
				title={t("automation.all-channels-tip")}
			>
				{t("automation.all-channels")}
			</button>
			{available.map((c) => {
				const on = selected.some(
					(s) => s.toLowerCase() === c.slug.toLowerCase()
				);
				return (
					<button
						key={c.slug}
						type="button"
						className={`auto-chip ${on ? "is-on" : ""}`}
						onClick={() => toggle(c.slug)}
					>
						{c.slug}
					</button>
				);
			})}
		</div>
	);
};

// ─── Rule row (list item) ───────────────────────────────────────────────────

interface RuleRowProps {
	rule: ChannelRule;
	onEdit: () => void;
	onToggle: (next: boolean) => void;
	onDelete: () => void;
	t: TFn;
}

const RuleRow: FunctionComponent<RuleRowProps> = ({
	rule,
	onEdit,
	onToggle,
	onDelete,
	t,
}) => {
	const scopeLabel =
		rule.channelSlugs.length === 0
			? t("automation.all-channels")
			: rule.channelSlugs.join(", ");
	return (
		<div className={`auto-row ${rule.enabled ? "" : "is-off"}`}>
			<button
				type="button"
				role="switch"
				aria-checked={rule.enabled}
				className="set-toggle auto-row-toggle"
				onClick={() => onToggle(!rule.enabled)}
				title={rule.enabled ? t("automation.active") : t("automation.passive")}
			>
				<span className="set-toggle-thumb" />
			</button>
			<div className="auto-row-body">
				<div className="auto-row-title">
					{rule.name || t("automation.unnamed")}
				</div>
				<div className="auto-row-summary">
					<span className="auto-pill">
						{t(`automation.trigger.${rule.trigger.type}`)}
					</span>
					<span className="auto-arrow">→</span>
					<span className="auto-pill auto-pill-action">
						{t(`automation.action.${rule.action.type}`)}
					</span>
					<span className="auto-pill auto-pill-muted">{scopeLabel}</span>
					<span
						className="auto-pill auto-pill-muted"
						title={t("automation.cooldown-tip")}
					>
						{rule.cooldownSec}
						{t("automation.wait-suffix")}
					</span>
				</div>
			</div>
			<div className="auto-row-actions">
				<button
					type="button"
					className="set-btn"
					onClick={onEdit}
					data-testid={`rule-edit-${rule.id}`}
				>
					{t("automation.edit")}
				</button>
				<button
					type="button"
					className="set-btn danger"
					onClick={onDelete}
					data-testid={`rule-delete-${rule.id}`}
				>
					{t("automation.delete")}
				</button>
			</div>
		</div>
	);
};

// ─── Editor ─────────────────────────────────────────────────────────────────

interface EditorProps {
	rule: ChannelRule;
	onChange: (next: ChannelRule) => void;
	onSave: () => void;
	onCancel: () => void;
}

const RuleEditor: FunctionComponent<EditorProps> = ({
	rule,
	onChange,
	onSave,
	onCancel,
}) => {
	const { t } = useTranslation();
	const channels = useMemo(() => getChannelList(), []);

	// Sprint 58c: tüm bağlanılan kanalların emote'larını birleştir — automation
	// rule global da olabileceği için kanal-bağımsız index hazırlanır.
	const messages = useFanthalSelector((s) => s.messages);
	const allEmoteSets = useMemo(() => {
		const seen = new Set<string>();
		const result: any[] = [];
		const pushUnique = (set: any) => {
			const key = `${set.provider}:${set.id || set.name}`;
			if (seen.has(key)) return;
			seen.add(key);
			result.push(set);
		};
		for (const slug of Object.keys(messages.emoteSetsByChannel || {})) {
			for (const set of messages.emoteSetsByChannel[slug] || []) {
				pushUnique(set);
			}
		}
		return result;
	}, [messages.emoteSetsByChannel]);
	const emoteIndex: EmoteIndex = useMemo(
		() => buildEmoteIndex(allEmoteSets, messages.globalEmoteSets || [], ""),
		[allEmoteSets, messages.globalEmoteSets]
	);

	const writeContent = (next: string) => {
		onChange({
			...rule,
			action: { ...rule.action, content: next } as any,
		});
	};

	// FIX-GIFT (2026-07-04): send_message için çok-mesaj / kademeli tekrar kontrolleri.
	const currentRepeat: RuleRepeat | undefined =
		rule.action.type === "send_message" ? rule.action.repeat : undefined;
	const setRepeat = (repeat: RuleRepeat | undefined) => {
		onChange({ ...rule, action: { ...rule.action, repeat } as any });
	};
	const patchRepeat = (patch: Partial<RuleRepeat>) => {
		if (!currentRepeat) return;
		setRepeat({ ...currentRepeat, ...patch });
	};
	const setTier = (idx: number, field: "minAmount" | "count", val: number) => {
		if (!currentRepeat) return;
		patchRepeat({
			tiers: currentRepeat.tiers.map((t, i) =>
				i === idx ? { ...t, [field]: val } : t
			),
		});
	};
	const addTier = () => {
		if (!currentRepeat) return;
		patchRepeat({ tiers: [...currentRepeat.tiers, { minAmount: 1, count: 1 }] });
	};
	const removeTier = (idx: number) => {
		if (!currentRepeat) return;
		patchRepeat({ tiers: currentRepeat.tiers.filter((_, i) => i !== idx) });
	};

	const setTriggerType = (next: RuleTrigger["type"]) => {
		let trigger: RuleTrigger;
		switch (next) {
			case "chat_match":
				trigger = { type: "chat_match", pattern: "", caseInsensitive: true };
				break;
			case "mention":
				trigger = { type: "mention", usernames: [] };
				break;
			case "kicks_event":
				trigger = { type: "kicks_event", minAmount: 0 };
				break;
			case "reward_redeemed":
				trigger = { type: "reward_redeemed", rewardTitle: "" };
				break;
			case "sub_event":
				trigger = {
					type: "sub_event",
					includeGifted: false,
					subType: "any",
				};
				break;
			case "interval":
				trigger = {
					type: "interval",
					intervalMinutes: 30,
					liveOnly: true,
					fireImmediately: false,
				};
				break;
			default:
				trigger = { type: next } as RuleTrigger;
		}
		onChange({ ...rule, trigger });
	};

	const setActionType = (next: RuleAction["type"]) => {
		onChange({
			...rule,
			action: { type: next, content: rule.action.content || "" },
		});
	};

	// Placeholder chip insert — content sonuna text ekle.
	// EmoteEditable kendi useEffect'i ile DOM'u sync edecek.
	const insertToken = (token: string) => {
		const current = rule.action.content || "";
		writeContent(current ? `${current}${token}` : token);
	};

	return (
		<div className="auto-editor">
			{/* Üst satır: Ad + Cooldown + Toggle */}
			<div className="auto-editor-top">
				<input
					type="text"
					className="set-input auto-input-name"
					value={rule.name}
					onChange={(e) => onChange({ ...rule, name: e.target.value })}
					placeholder={t("automation.name-placeholder")}
					data-testid="rule-name-input"
				/>
				<div
					className="auto-cooldown"
					title={t("automation.editor-cooldown-tip")}
				>
					<label htmlFor="cd">{t("automation.cooldown-label")}</label>
					<input
						id="cd"
						type="number"
						min={0}
						className="set-input auto-input-cd"
						value={rule.cooldownSec}
						onChange={(e) =>
							onChange({
								...rule,
								cooldownSec: Math.max(0, parseInt(e.target.value, 10) || 0),
							})
						}
					/>
					<span className="auto-cd-unit">{t("automation.unit-sec")}</span>
				</div>
			</div>
			<div className="auto-cd-hint">
				{t("automation.cd-hint-1")} <strong>{rule.cooldownSec}{t("automation.unit-sec")}</strong>{" "}
				{t("automation.cd-hint-2")} {rule.cooldownSec === 0 && (
					<span style={{ color: "#fbbf24" }}>
						{t("automation.cd-hint-zero")}
					</span>
				)}
			</div>

			{/* Kanal seçimi (chip-row) */}
			<div className="auto-field">
				<div className="auto-field-label">{t("automation.field.channels")}</div>
				<ChannelChips
					available={channels}
					selected={rule.channelSlugs}
					onChange={(next) => onChange({ ...rule, channelSlugs: next })}
					t={t}
				/>
			</div>

			{/* Trigger + Action select satırı */}
			<div className="auto-grid-2">
				<div className="auto-field">
					<div className="auto-field-label">{t("automation.field.trigger")}</div>
					<select
						className="set-input auto-select"
						value={rule.trigger.type}
						onChange={(e) =>
							setTriggerType(e.target.value as RuleTrigger["type"])
						}
						data-testid="rule-trigger-select"
					>
						{TRIGGER_OPTIONS.map((opt) => (
							<option key={opt} value={opt}>
								{t(`automation.trigger.${opt}`)}
							</option>
						))}
					</select>
				</div>
				<div className="auto-field">
					<div className="auto-field-label">{t("automation.field.action")}</div>
					<select
						className="set-input auto-select"
						value={rule.action.type}
						onChange={(e) =>
							setActionType(e.target.value as RuleAction["type"])
						}
					>
						{ACTION_OPTIONS.map((a) => (
							<option key={a} value={a}>
								{t(`automation.action.${a}`)}
							</option>
						))}
					</select>
				</div>
			</div>

			{/* Trigger detayları (sadece gerektiğinde) */}
			{rule.trigger.type === "chat_match" && (
				<div className="auto-field auto-detail">
					<div className="auto-field-label">{t("automation.field.match-text")}</div>
					<EmoteEditable
						value={rule.trigger.pattern}
						onChange={(next) =>
							onChange({
								...rule,
								trigger: { ...rule.trigger, pattern: next } as any,
							})
						}
						emoteIndex={emoteIndex}
						placeholder={t("automation.match-placeholder")}
						singleLine
						pickerButtonLabel={t("automation.emote-btn")}
					/>
					<div className="auto-checks">
						<label className="auto-check">
							<input
								type="checkbox"
								checked={!!rule.trigger.caseInsensitive}
								onChange={(e) =>
									onChange({
										...rule,
										trigger: {
											...rule.trigger,
											caseInsensitive: e.target.checked,
										} as any,
									})
								}
							/>
							{t("automation.case-insensitive")}
						</label>
						<label className="auto-check">
							<input
								type="checkbox"
								checked={!!rule.trigger.isRegex}
								onChange={(e) =>
									onChange({
										...rule,
										trigger: {
											...rule.trigger,
											isRegex: e.target.checked,
										} as any,
									})
								}
							/>
							{t("automation.regex")}
						</label>
					</div>
				</div>
			)}
			{rule.trigger.type === "mention" && (
				<div className="auto-field auto-detail">
					<div className="auto-field-label">
						{t("automation.field.which-mention")}
					</div>
					<input
						type="text"
						className="set-input"
						value={(rule.trigger.usernames || []).join(", ")}
						onChange={(e) =>
							onChange({
								...rule,
								trigger: {
									type: "mention",
									usernames: e.target.value
										.split(",")
										.map((s) => s.trim())
										.filter(Boolean),
								},
							})
						}
						placeholder={t("automation.mention-placeholder")}
					/>
				</div>
			)}
			{rule.trigger.type === "kicks_event" && (
				<div className="auto-field auto-detail">
					<div className="auto-field-label">{t("automation.field.min-kicks")}</div>
					<input
						type="number"
						min={0}
						className="set-input auto-input-cd"
						value={rule.trigger.minAmount || 0}
						onChange={(e) =>
							onChange({
								...rule,
								trigger: {
									type: "kicks_event",
									minAmount: Math.max(0, parseInt(e.target.value, 10) || 0),
								},
							})
						}
					/>
				</div>
			)}
			{rule.trigger.type === "sub_event" && (
				<div className="auto-field auto-detail">
					{/* FIX-3: Yeni / Yenileme / Hepsi alt-seçimi (kullanıcı kararı). */}
					<div className="auto-field-label">{t("automation.field.sub-type")}</div>
					<div className="auto-chip-row">
						{(
							[
								{ id: "new", label: t("automation.sub.new") },
								{ id: "renewal", label: t("automation.sub.renewal") },
								{ id: "any", label: t("automation.sub.any") },
							] as { id: "new" | "renewal" | "any"; label: string }[]
						).map((opt) => {
							const current =
								(rule.trigger.type === "sub_event" &&
									rule.trigger.subType) ||
								"any";
							const on = current === opt.id;
							return (
								<button
									key={opt.id}
									type="button"
									className={`auto-chip ${on ? "is-on" : ""}`}
									onClick={() =>
										onChange({
											...rule,
											trigger: {
												type: "sub_event",
												includeGifted:
													rule.trigger.type === "sub_event"
														? rule.trigger.includeGifted
														: false,
												subType: opt.id,
											},
										})
									}
								>
									{opt.label}
								</button>
							);
						})}
					</div>
					<div className="auto-cd-hint" style={{ marginTop: 4 }}>
						{t("automation.sub-hint")}
					</div>
					<div className="auto-field-label" style={{ marginTop: 10 }}>
						{t("automation.gift-sub-behavior")}
					</div>
					<label className="auto-check">
						<input
							type="checkbox"
							checked={!!rule.trigger.includeGifted}
							onChange={(e) =>
								onChange({
									...rule,
									trigger: {
										type: "sub_event",
										includeGifted: e.target.checked,
										// FIX-3: subType'i koru (üzerine yazma).
										subType:
											rule.trigger.type === "sub_event"
												? rule.trigger.subType ?? "any"
												: "any",
									},
								})
							}
						/>
						{t("automation.gift-sub-toggle")}
					</label>
					<div className="auto-cd-hint" style={{ marginTop: 4 }}>
						{rule.trigger.includeGifted
							? t("automation.gift-sub-on")
							: t("automation.gift-sub-off")}
					</div>
				</div>
			)}
			{rule.trigger.type === "interval" && (
				<div className="auto-field auto-detail">
					<div className="auto-field-label">{t("automation.field.frequency")}</div>
					<div className="auto-chip-row">
						{INTERVAL_PRESETS.map((p) => {
							const on = rule.trigger.type === "interval" && rule.trigger.intervalMinutes === p.minutes;
							return (
								<button
									key={p.minutes}
									type="button"
									className={`auto-chip ${on ? "is-on" : ""}`}
									onClick={() =>
										onChange({
											...rule,
											trigger: {
												...(rule.trigger as any),
												intervalMinutes: p.minutes,
											},
										})
									}
								>
									{t(p.labelKey)}
								</button>
							);
						})}
						<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
							<input
								type="number"
								min={1}
								max={1440}
								className="set-input auto-input-cd"
								style={{ width: 70 }}
								value={rule.trigger.intervalMinutes}
								onChange={(e) =>
									onChange({
										...rule,
										trigger: {
											...(rule.trigger as any),
											intervalMinutes: Math.max(
												1,
												parseInt(e.target.value, 10) || 1
											),
										},
									})
								}
							/>
							<span className="auto-cd-unit">{t("automation.unit-min")}</span>
						</span>
					</div>
					<div className="auto-checks" style={{ marginTop: 10 }}>
						<label className="auto-check">
							<input
								type="checkbox"
								checked={rule.trigger.liveOnly !== false}
								onChange={(e) =>
									onChange({
										...rule,
										trigger: {
											...(rule.trigger as any),
											liveOnly: e.target.checked,
										},
									})
								}
							/>
							{t("automation.live-only")}
						</label>
						<label className="auto-check">
							<input
								type="checkbox"
								checked={!!rule.trigger.fireImmediately}
								onChange={(e) =>
									onChange({
										...rule,
										trigger: {
											...(rule.trigger as any),
											fireImmediately: e.target.checked,
										},
									})
								}
							/>
							{t("automation.fire-immediately")}
						</label>
					</div>
					<div className="auto-cd-hint" style={{ marginTop: 6 }}>
						{(rule.trigger.liveOnly !== false
							? t("automation.interval.live-hint")
							: t("automation.interval.always-hint")
						).replace("{min}", String(rule.trigger.intervalMinutes))}
					</div>
					{rule.channelSlugs.length === 0 && (
						<div
							className="auto-cd-hint"
							style={{ marginTop: 6, color: "#fbbf24" }}
						>
							{t("automation.interval.needs-channel")}
						</div>
					)}
				</div>
			)}
			{rule.trigger.type === "reward_redeemed" && (
				<div className="auto-field auto-detail">
					<div className="auto-field-label">{t("automation.field.reward-title")}</div>
					<input
						type="text"
						className="set-input"
						value={rule.trigger.rewardTitle || ""}
						onChange={(e) =>
							onChange({
								...rule,
								trigger: {
									type: "reward_redeemed",
									rewardTitle: e.target.value,
								},
							})
						}
						placeholder={t("automation.field.reward-title-placeholder")}
					/>
				</div>
			)}

			{/* Mesaj içeriği — Sprint 58c/58d: EmoteEditable */}
			<div className="auto-field">
				<div className="auto-field-label">
					{rule.action.type === "send_message"
						? t("automation.field.msg-to-send")
						: t("automation.field.toast-text")}
				</div>
				<EmoteEditable
					value={rule.action.content}
					onChange={(next) => writeContent(next)}
					emoteIndex={emoteIndex}
					placeholder={
						rule.trigger.type === "sub_event"
							? t("automation.msg-placeholder-thanks")
							: t("automation.msg-placeholder-hi")
					}
					className="auto-textarea"
				/>
				<div className="auto-placeholder-row">
					{PLACEHOLDERS.map((p) => (
						<button
							key={p.key}
							type="button"
							className="auto-chip auto-chip-ph"
							title={t(p.hintKey)}
							onClick={() => insertToken(p.key)}
						>
							{p.key}
						</button>
					))}
				</div>
			</div>

			{/* FIX-GIFT: Çok-mesaj / kademeli tekrar — yalnız send_message. */}
			{rule.action.type === "send_message" && (
				<div className="auto-field">
					<div className="auto-field-label">{t("automation.multi.title")}</div>
					<label
						style={{
							display: "flex",
							gap: 8,
							alignItems: "flex-start",
							fontSize: 12,
							cursor: "pointer",
						}}
					>
						<input
							type="checkbox"
							checked={!!currentRepeat}
							onChange={(e) =>
								setRepeat(e.target.checked ? defaultRepeat() : undefined)
							}
						/>
						<span style={{ color: "var(--ms-fg-3, #8a8f97)" }}>
							{t("automation.multi.toggle-hint-1")} {currentRepeat?.maxCount ?? 5} {t("automation.multi.toggle-hint-2")}
						</span>
					</label>

					{currentRepeat && (
						<div
							style={{
								marginTop: 10,
								display: "flex",
								flexDirection: "column",
								gap: 10,
							}}
						>
							<div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
								<label
									style={{
										display: "flex",
										flexDirection: "column",
										gap: 4,
										fontSize: 12,
									}}
								>
									{t("automation.multi.delay")}
									<input
										type="number"
										min={0}
										className="set-input"
										style={{ width: 90 }}
										value={currentRepeat.delaySec}
										onChange={(e) =>
											patchRepeat({
												delaySec: Math.max(0, Number(e.target.value) || 0),
											})
										}
									/>
								</label>
								<label
									style={{
										display: "flex",
										flexDirection: "column",
										gap: 4,
										fontSize: 12,
									}}
								>
									{t("automation.multi.cap")}
									<input
										type="number"
										min={1}
										max={20}
										className="set-input"
										style={{ width: 90 }}
										value={currentRepeat.maxCount}
										onChange={(e) =>
											patchRepeat({
												maxCount: Math.max(1, Number(e.target.value) || 1),
											})
										}
									/>
								</label>
							</div>

							<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
								<div
									style={{
										display: "grid",
										gridTemplateColumns: "1fr 1fr 32px",
										gap: 8,
										fontSize: 11,
										color: "var(--ms-fg-3, #8a8f97)",
									}}
								>
									<span>{t("automation.multi.tier-min")}</span>
									<span>{t("automation.multi.tier-count")}</span>
									<span />
								</div>
								{currentRepeat.tiers.map((tier, idx) => (
									<div
										key={idx}
										style={{
											display: "grid",
											gridTemplateColumns: "1fr 1fr 32px",
											gap: 8,
											alignItems: "center",
										}}
									>
										<input
											type="number"
											min={1}
											className="set-input"
											value={tier.minAmount}
											onChange={(e) =>
												setTier(
													idx,
													"minAmount",
													Math.max(1, Number(e.target.value) || 1)
												)
											}
										/>
										<input
											type="number"
											min={1}
											className="set-input"
											value={tier.count}
											onChange={(e) =>
												setTier(
													idx,
													"count",
													Math.max(1, Number(e.target.value) || 1)
												)
											}
										/>
										<button
											type="button"
											className="auto-chip"
											title={t("automation.multi.remove-tier")}
											onClick={() => removeTier(idx)}
										>
											✕
										</button>
									</div>
								))}
								<button
									type="button"
									className="set-btn"
									style={{ alignSelf: "flex-start" }}
									onClick={addTier}
								>
									{t("automation.multi.add-tier")}
								</button>
							</div>

							<div style={{ fontSize: 11, color: "var(--ms-fg-4, #606870)" }}>
								{t("automation.multi.example")}
							</div>
						</div>
					)}
				</div>
			)}

			{/* Footer */}
			<div className="auto-editor-footer">
				<button
					type="button"
					className="set-btn primary"
					onClick={onSave}
					data-testid="rule-save-btn"
				>
					{t("automation.save")}
				</button>
				<button type="button" className="set-btn" onClick={onCancel}>
					{t("automation.cancel")}
				</button>
			</div>
		</div>
	);
};

// ─── Main section ────────────────────────────────────────────────────────────

const AutomationSection: FunctionComponent = () => {
	const { t } = useTranslation();
	const templates = useMemo(() => buildTemplates(t), [t]);
	const [rules, setRules] = useState<ChannelRule[]>(() => loadAutomationRules());
	const [editing, setEditing] = useState<ChannelRule | null>(null);

	useEffect(() => {
		const handler = () => setRules(loadAutomationRules());
		window.addEventListener("chat-view-automation-rules-changed", handler);
		window.addEventListener("storage", handler);
		return () => {
			window.removeEventListener(
				"chat-view-automation-rules-changed",
				handler
			);
			window.removeEventListener("storage", handler);
		};
	}, []);

	const startNew = () => setEditing(createBlankRule());
	const startFromTemplate = (tpl: Template) => setEditing(tpl.build());

	const saveEditing = () => {
		if (!editing) return;
		if (!editing.name.trim()) {
			toast(t("automation.toast.name-required"), { type: "warning" });
			return;
		}
		if (
			editing.action.type === "send_message" &&
			!editing.action.content.trim()
		) {
			toast(t("automation.toast.content-required"), { type: "warning" });
			return;
		}
		// Sprint 60: interval rule için en az 1 kanal zorunlu
		if (
			editing.trigger.type === "interval" &&
			editing.channelSlugs.length === 0
		) {
			toast(t("automation.toast.channel-required"), { type: "warning" });
			return;
		}
		upsertAutomationRule(editing);
		setRules(loadAutomationRules());
		setEditing(null);
		toast.success(t("automation.toast.saved"));
	};

	const toggleRule = (id: string, next: boolean) => {
		const r = rules.find((x) => x.id === id);
		if (!r) return;
		upsertAutomationRule({ ...r, enabled: next });
		setRules(loadAutomationRules());
	};

	const removeRule = (id: string) => {
		if (!window.confirm(t("automation.confirm.delete"))) return;
		deleteAutomationRule(id);
		setRules(loadAutomationRules());
	};

	return (
		<div className="set-section auto-section">
			<div className="auto-head">
				<div>
					<h2 className="set-section-title">{t("automation.title")}</h2>
					<p className="set-section-desc">
						{t("automation.desc")}
					</p>
				</div>
				<button
					type="button"
					className="set-btn primary"
					onClick={startNew}
					data-testid="rule-new-btn"
				>
					{t("automation.new-rule")}
				</button>
			</div>

			{!editing && (
				<div className="auto-templates">
					<div className="auto-templates-label">{t("automation.quick-templates")}</div>
					<div className="auto-templates-row">
						{templates.map((tpl) => (
							<button
								key={tpl.id}
								type="button"
								className="auto-template-btn"
								onClick={() => startFromTemplate(tpl)}
								title={`"${tpl.label}" ${t("automation.template-start")}`}
							>
								<span className="auto-template-emoji">{tpl.emoji}</span>
								<span>{tpl.label}</span>
							</button>
						))}
					</div>
				</div>
			)}

			{editing && (
				<RuleEditor
					rule={editing}
					onChange={(next) => setEditing(next)}
					onSave={saveEditing}
					onCancel={() => setEditing(null)}
				/>
			)}

			<div className="auto-list">
				{rules.length === 0 && !editing ? (
					<div className="auto-list-empty">
						{t("automation.empty")}{" "}
						<strong>{t("automation.new-rule")}</strong> {t("automation.empty-start")}
					</div>
				) : (
					rules.map((r) => (
						<RuleRow
							key={r.id}
							rule={r}
							onEdit={() => setEditing(r)}
							onToggle={(next) => toggleRule(r.id, next)}
							onDelete={() => removeRule(r.id)}
							t={t}
						/>
					))
				)}
			</div>
		</div>
	);
};

export default AutomationSection;
