/**
 * Sprint 58 — Automation rules engine.
 *
 * chatConnection.ts ve diğer event noktaları bu modüldeki helper'ları çağırır.
 * Engine:
 *   1) Cache'lenen rule listesini in-memory tutar (localStorage'dan auto-refresh).
 *   2) Cooldown tracking yapar (per-rule lastFiredAt).
 *   3) Eşleşince action'ı uygular: send_message (kick API) veya toast.
 *   4) broadcaster_user_id lookup'ı için kanal bilgi cache'i kullanır.
 */

import { toast } from "react-toastify";

import {
	ChannelRule,
	AutomationContext,
	fillPlaceholders,
	matchesChatPattern,
	matchesMentionTrigger,
	ruleAppliesToChannel,
	repeatCountForAmount,
} from "./automationRules";
import {
	AUTOMATION_RULES_CHANGED,
	loadAutomationRules,
} from "./automationRulesStorage";

// ─── Rule cache + cooldown tracking ───────────────────────────────────────

let cachedRules: ChannelRule[] = [];
const lastFiredAt = new Map<string, number>(); // rule.id → epoch ms

// Sprint 58b: Hediye olarak sub alan kullanıcıları kanal+kullanıcı bazında
// kısa süreliğine işaretle. SubscriptionEvent bu listede varsa sub_event
// rule'u (includeGifted=false ise) atlanır — gifter + recipient ikili
// patlamasını önler.
const GIFT_RECIPIENT_TTL_MS = 5 * 60 * 1000; // 5 dakika
const giftRecipients = new Map<string, number>(); // "slug::user".toLowerCase → expiresAt

const giftKey = (channelSlug: string, username: string) =>
	`${channelSlug}::${username}`.toLowerCase();

const markGiftRecipient = (channelSlug: string, username: string) => {
	if (!username) return;
	giftRecipients.set(
		giftKey(channelSlug, username),
		Date.now() + GIFT_RECIPIENT_TTL_MS
	);
};

const wasRecentGiftRecipient = (
	channelSlug: string,
	username: string
): boolean => {
	if (!username) return false;
	const k = giftKey(channelSlug, username);
	const exp = giftRecipients.get(k);
	if (!exp) return false;
	if (exp < Date.now()) {
		giftRecipients.delete(k);
		return false;
	}
	return true;
};

// FIX-GIFT (2026-07-04): Adı GELMEYEN hediye alıcıları için sayaç-tabanlı bastırma.
// Kick bazen gifted_usernames'i BOŞ/eksik yollar ama adet (amount) verir. O zaman
// per-recipient işaretleme çöker; bunun yerine "adsız beklenen alıcı sayısı" tutulur
// ve ardından gelen o kadar SubscriptionEvent (recipient çift-yayını) bastırılır.
// Adı BİLİNEN alıcılar zaten per-recipient işaretle bastırıldığından sayaç yalnız
// (amount - bilinenAd) kadar artar → GERÇEK (kendi parasıyla) sub'lar ETKİLENMEZ.
const giftPendingUnnamed = new Map<string, number>(); // slug.toLowerCase → kalan adsız alıcı
const addGiftPendingUnnamed = (channelSlug: string, n: number) => {
	if (n <= 0) return;
	const k = channelSlug.toLowerCase();
	giftPendingUnnamed.set(k, (giftPendingUnnamed.get(k) || 0) + n);
};
/** Bekleyen adsız alıcı varsa 1 azalt + true döndür (bu sub bir hediye alıcısı). */
const consumeGiftPendingUnnamed = (channelSlug: string): boolean => {
	const k = channelSlug.toLowerCase();
	const n = giftPendingUnnamed.get(k) || 0;
	if (n <= 0) return false;
	if (n === 1) giftPendingUnnamed.delete(k);
	else giftPendingUnnamed.set(k, n - 1);
	return true;
};

const refreshCache = () => {
	cachedRules = loadAutomationRules();
};

let initialized = false;
const ensureInitialized = () => {
	if (initialized) return;
	initialized = true;
	refreshCache();
	rebuildSchedulers();
	try {
		window.addEventListener(AUTOMATION_RULES_CHANGED, () => {
			refreshCache();
			rebuildSchedulers();
		});
		window.addEventListener("storage", (e) => {
			if (e.key === "chatViewAutomationRules") {
				refreshCache();
				rebuildSchedulers();
			}
		});
	} catch {
		/* ignore */
	}
};

