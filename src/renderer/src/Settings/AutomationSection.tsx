/**
 * Sprint 58 — Otomasyon rutinleri editörü (UI sadeleştirme rev).
 *
 * Liste / ekle / sil / düzenle / aç-kapa. Quick templates ile hızlı oluştur.
 * Storage: chatViewAutomationRules localStorage anahtarı.
 */

import React, { FunctionComponent, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
	ACTION_LABELS,
	ChannelRule,
	RuleAction,
	RuleTrigger,
	TRIGGER_LABELS,
	createBlankRule,
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
import EmoteEditable from "./EmoteEditable";

const PLACEHOLDERS: { key: string; hint: string }[] = [
	{ key: "{username}", hint: "Olayı tetikleyen kullanıcı" },
	{ key: "{amount}", hint: "KICKs / sub sayısı" },
	{ key: "{months}", hint: "Abonelik ay sayısı" },
	{ key: "{tier}", hint: "Sub tier (varsa)" },
	{ key: "{message}", hint: "Chat mesajı" },
	{ key: "{channel}", hint: "Kanal slug" },
	{ key: "{reward}", hint: "Reward başlığı" },
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

const INTERVAL_PRESETS: { label: string; minutes: number }[] = [
	{ label: "15 dk", minutes: 15 },
	{ label: "30 dk", minutes: 30 },
	{ label: "1 saat", minutes: 60 },
	{ label: "2 saat", minutes: 120 },
];

const ACTION_OPTIONS: RuleAction["type"][] = ["send_message", "send_toast"];

// ─── Quick templates ────────────────────────────────────────────────────────

interface Template {
	id: string;
	label: string;
	emoji: string;
	build: () => ChannelRule;
}

const TEMPLATES: Template[] = [
	{
		id: "sub-thanks",
		label: "Sub'a teşekkür",
		emoji: "🎉",
		build: () => ({
			...createBlankRule(),
			name: "Sub'a teşekkür",
			trigger: { type: "sub_event" },
			action: {
				type: "send_message",
				content: "Teşekkürler {username}! Abonelik için sevgiler 💚",
			},
			cooldownSec: 5,
		}),
	},
	{
		id: "follow-hello",
		label: "Yeni takipçi",
		emoji: "👋",
		build: () => ({
			...createBlankRule(),
			name: "Yeni takipçi karşılama",
			trigger: { type: "follow_event" },
			action: {
				type: "send_message",
				content: "Hoş geldin, takip ettiğin için sağol!",
			},
			cooldownSec: 60,
		}),
	},
	{
		id: "mention-reply",
		label: "Mention yanıtı",
		emoji: "💬",
		build: () => ({
			...createBlankRule(),
			name: "Etiketlenince yanıt",
			trigger: { type: "mention" },
			action: {
				type: "send_message",
				content: "Buradayım {username}!",
			},
			cooldownSec: 30,
		}),
	},
	{
		id: "keyword-discord",
		label: "Discord komutu",
		emoji: "🔗",
		build: () => ({
			...createBlankRule(),
			name: "!discord komutu",
			trigger: {
				type: "chat_match",
				pattern: "^!discord$",
				isRegex: true,
				caseInsensitive: true,
			},
			action: {
				type: "send_message",
				content: "Discord: https://discord.gg/xxxxx",
			},
			cooldownSec: 15,
		}),
	},
	{
		id: "interval-reminder",
		label: "30dk'da bir hatırlatma",
		emoji: "⏰",
		build: () => ({
			...createBlankRule(),
			name: "30 dakikalık hatırlatma",
			trigger: {
				type: "interval",
				intervalMinutes: 30,
				liveOnly: true,
				fireImmediately: false,
			},
			action: {
				type: "send_message",
				content: "Beğenmeyi ve takip etmeyi unutmayın 💚",
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
}

const ChannelChips: FunctionComponent<ChannelChipsProps> = ({
	available,
	selected,
	onChange,
}) => {
	if (available.length === 0) {
		return (
			<div className="auto-empty-hint">
				Henüz kanal eklenmemiş — bu rutin tüm bağlanılan kanallarda
				çalışır.
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
				title="Tüm kanallarda çalış"
			>
				Tüm kanallar
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
}

const RuleRow: FunctionComponent<RuleRowProps> = ({
	rule,
	onEdit,
	onToggle,
	onDelete,
}) => {
	const scopeLabel =
		rule.channelSlugs.length === 0
			? "Tüm kanallar"
			: rule.channelSlugs.join(", ");
	return (
		<div className={`auto-row ${rule.enabled ? "" : "is-off"}`}>
			<button
				type="button"
				role="switch"
				aria-checked={rule.enabled}
				className="set-toggle auto-row-toggle"
				onClick={() => onToggle(!rule.enabled)}
				title={rule.enabled ? "Aktif" : "Pasif"}
			>
				<span className="set-toggle-thumb" />
			</button>
			<div className="auto-row-body">
				<div className="auto-row-title">
					{rule.name || "(adsız rutin)"}
				</div>
				<div className="auto-row-summary">
					<span className="auto-pill">
						{TRIGGER_LABELS[rule.trigger.type]}
					</span>
					<span className="auto-arrow">→</span>
					<span className="auto-pill auto-pill-action">
						{ACTION_LABELS[rule.action.type]}
					</span>
					<span className="auto-pill auto-pill-muted">{scopeLabel}</span>
					<span
						className="auto-pill auto-pill-muted"
						title="Çalıştıktan sonra yeniden tetiklenmeden önceki bekleme süresi"
					>
						{rule.cooldownSec}sn bekle
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
					Düzenle
				</button>
				<button
					type="button"
					className="set-btn danger"
					onClick={onDelete}
					data-testid={`rule-delete-${rule.id}`}
				>
					Sil
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
				trigger = { type: "sub_event", includeGifted: false };
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
					placeholder="Rutin adı"
					data-testid="rule-name-input"
				/>
				<div
					className="auto-cooldown"
					title="Rutin bir kez çalıştıktan sonra, bu süre boyunca yeniden tetiklenmez. Spam koruması için."
				>
					<label htmlFor="cd">Bekleme</label>
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
					<span className="auto-cd-unit">sn</span>
				</div>
			</div>
			<div className="auto-cd-hint">
				Bekleme süresi: rutin çalıştıktan sonra <strong>{rule.cooldownSec}sn</strong>{" "}
				boyunca tekrar tetiklenmez. {rule.cooldownSec === 0 && (
					<span style={{ color: "#fbbf24" }}>
						0 = sınırsız spam, dikkatli kullan.
					</span>
				)}
			</div>

			{/* Kanal seçimi (chip-row) */}
			<div className="auto-field">
				<div className="auto-field-label">Hangi kanallarda çalışsın?</div>
				<ChannelChips
					available={channels}
					selected={rule.channelSlugs}
					onChange={(next) => onChange({ ...rule, channelSlugs: next })}
				/>
			</div>

			{/* Trigger + Action select satırı */}
			<div className="auto-grid-2">
				<div className="auto-field">
					<div className="auto-field-label">Ne zaman tetiklensin?</div>
					<select
						className="set-input auto-select"
						value={rule.trigger.type}
						onChange={(e) =>
							setTriggerType(e.target.value as RuleTrigger["type"])
						}
						data-testid="rule-trigger-select"
					>
						{TRIGGER_OPTIONS.map((t) => (
							<option key={t} value={t}>
								{TRIGGER_LABELS[t]}
							</option>
						))}
					</select>
				</div>
				<div className="auto-field">
					<div className="auto-field-label">Ne yapsın?</div>
					<select
						className="set-input auto-select"
						value={rule.action.type}
						onChange={(e) =>
							setActionType(e.target.value as RuleAction["type"])
						}
					>
						{ACTION_OPTIONS.map((a) => (
							<option key={a} value={a}>
								{ACTION_LABELS[a]}
							</option>
						))}
					</select>
				</div>
			</div>

			{/* Trigger detayları (sadece gerektiğinde) */}
			{rule.trigger.type === "chat_match" && (
				<div className="auto-field auto-detail">
					<div className="auto-field-label">Aranan metin veya emote</div>
					<EmoteEditable
						value={rule.trigger.pattern}
						onChange={(next) =>
							onChange({
								...rule,
								trigger: { ...rule.trigger, pattern: next } as any,
							})
						}
						emoteIndex={emoteIndex}
						placeholder="örn: merhaba veya [emote:...]"
						singleLine
						pickerButtonLabel="😀 emote"
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
							Büyük/küçük harfi yoksay
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
							Regex
						</label>
					</div>
				</div>
			)}
			{rule.trigger.type === "mention" && (
				<div className="auto-field auto-detail">
					<div className="auto-field-label">
						Hangi kullanıcı etiketleninince?
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
						placeholder="Boş = kendi kullanıcı adın"
					/>
				</div>
			)}
			{rule.trigger.type === "kicks_event" && (
				<div className="auto-field auto-detail">
					<div className="auto-field-label">En az kaç KICKs?</div>
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
					<div className="auto-field-label">Hediye sub davranışı</div>
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
									},
								})
							}
						/>
						Hediye olarak gelen sub'ları da tetikle
					</label>
					<div className="auto-cd-hint" style={{ marginTop: 4 }}>
						{rule.trigger.includeGifted ? (
							<>
								<strong>Açık:</strong> hem direkt sub hem de hediye alan
								kullanıcılar için çalışacak. Eğer ayrıca bir "Hediye sub"
								rutinin varsa <strong>çift mesaj</strong> riski var.
							</>
						) : (
							<>
								<strong>Kapalı (önerilen):</strong> sadece kendi parasıyla
								abone olanlar tetikler. Hediye olarak sub alan kullanıcılar
								için sadece "Hediye sub" rutini çalışır.
							</>
						)}
					</div>
				</div>
			)}
			{rule.trigger.type === "interval" && (
				<div className="auto-field auto-detail">
					<div className="auto-field-label">Hangi sıklıkla?</div>
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
									{p.label}
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
							<span className="auto-cd-unit">dk</span>
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
							Sadece kanal yayında (live) iken çalış
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
							Hemen ilk mesajı at (default: önce bekle, sonra at)
						</label>
					</div>
					<div className="auto-cd-hint" style={{ marginTop: 6 }}>
						{rule.trigger.liveOnly !== false ? (
							<>
								<strong>Live-only:</strong> kanal yayında değilse mesaj
								atılmaz. Yayın açılınca {rule.trigger.intervalMinutes}{" "}
								dakikada bir tekrar eder.
							</>
						) : (
							<>
								<strong>Sürekli:</strong> kanal offline olsa bile{" "}
								{rule.trigger.intervalMinutes} dakikada bir çalışır.
							</>
						)}
					</div>
					{rule.channelSlugs.length === 0 && (
						<div
							className="auto-cd-hint"
							style={{ marginTop: 6, color: "#fbbf24" }}
						>
							⚠ Zamanlı rutin için en az 1 kanal seçmelisin (üstteki
							"Hangi kanallarda" alanından).
						</div>
					)}
				</div>
			)}
			{rule.trigger.type === "reward_redeemed" && (
				<div className="auto-field auto-detail">
					<div className="auto-field-label">Reward başlığı (boş = hepsi)</div>
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
						placeholder="Highlight My Message"
					/>
				</div>
			)}

			{/* Mesaj içeriği — Sprint 58c/58d: EmoteEditable */}
			<div className="auto-field">
				<div className="auto-field-label">
					{rule.action.type === "send_message"
						? "Gönderilecek mesaj"
						: "Bildirim metni"}
				</div>
				<EmoteEditable
					value={rule.action.content}
					onChange={(next) => writeContent(next)}
					emoteIndex={emoteIndex}
					placeholder={
						rule.trigger.type === "sub_event"
							? "Teşekkürler {username}!"
							: "Selam {username}!"
					}
					className="auto-textarea"
				/>
				<div className="auto-placeholder-row">
					{PLACEHOLDERS.map((p) => (
						<button
							key={p.key}
							type="button"
							className="auto-chip auto-chip-ph"
							title={p.hint}
							onClick={() => insertToken(p.key)}
						>
							{p.key}
						</button>
					))}
				</div>
			</div>

			{/* Footer */}
			<div className="auto-editor-footer">
				<button
					type="button"
					className="set-btn primary"
					onClick={onSave}
					data-testid="rule-save-btn"
				>
					Kaydet
				</button>
				<button type="button" className="set-btn" onClick={onCancel}>
					İptal
				</button>
			</div>
		</div>
	);
};

// ─── Main section ────────────────────────────────────────────────────────────

const AutomationSection: FunctionComponent = () => {
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
	const startFromTemplate = (t: Template) => setEditing(t.build());

	const saveEditing = () => {
		if (!editing) return;
		if (!editing.name.trim()) {
			toast("Rutinin bir adı olmalı.", { type: "warning" });
			return;
		}
		if (
			editing.action.type === "send_message" &&
			!editing.action.content.trim()
		) {
			toast("Mesaj içeriği boş olamaz.", { type: "warning" });
			return;
		}
		// Sprint 60: interval rule için en az 1 kanal zorunlu
		if (
			editing.trigger.type === "interval" &&
			editing.channelSlugs.length === 0
		) {
			toast(
				"Zamanlı rutin için en az 1 kanal seçmelisin (Hangi kanallarda alanından).",
				{ type: "warning" }
			);
			return;
		}
		upsertAutomationRule(editing);
		setRules(loadAutomationRules());
		setEditing(null);
		toast.success("Rutin kaydedildi.");
	};

	const toggleRule = (id: string, next: boolean) => {
		const r = rules.find((x) => x.id === id);
		if (!r) return;
		upsertAutomationRule({ ...r, enabled: next });
		setRules(loadAutomationRules());
	};

	const removeRule = (id: string) => {
		if (!window.confirm("Bu rutini silmek istediğine emin misin?")) return;
		deleteAutomationRule(id);
		setRules(loadAutomationRules());
	};

	return (
		<div className="set-section auto-section">
			<div className="auto-head">
				<div>
					<h2 className="set-section-title">Otomasyon Rutinleri</h2>
					<p className="set-section-desc">
						Chat olaylarına otomatik yanıt verecek kuralları yönet.
					</p>
				</div>
				<button
					type="button"
					className="set-btn primary"
					onClick={startNew}
					data-testid="rule-new-btn"
				>
					+ Yeni rutin
				</button>
			</div>

			{!editing && (
				<div className="auto-templates">
					<div className="auto-templates-label">Hızlı şablonlar</div>
					<div className="auto-templates-row">
						{TEMPLATES.map((t) => (
							<button
								key={t.id}
								type="button"
								className="auto-template-btn"
								onClick={() => startFromTemplate(t)}
								title={`"${t.label}" şablonundan başla`}
							>
								<span className="auto-template-emoji">{t.emoji}</span>
								<span>{t.label}</span>
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
						Henüz rutin yok. Üstten bir şablon seç veya{" "}
						<strong>+ Yeni rutin</strong> ile başla.
					</div>
				) : (
					rules.map((r) => (
						<RuleRow
							key={r.id}
							rule={r}
							onEdit={() => setEditing(r)}
							onToggle={(next) => toggleRule(r.id, next)}
							onDelete={() => removeRule(r.id)}
						/>
					))
				)}
			</div>
		</div>
	);
};

export default AutomationSection;
