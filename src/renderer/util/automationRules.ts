/**
 * Sprint 58 — Otomasyon rutinleri (channel-scoped auto-responder).
 *
 * Trigger tipleri:
 *   - chat_match    : Chat mesajında regex/keyword eşleşmesi
 *   - mention       : Kullanıcı adı etiketlendiğinde (@user)
 *   - sub_event     : Yeni abonelik
 *   - gift_sub_event: Hediye sub
 *   - follow_event  : Yeni takipçi delta'sı
 *   - kicks_event   : KICKs bağışı (opsiyonel min tutar)
 *   - host_event    : Host/raid
 *   - reward_redeemed: Channel point reward (opsiyonel title)
 *
 * Action tipleri:
 *   - send_message  : Chat'e mesaj gönder (placeholder destekli)
 *   - send_toast    : Sadece kendine notification (chat'e bir şey gönderme)
 *
 * Placeholder syntax (send_message content içinde):
 *   {username} {amount} {months} {tier} {message} {channel} {reward}
 *
 * Cooldown: aynı rule X saniye boyunca tekrar tetiklenmez.
 */

export type RuleTrigger =
	| {
			type: "chat_match";
			/** Substring veya /regex/i pattern. Boşsa hiç eşleşmez. */
			pattern: string;
			caseInsensitive?: boolean;
			isRegex?: boolean;
	  }
	| {
			type: "mention";
			/** Hangi username'lerin mention'ı tetiklesin (boş = sadece kendin). */
			usernames?: string[];
	  }
	| {
			type: "sub_event";
			/**
			 * Sprint 58b: Hediye olarak gelen sub'ları da tetikleyecek mi?
			 * Default false — Kick bazen GiftedSubscriptionsEvent sonrası
			 * her alıcı için ayrı SubscriptionEvent yayınladığı için
			 * gifter rule + alıcı rule iki kez patlamasın diye.
			 */
			includeGifted?: boolean;
			/**
			 * FIX-3 (kullanıcı kararı): Sub event'in hangi tipinde tetiklensin?
			 *   - "new"     : yalnız yeni abonelik (months <= 1)
			 *   - "renewal" : yalnız yenileme (months > 1)
			 *   - "any"     : ikisi de (default — geriye uyumlu)
			 * Tanımsız = "any" → eski kurallar aynen çalışır.
			 */
			subType?: "new" | "renewal" | "any";
	  }
	| { type: "gift_sub_event" }
	| { type: "follow_event" }
	| {
			type: "kicks_event";
			/** En az kaç KICKs (0 = hepsi). */
			minAmount?: number;
	  }
	| { type: "host_event" }
	| {
			type: "reward_redeemed";
			/** Boşsa tüm reward'lar; doluysa case-insensitive eşleşme. */
			rewardTitle?: string;
	  }
	| {
			/**
			 * Sprint 60: Zamanlı tetikleyici — chat olayı değil.
			 * Belirli aralıklarla rule action'ı tetiklenir.
			 */
			type: "interval";
			/** Atlama aralığı dakika cinsinden (en az 1). */
			intervalMinutes: number;
			/**
			 * true (default): sadece kanal yayında (live) iken çalış. Offline'da scheduler durur.
			 * false: kanal durumuna bakılmaksızın her interval'da çalış.
			 */
			liveOnly?: boolean;
			/**
			 * true: kayıttan sonra hemen ilk mesajı at, sonra interval başlasın.
			 * false (default): önce interval kadar bekle, sonra ilk mesajı at.
			 */
			fireImmediately?: boolean;
	  };

/**
 * FIX-GIFT (2026-07-04): send_message için opsiyonel çok-mesaj / kademeli tekrar.
 * DEFAULT (repeat yok) = TEK mesaj, hediye adedi fark etmez. "tiered" açıkken
 * mesaj sayısı hediye adedine göre basamaklanır, maxCount ile sınırlıdır.
 */
export interface RuleRepeat {
	mode: "tiered";
	/** Mesajlar arası bekleme (saniye). */
	delaySec: number;
	/** Güvenlik tavanı — asla bundan fazla mesaj gönderilmez (Kick rate-limit). */
	maxCount: number;
	/** amount >= minAmount olan en yüksek tier'ın count'u seçilir. */
	tiers: { minAmount: number; count: number }[];
}

export type RuleAction =
	| {
			type: "send_message";
			/** Placeholder destekli mesaj içeriği. */
			content: string;
			/** Opsiyonel çok-mesaj / kademeli tekrar. Yoksa tek mesaj. */
			repeat?: RuleRepeat;
	  }
	| {
			type: "send_toast";
			content: string;
	  };

export interface ChannelRule {
	id: string;
	name: string;
	enabled: boolean;
	/** Boş = global (tüm kanallar); doluysa sadece bu slug'lar. */
	channelSlugs: string[];
	trigger: RuleTrigger;
	action: RuleAction;
	/** Spam koruması — aynı rule X saniye boyunca tekrar tetiklenmez. */
	cooldownSec: number;
}