// ─── Sprint 60: Live status cache + interval scheduler ────────────────────

const LIVE_TTL_MS = 60 * 1000; // 60sn
const liveCache = new Map<string, { live: boolean; checkedAt: number }>();

const isChannelLive = async (channelSlug: string): Promise<boolean> => {
	const k = channelSlug.toLowerCase();
	const cached = liveCache.get(k);
	if (cached && Date.now() - cached.checkedAt < LIVE_TTL_MS) {
		return cached.live;
	}
	try {
		const w: any = window as any;
		const res = await w.electron.kick.getChannelBySlug(channelSlug);
		const ch = res?.data?.[0];
		// Kick API: stream / livestream / is_live alanlarından birinde live durumu
		const live: boolean = !!(
			ch?.stream?.is_live ||
			ch?.livestream?.is_live ||
			ch?.is_live
		);
		liveCache.set(k, { live, checkedAt: Date.now() });
		return live;
	} catch {
		return false;
	}
};

interface SchedulerHandle {
	ruleId: string;
	interval: ReturnType<typeof setInterval>;
}
const schedulers = new Map<string, SchedulerHandle>();

const tearDownScheduler = (ruleId: string) => {
	const h = schedulers.get(ruleId);
	if (!h) return;
	clearInterval(h.interval);
	schedulers.delete(ruleId);
};

const tearDownAllSchedulers = () => {
	for (const h of schedulers.values()) clearInterval(h.interval);
	schedulers.clear();
};

const fireIntervalRule = async (rule: ChannelRule) => {
	if (rule.trigger.type !== "interval") return;
	const channels = rule.channelSlugs.length > 0 ? rule.channelSlugs : [];
	if (channels.length === 0) return; // interval rule global çalışmaz — kanal lazım
	const liveOnly = rule.trigger.liveOnly !== false;
	for (const slug of channels) {
		if (liveOnly) {
			const live = await isChannelLive(slug);
			if (!live) continue;
		}
		fireAction(rule, { channelSlug: slug });
	}
};

const setupScheduler = (rule: ChannelRule) => {
	if (rule.trigger.type !== "interval") return;
	if (!rule.enabled) return;
	tearDownScheduler(rule.id);
	const minutes = Math.max(1, rule.trigger.intervalMinutes || 30);
	const intervalMs = minutes * 60 * 1000;
	// fireImmediately = false (default): önce bekle, sonra at
	// fireImmediately = true: hemen at + sonra interval başlat
	if (rule.trigger.fireImmediately === true) {
		fireIntervalRule(rule);
	}
	const handle = setInterval(() => {
		fireIntervalRule(rule);
	}, intervalMs);
	schedulers.set(rule.id, { ruleId: rule.id, interval: handle });
};

const rebuildSchedulers = () => {
	tearDownAllSchedulers();
	for (const rule of cachedRules) {
		if (rule.trigger.type === "interval" && rule.enabled) {
			setupScheduler(rule);
		}
	}
};

// Test helper
export const __resetSchedulersForTest = () => {
	tearDownAllSchedulers();
};

// ─── Channel → broadcaster_user_id cache ──────────────────────────────────

const broadcasterIdCache = new Map<string, number>();

const resolveBroadcasterId = async (
	channelSlug: string
): Promise<number | undefined> => {
	const cached = broadcasterIdCache.get(channelSlug.toLowerCase());
	if (cached) return cached;
	try {
		const w: any = window as any;
		const res = await w.electron.kick.getChannelBySlug(channelSlug);
		const id: number | undefined = res?.data?.[0]?.broadcaster_user_id;
		if (id) broadcasterIdCache.set(channelSlug.toLowerCase(), id);
		return id;
	} catch {
		return undefined;
	}
};

// ─── Action runner ────────────────────────────────────────────────────────