export interface AutomationContext {
	channelSlug: string;
	username?: string;
	amount?: number;
	months?: number;
	tier?: string;
	message?: string;
	reward?: string;
}

/** Placeholder'ları context değerleriyle değiştir. */
export const fillPlaceholders = (
	template: string,
	ctx: AutomationContext
): string => {
	return template
		.replace(/\{username\}/g, ctx.username || "")
		.replace(/\{amount\}/g, ctx.amount !== undefined ? String(ctx.amount) : "")
		.replace(/\{months\}/g, ctx.months !== undefined ? String(ctx.months) : "")
		.replace(/\{tier\}/g, ctx.tier || "")
		.replace(/\{message\}/g, ctx.message || "")
		.replace(/\{channel\}/g, ctx.channelSlug || "")
		.replace(/\{reward\}/g, ctx.reward || "");
};

/**
 * Hediye adedine göre gönderilecek mesaj sayısı. repeat yoksa / amount yoksa /
 * eşik yoksa → 1 (default). Her zaman [1, maxCount] aralığına kıstırılır.
 */
export const repeatCountForAmount = (
	repeat: RuleRepeat | undefined,
	amount: number | undefined
): number => {
	if (!repeat) return 1;
	const cap = Math.max(1, repeat.maxCount || 1);
	if (typeof amount !== "number" || amount <= 0) return 1;
	let count = 1;
	for (const tier of repeat.tiers || []) {
		if (typeof tier.minAmount === "number" && amount >= tier.minAmount) {
			count = Math.max(count, tier.count || 1);
		}
	}
	return Math.min(Math.max(1, count), cap);
};

/** UI/yeni kural için makul varsayılan tiered repeat (kullanıcı düzenler). */
export const defaultRepeat = (): RuleRepeat => ({
	mode: "tiered",
	delaySec: 10,
	maxCount: 5,
	tiers: [
		{ minAmount: 1, count: 1 },
		{ minAmount: 5, count: 2 },
		{ minAmount: 10, count: 3 },
		{ minAmount: 25, count: 4 },
		{ minAmount: 50, count: 5 },
	],
});

/** Rule'un bu kanalda aktif olup olmadığını kontrol et. */
export const ruleAppliesToChannel = (
	rule: ChannelRule,
	channelSlug: string
): boolean => {
	if (!rule.enabled) return false;
	if (!rule.channelSlugs || rule.channelSlugs.length === 0) return true;
	return rule.channelSlugs
		.map((s) => s.toLowerCase())
		.includes(channelSlug.toLowerCase());
};

/** chat_match için pattern eşleşmesi (regex veya substring). */
export const matchesChatPattern = (
	trigger: Extract<RuleTrigger, { type: "chat_match" }>,
	content: string
): boolean => {
	if (!trigger.pattern) return false;
	const text = trigger.caseInsensitive ? content.toLowerCase() : content;
	const needle = trigger.caseInsensitive
		? trigger.pattern.toLowerCase()
		: trigger.pattern;
	if (trigger.isRegex) {
		try {
			const re = new RegExp(trigger.pattern, trigger.caseInsensitive ? "i" : "");
			return re.test(content);
		} catch {
			return false;
		}
	}
	return text.includes(needle);
};

/** mention için username eşleşmesi. */
export const matchesMentionTrigger = (
	trigger: Extract<RuleTrigger, { type: "mention" }>,
	content: string,
	myUsername?: string
): boolean => {
	const candidates =
		trigger.usernames && trigger.usernames.length > 0
			? trigger.usernames
			: myUsername
			? [myUsername]
			: [];
	if (candidates.length === 0) return false;
	const lowered = content.toLowerCase();
	return candidates.some((u) => lowered.includes(`@${u.toLowerCase()}`));
};

export const createBlankRule = (): ChannelRule => ({
	id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
	name: "Yeni rutin",
	enabled: true,
	channelSlugs: [],
	trigger: { type: "chat_match", pattern: "", caseInsensitive: true },
	action: { type: "send_message", content: "" },
	cooldownSec: 10,
});

export const TRIGGER_LABELS: Record<RuleTrigger["type"], string> = {
	chat_match: "Chat mesajı",
	mention: "Etiketleme (@)",
	sub_event: "Yeni abone",
	gift_sub_event: "Hediye sub",
	follow_event: "Yeni takipçi",
	kicks_event: "KICKs bağışı",
	host_event: "Host / raid",
	reward_redeemed: "Channel point reward",
	interval: "Zamanlı (her X dakika)",
};

export const ACTION_LABELS: Record<RuleAction["type"], string> = {
	send_message: "Chat'e mesaj gönder",
	send_toast: "Bana bildirim göster",
};