const fireAction = async (rule: ChannelRule, ctx: AutomationContext) => {
	const now = Date.now();
	const last = lastFiredAt.get(rule.id) || 0;
	if (rule.cooldownSec > 0 && now - last < rule.cooldownSec * 1000) {
		return; // cooldown aktif — atla
	}
	lastFiredAt.set(rule.id, now);

	if (rule.action.type === "send_toast") {
		const content = fillPlaceholders(rule.action.content, ctx);
		try {
			toast(`[${rule.name}] ${content}`, { type: "info" });
		} catch {
			/* ignore */
		}
		return;
	}

	if (rule.action.type === "send_message") {
		const content = fillPlaceholders(rule.action.content, ctx).trim();
		if (!content) return;
		const broadcasterId = await resolveBroadcasterId(ctx.channelSlug);
		if (!broadcasterId) {
			console.log(
				"[automation] broadcaster id resolve failed",
				ctx.channelSlug,
				rule.name
			);
			return;
		}
		// FIX-GIFT (2026-07-04): repeat yoksa tek mesaj (default — hediye adedi fark etmez).
		// "tiered" ise hediye adedine göre count (maxCount tavanlı), aralara delaySec bekleme.
		const repeat = rule.action.repeat;
		const count = repeatCountForAmount(repeat, ctx.amount);
		const delayMs = Math.max(0, repeat?.delaySec ?? 0) * 1000;
		const w: any = window as any;
		// DRY-RUN (2026-07-05): localStorage `chatViewAutomationDryRun === "true"`
		// iken chate GERÇEK mesaj GÖNDERİLMEZ — yalnız ne gönderileceği loglanır.
		// Canlı kanalda spam yapmadan rutin/dedup davranışını izlemek için.
		let dryRun = false;
		try {
			dryRun = localStorage.getItem("chatViewAutomationDryRun") === "true";
		} catch {
			/* ignore */
		}
		for (let i = 0; i < count; i++) {
			if (i > 0 && delayMs > 0) {
				await new Promise((r) => setTimeout(r, delayMs));
			}
			if (dryRun) {
				console.log(
					`[automation][DRYRUN] "${rule.name}" → chate GÖNDERİLMEDİ (test modu) | ` +
						`kanal=${ctx.channelSlug} mesaj ${i + 1}/${count}: ${content}`
				);
				continue;
			}
			try {
				await w.electron.kick.sendChatMessage({
					broadcaster_user_id: broadcasterId,
					content,
					type: "user",
				});
			} catch (err) {
				console.log("[automation] sendChatMessage failed", err);
				break;
			}
		}
	}
};

// ─── Public dispatch helpers ──────────────────────────────────────────────

const myUsernameLower = (): string | undefined => {
	const u = localStorage.getItem("username");
	return u ? u.trim().toLowerCase() : undefined;
};

export const evaluateChatMessage = (
	channelSlug: string,
	username: string,
	content: string
) => {
	ensureInitialized();
	const myUser = myUsernameLower();
	// Kendi mesajlarımız tetikleme yapmasın (loop önlemi).
	if (myUser && username.trim().toLowerCase() === myUser) return;

	for (const rule of cachedRules) {
		if (!ruleAppliesToChannel(rule, channelSlug)) continue;
		const trig = rule.trigger;
		if (
			trig.type === "chat_match" &&
			matchesChatPattern(trig, content)
		) {
			fireAction(rule, {
				channelSlug,
				username,
				message: content,
			});
		} else if (
			trig.type === "mention" &&
			matchesMentionTrigger(trig, content, myUser)
		) {
			fireAction(rule, {
				channelSlug,
				username,
				message: content,
			});
		}
	}
};

export const evaluateSubEvent = (
	channelSlug: string,
	username: string | undefined,
	months: number | undefined,
	/**
	 * FIX-3: Bu event yenileme mi? Çağıran (chatConnection) months>1 ile geçer.
	 * Verilmezse months'tan türetilir (months>1 → renewal).
	 */
	isRenewalArg?: boolean
) => {
	ensureInitialized();
	const isRenewal =
		typeof isRenewalArg === "boolean"
			? isRenewalArg
			: typeof months === "number" && months > 1;
	// Sprint 58b: Eğer bu kullanıcı son 5dk içinde hediye sub aldıysa,
	// includeGifted=false (default) olan rule'lar atlanır.
	// Sprint 58b + FIX-GIFT (2026-07-04): hediye alan kullanıcı için includeGifted=false
	// rutinleri atlanır. Adı biliniyorsa per-recipient işaret; adı gelmediyse (Kick boş
	// payload) amount'tan kurulan adsız-alıcı sayacı BU sub'ı tüketir. Gerçek sub'lar
	// (sayaç 0 + ad işaretsiz) ETKİLENMEZ.
	const isNamedRecipient =
		!!username && wasRecentGiftRecipient(channelSlug, username);
	const suppressAsGift =
		isNamedRecipient || consumeGiftPendingUnnamed(channelSlug);
	for (const rule of cachedRules) {
		if (!ruleAppliesToChannel(rule, channelSlug)) continue;
		if (rule.trigger.type !== "sub_event") continue;
		const includeGifted = rule.trigger.includeGifted === true;
		if (suppressAsGift && !includeGifted) continue;
		// FIX-3: subType filtresi. "any" (veya tanımsız) → her zaman geçer.
		const subType = rule.trigger.subType ?? "any";
		if (subType === "new" && isRenewal) continue;
		if (subType === "renewal" && !isRenewal) continue;
		fireAction(rule, { channelSlug, username, months });
	}
};

export const evaluateGiftSubEvent = (
	channelSlug: string,
	gifter: string | undefined,
	amount: number | undefined,
	/** Sprint 58b: alıcı kullanıcı adları (Kick payload'unda gifted_usernames). */
	recipients?: string[]
) => {
	ensureInitialized();
	// Sprint 58b: adı bilinen alıcıları cache'le (per-recipient bastırma).
	let namedCount = 0;
	if (Array.isArray(recipients)) {
		for (const r of recipients) {
			if (typeof r === "string" && r.trim()) {
				markGiftRecipient(channelSlug, r.trim());
				namedCount++;
			}
		}
	}
	// FIX-GIFT (2026-07-04): amount adı bilinenlerden fazlaysa, adsız alıcılar için
	// sayaç-tabanlı bastırma kur (gerçek sub'ları etkilemeden).
	const expectedRecipients =
		typeof amount === "number" && amount > 0 ? amount : namedCount;
	addGiftPendingUnnamed(channelSlug, Math.max(0, expectedRecipients - namedCount));
	for (const rule of cachedRules) {
		if (!ruleAppliesToChannel(rule, channelSlug)) continue;
		if (rule.trigger.type !== "gift_sub_event") continue;
		fireAction(rule, {
			channelSlug,
			username: gifter,
			amount,
		});
	}
};

// Test/debug için cache'i sıfırlama helper'ı (sadece test).
export const __resetGiftRecipientCacheForTest = () => {
	giftRecipients.clear();
	giftPendingUnnamed.clear();
};

export const evaluateFollowEvent = (
	channelSlug: string,
	delta: number,
	username?: string
) => {
	ensureInitialized();
	for (const rule of cachedRules) {
		if (!ruleAppliesToChannel(rule, channelSlug)) continue;
		if (rule.trigger.type !== "follow_event") continue;
		fireAction(rule, { channelSlug, username, amount: delta });
	}
};

export const evaluateKicksEvent = (
	channelSlug: string,
	username: string | undefined,
	amount: number
) => {
	ensureInitialized();
	for (const rule of cachedRules) {
		if (!ruleAppliesToChannel(rule, channelSlug)) continue;
		const trig = rule.trigger;
		if (trig.type !== "kicks_event") continue;
		if (trig.minAmount && trig.minAmount > 0 && amount < trig.minAmount) {
			continue;
		}
		fireAction(rule, { channelSlug, username, amount });
	}
};

export const evaluateHostEvent = (
	channelSlug: string,
	hostUsername: string | undefined,
	viewerCount: number | undefined
) => {
	ensureInitialized();
	for (const rule of cachedRules) {
		if (!ruleAppliesToChannel(rule, channelSlug)) continue;
		if (rule.trigger.type !== "host_event") continue;
		fireAction(rule, {
			channelSlug,
			username: hostUsername,
			amount: viewerCount,
		});
	}
};

export const evaluateRewardEvent = (
	channelSlug: string,
	username: string | undefined,
	rewardTitle: string | undefined
) => {
	ensureInitialized();
	for (const rule of cachedRules) {
		if (!ruleAppliesToChannel(rule, channelSlug)) continue;
		const trig = rule.trigger;
		if (trig.type !== "reward_redeemed") continue;
		if (
			trig.rewardTitle &&
			trig.rewardTitle.trim() &&
			rewardTitle &&
			!rewardTitle.toLowerCase().includes(trig.rewardTitle.toLowerCase())
		) {
			continue;
		}
		fireAction(rule, { channelSlug, username, reward: rewardTitle });
	}
};
