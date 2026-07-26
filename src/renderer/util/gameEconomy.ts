/**
 * Sprint 61 — Bahis oyunu ekonomi çekirdeği.
 *
 * Bu dosyadaki her şey SAF fonksiyondur: localStorage / DOM / network yok,
 * rastgelelik dışarıdan enjekte edilir (`Rng`). Böylece kazanma eğrisi
 * deterministik olarak test edilebilir ve ayar panelindeki Monte Carlo
 * önizlemesi aynı kodu kullanır (panelde görülen = chatte olan).
 *
 * Tasarım hedefi (kullanıcı kararı 2026-07-23):
 *   "Başta kazanıyor hissi versin, ısrar eden kaybetsin."
 *
 * Kazanma olasılığı sabit DEĞİLDİR; oyuncunun o oturumdaki davranışına göre
 * hesaplanır:
 *
 *   p = base
 *       − derinlik cezası   (kaçıncı bahis — ısrar)
 *       − açgözlülük cezası (bakiye başlangıcın kaç katı)
 *       − boyut cezası      (bahis bakiyenin ne kadarı — all-in)
 *       + merhamet bonusu   (bakiye dibe vurduysa oyuncu kopmasın)
 *   ve [floor, ceil] aralığına kıstırılır.
 *
 * 1:1 ödemede beklenen değer EV = (2p − 1) × bahis olduğu için p < 0,5 olduğu
 * anda oyuncu erimeye başlar. `floor` bu yüzden garantili ev avantajıdır.
 */

/** Enjekte edilebilir rastgelelik — testte deterministik dizi verilir. */
export type Rng = () => number;

export interface GameCurveConfig {
	/** Sıcak başlangıç olasılığı (ceza uygulanmadan önce). */
	base: number;
	/** İlk kaç bahis derinlik cezasından muaf. */
	hotBets: number;
	/** hotBets sonrası her bahiste düşülen olasılık. */
	depthStep: number;
	/** Derinlik cezasının üst sınırı. */
	depthCap: number;
	/** Bakiye başlangıcın 2 katına çıktığında düşülecek olasılık (log2 tabanlı). */
	greedFactor: number;
	/** Açgözlülük cezasının üst sınırı. */
	greedCap: number;
	/** Bahis/bakiye bu oranı aşarsa "büyük bahis" sayılır. */
	bigBetThreshold: number;
	bigBetPenalty: number;
	/** Bahis/bakiye bu oranı aşarsa "all-in" sayılır (bigBet yerine geçer). */
	allInThreshold: number;
	allInPenalty: number;
	/** Bakiye bu değerin altındaysa merhamet bonusu uygulanır. */
	mercyBalance: number;
	mercyBonus: number;
	/** Olasılık tabanı — ısrar eden oyuncunun düşebileceği en düşük şans. */
	floor: number;
	/** Olasılık tavanı. */
	ceil: number;
}

/**
 * Tek bir ödeme kademesi.
 *
 * `returnMultiplier` = bahsin KAÇ KATININ GERİ DÖNDÜĞÜ (oyuncunun eline geçen),
 * kâr değil. Böylece kazanç ve kayıp aynı ölçekte ifade edilir:
 *   0    → hepsi gitti          (delta = −bahis)
 *   0.1  → %10'u geri geldi     (delta = −bahsin %90'ı)
 *   1    → başabaş              (delta = 0)
 *   2    → 2 katı               (delta = +bahis)
 *   5    → 5 katı               (delta = +4 × bahis)
 */
export interface PayoutTier {
	returnMultiplier: number;
	/** Kendi tarafındaki (kazanç/kayıp) diğer kademelere göre ağırlık. */
	weight: number;
}

/**
 * Sonuç ikili değildir: önce şans eğrisi kazanç/kayıp tarafını belirler,
 * sonra o tarafın kademelerinden AĞIRLIKLI çekiliş yapılır. Yani "3 katı" veya
 * "%10'u geri" sabit kural değil, ihtimale bağlı sonuçlardır.
 */
export interface PayoutTable {
	win: PayoutTier[];
	loss: PayoutTier[];
}

export interface GameEconomyConfig {
	/** Her oyuncunun yayın başına aldığı puan. */
	startingBalance: number;
	minBet: number;
	/** 0 = sınırsız. */
	maxBet: number;
	/**
	 * Ödeme kademeleri. Ağırlıklı çekilişle seçilir.
	 * Ev avantajı buradan gelir: kazanç tarafının ağırlıklı ortalaması ile
	 * kayıp tarafınınki toplandığında 2'nin ALTINDA kalmalıdır (bkz. payoutEdge).
	 */
	payout: PayoutTable;
	/** Aynı oyuncunun iki bahsi arasındaki en az süre. */
	cooldownSec: number;
	/** Oturum başına oyuncu bahis limiti. 0 = sınırsız. */
	maxBetsPerSession: number;
	/**
	 * ŞANS DÖNGÜSÜ (dakika). Bu süre dolunca tüm oyuncuların derinlik sayacı
	 * (`cycleBets`) sıfırlanır ve kazanma şansı yeniden "sıcak" başlangıca döner.
	 * Bakiyeler KORUNUR — sıfırlanan yalnız şans eğrisidir. 0 = döngü kapalı
	 * (oyuncu yayın boyunca dipte kalır — eski davranış).
	 */
	luckCycleMinutes: number;
	curve: GameCurveConfig;
}

/** Bir oyuncunun tek oturumdaki (yayındaki) durumu. */
export interface GamePlayer {
	username: string;
	balance: number;
	/** Bu oturumda ŞU ANA KADAR oynanmış toplam bahis sayısı (istatistik). */
	betCount: number;
	/**
	 * ŞANS DÖNGÜSÜ içindeki bahis sayısı — kazanma eğrisinin derinlik cezası
	 * BUNA bakar. Döngü dolunca sıfırlanır, böylece hiç kimse yayının sonuna
	 * kadar kalıcı olarak dipte kalmaz (kullanıcı kararı 2026-07-24).
	 */
	cycleBets: number;
	wins: number;
	losses: number;
	/** Oturumdaki en yüksek bakiye — "zirveyi gördün, sonra erittin" anlatısı için. */
	peakBalance: number;
	/** Son bahis zamanı (epoch ms) — cooldown kontrolü. */
	lastBetAt: number;
}

// ─── Preset'ler ──────────────────────────────────────────────────────────────

export type CurvePresetId = "generous" | "balanced" | "casino";

const BALANCED_CURVE: GameCurveConfig = {
	base: 0.8,
	hotBets: 3,
	depthStep: 0.05,
	// Ölçüm (2026-07-23): depthCap 0,35 iken olasılık 0,45'te dibe vuruyordu →
	// EV yalnız −0,10, ısrar eden neredeyse hiç erimiyordu (oyuncuların %49,6'sı
	// 20 bahis sonunda kârdaydı). 0,45 ile taban 0,35'e iner (EV −0,30).
	depthCap: 0.45,
	greedFactor: 0.12,
	greedCap: 0.25,
	bigBetThreshold: 0.5,
	bigBetPenalty: 0.08,
	allInThreshold: 0.9,
	allInPenalty: 0.15,
	mercyBalance: 1500,
	mercyBonus: 0.1,
	floor: 0.28,
	ceil: 0.85,
};

export const CURVE_PRESETS: Record<CurvePresetId, GameCurveConfig> = {
	/**
	 * Cömert — uzun süre kazandırır, düşüş yumuşak. Yine de sonu hafif eksidir:
	 * ölçümde depthCap 0,25 iken taban 0,60'ta kalıyordu ve oyuncuların %93,9'u
	 * kârda bitiriyordu — bu "cömert" değil, bozuk ekonomi demekti.
	 */
	generous: {
		...BALANCED_CURVE,
		base: 0.85,
		hotBets: 5,
		depthStep: 0.045,
		depthCap: 0.38,
		greedFactor: 0.08,
		greedCap: 0.18,
		floor: 0.38,
	},
	/** Dengeli — varsayılan. Zirve 5.–8. bahis, sonrası düşüş. */
	balanced: BALANCED_CURVE,
	/** Kumarhane — kısa sıcak başlangıç, sert düşüş. */
	casino: {
		...BALANCED_CURVE,
		base: 0.78,
		hotBets: 2,
		depthStep: 0.07,
		depthCap: 0.45,
		greedFactor: 0.16,
		greedCap: 0.3,
		bigBetPenalty: 0.1,
		allInPenalty: 0.2,
		mercyBonus: 0.06,
		floor: 0.2,
	},
};

/**
 * Varsayılan kademeler.
 *
 * Kayıp tarafı ağırlıklı ortalama ≈ 0,125 · kazanç tarafı ≈ 1,82.
 * Toplam 1,945 < 2 olduğu için %50 şansta bile ev hafif avantajlıdır
 * (birim bahiste EV ≈ −0,03); ısrar edip şans düştükçe kayıp hızlanır.
 * Bu, eğrinin "başta kazandır, ısrar edeni erit" tasarımıyla uyumludur.
 */
export const DEFAULT_PAYOUT: PayoutTable = {
	win: [
		{ returnMultiplier: 1.2, weight: 30 }, // ucu ucuna kâr
		{ returnMultiplier: 1.5, weight: 30 },
		{ returnMultiplier: 2, weight: 25 }, // 2 katı
		{ returnMultiplier: 3, weight: 12 }, // 3 katı
		{ returnMultiplier: 5, weight: 3 }, // nadir büyük vuruş
	],
	loss: [
		{ returnMultiplier: 0, weight: 45 }, // hepsi gitti
		{ returnMultiplier: 0.1, weight: 25 }, // %10'u geri
		{ returnMultiplier: 0.25, weight: 20 }, // çeyreği geri
		{ returnMultiplier: 0.5, weight: 10 }, // yarısı geri
	],
};

/**
 * Bir kademe tablosunun ağırlıklı ortalama getirisi. Panelin ev avantajını
 * göstermesi ve testlerin regresyon yakalaması için.
 */
export const averageReturn = (tiers: PayoutTier[]): number => {
	const usable = tiers.filter((t) => t.weight > 0);
	const total = usable.reduce((sum, t) => sum + t.weight, 0);
	if (!total) return 0;
	return (
		usable.reduce((sum, t) => sum + t.returnMultiplier * t.weight, 0) / total
	);
};

/**
 * %50 şans varsayımıyla birim bahis başına beklenen değer.
 * Negatif = ev avantajlı (olması gereken). Panelde uyarı için kullanılır.
 */
export const payoutEdge = (table: PayoutTable): number =>
	(averageReturn(table.win) + averageReturn(table.loss)) / 2 - 1;

/** Ağırlıklı çekiliş. Ağırlığı 0 olan kademeler devre dışıdır. */
export const pickPayoutTier = (tiers: PayoutTier[], rng: Rng): PayoutTier => {
	const usable = tiers.filter((t) => t.weight > 0);
	// Tablo boşaltıldıysa başabaş dön — bakiye sessizce erimesin.
	if (!usable.length) return { returnMultiplier: 1, weight: 1 };
	const total = usable.reduce((sum, t) => sum + t.weight, 0);
	let roll = rng() * total;
	for (const tier of usable) {
		roll -= tier.weight;
		if (roll < 0) return tier;
	}
	return usable[usable.length - 1];
};

export const DEFAULT_ECONOMY: GameEconomyConfig = {
	startingBalance: 10000,
	minBet: 100,
	maxBet: 0,
	payout: DEFAULT_PAYOUT,
	cooldownSec: 30,
	maxBetsPerSession: 0,
	luckCycleMinutes: 30,
	curve: BALANCED_CURVE,
};

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

export const clamp = (value: number, min: number, max: number): number => {
	if (Number.isNaN(value)) return min;
	if (value < min) return min;
	if (value > max) return max;
	return value;
};

export const createPlayer = (
	username: string,
	startingBalance: number
): GamePlayer => ({
	username,
	balance: Math.max(0, Math.floor(startingBalance)),
	betCount: 0,
	cycleBets: 0,
	wins: 0,
	losses: 0,
	peakBalance: Math.max(0, Math.floor(startingBalance)),
	lastBetAt: 0,
});

// ─── Kazanma olasılığı ───────────────────────────────────────────────────────

/** Ceza kalemlerini ayrı ayrı döndürür — ayar panelinde "neden bu oran?" açıklaması için. */
export interface WinChanceBreakdown {
	base: number;
	depthPenalty: number;
	greedPenalty: number;
	sizePenalty: number;
	mercyBonus: number;
	/** Kıstırılmış nihai olasılık. */
	chance: number;
}

export const winChanceBreakdown = (
	player: GamePlayer,
	bet: number,
	curve: GameCurveConfig,
	startingBalance: number
): WinChanceBreakdown => {
	// Derinlik: ilk `hotBets` bahis cezasız. cycleBets = bu bahisten ÖNCE, İÇİNDE
	// BULUNULAN ŞANS DÖNGÜSÜNDE oynanan sayı; hotBets=3 iken 1./2./3. bahis
	// (cycleBets 0,1,2) muaf, 4. bahis ilk cezayı alır. Döngü dolunca sayaç
	// sıfırlandığı için oyuncu yeniden sıcak başlangıca döner.
	const depthSteps = Math.max(0, player.cycleBets + 1 - curve.hotBets);
	const depthPenalty = Math.min(depthSteps * curve.depthStep, curve.depthCap);

	// Açgözlülük: bakiye başlangıcın katına çıktıkça log2 ile artan ceza.
	// Bakiye başlangıcın altındaysa ceza yok (negatif log clamp'lenir).
	let greedPenalty = 0;
	if (startingBalance > 0 && player.balance > startingBalance) {
		const ratio = player.balance / startingBalance;
		greedPenalty = clamp(
			Math.log2(ratio) * curve.greedFactor,
			0,
			curve.greedCap
		);
	}

	// Boyut: bahis bakiyenin ne kadarı. All-in, büyük bahsin yerine geçer (toplanmaz).
	let sizePenalty = 0;
	if (player.balance > 0) {
		const ratio = bet / player.balance;
		if (ratio >= curve.allInThreshold) {
			sizePenalty = curve.allInPenalty;
		} else if (ratio > curve.bigBetThreshold) {
			sizePenalty = curve.bigBetPenalty;
		}
	}

	// Merhamet: dibe vuran oyuncu tamamen kopmasın.
	const mercyBonus = player.balance < curve.mercyBalance ? curve.mercyBonus : 0;

	const raw =
		curve.base - depthPenalty - greedPenalty - sizePenalty + mercyBonus;

	return {
		base: curve.base,
		depthPenalty,
		greedPenalty,
		sizePenalty,
		mercyBonus,
		chance: clamp(raw, curve.floor, curve.ceil),
	};
};

export const winChance = (
	player: GamePlayer,
	bet: number,
	curve: GameCurveConfig,
	startingBalance: number
): number => winChanceBreakdown(player, bet, curve, startingBalance).chance;

// ─── Bahis çözümü ────────────────────────────────────────────────────────────

export type BetRejectReason =
	| "below_min"
	| "above_max"
	| "insufficient_balance"
	| "cooldown"
	| "session_limit";

export interface BetRejection {
	ok: false;
	reason: BetRejectReason;
	/** Cooldown için kalan saniye; limitler için ilgili sınır değeri. */
	detail?: number;
}

export interface BetResult {
	ok: true;
	won: boolean;
	/** Uygulanan bahis (kıstırma sonrası). */
	bet: number;
	/** Bakiye değişimi (kâr/zarar): `returned − bet`. */
	delta: number;
	/** Oyuncunun eline geçen toplam (bahis dahil). */
	returned: number;
	/** Çekilen kademenin çarpanı — cevap metninde "3 katı" / "%10" için. */
	returnMultiplier: number;
	balanceBefore: number;
	balanceAfter: number;
	chance: number;
	player: GamePlayer;
}

/**
 * Bahsin oynanabilir olup olmadığını kontrol eder. Saf — state değiştirmez.
 * `now` dışarıdan verilir (test determinizmi).
 */
export const validateBet = (
	player: GamePlayer,
	bet: number,
	economy: GameEconomyConfig,
	now: number
): BetRejection | undefined => {
	if (
		economy.maxBetsPerSession > 0 &&
		player.betCount >= economy.maxBetsPerSession
	) {
		return {
			ok: false,
			reason: "session_limit",
			detail: economy.maxBetsPerSession,
		};
	}
	if (economy.cooldownSec > 0 && player.lastBetAt > 0) {
		const elapsedSec = (now - player.lastBetAt) / 1000;
		if (elapsedSec < economy.cooldownSec) {
			return {
				ok: false,
				reason: "cooldown",
				detail: Math.ceil(economy.cooldownSec - elapsedSec),
			};
		}
	}
	if (bet < economy.minBet) {
		return { ok: false, reason: "below_min", detail: economy.minBet };
	}
	if (economy.maxBet > 0 && bet > economy.maxBet) {
		return { ok: false, reason: "above_max", detail: economy.maxBet };
	}
	if (bet > player.balance) {
		return {
			ok: false,
			reason: "insufficient_balance",
			detail: player.balance,
		};
	}
	return undefined;
};

/**
 * Bahsi çözer ve GÜNCELLENMİŞ yeni oyuncu nesnesini döndürür (mutasyon yok).
 * Doğrulama çağıran tarafın işidir (`validateBet`).
 */
export const settleBet = (
	player: GamePlayer,
	bet: number,
	economy: GameEconomyConfig,
	rng: Rng,
	now: number
): BetResult => {
	const chance = winChance(player, bet, economy.curve, economy.startingBalance);
	const won = rng() < chance;

	// Taraf belirlendikten SONRA kademe çekilir: "3 katı" veya "%10'u geri"
	// sabit değil, kendi tarafının ağırlıklı ihtimaline bağlıdır.
	const table = economy.payout || DEFAULT_PAYOUT;
	const tier = pickPayoutTier(won ? table.win : table.loss, rng);
	const returned = Math.round(bet * tier.returnMultiplier);
	const delta = returned - bet;
	const balanceAfter = Math.max(0, player.balance + delta);

	const next: GamePlayer = {
		...player,
		balance: balanceAfter,
		betCount: player.betCount + 1,
		cycleBets: player.cycleBets + 1,
		wins: player.wins + (won ? 1 : 0),
		losses: player.losses + (won ? 0 : 1),
		peakBalance: Math.max(player.peakBalance, balanceAfter),
		lastBetAt: now,
	};

	return {
		ok: true,
		won,
		bet,
		delta,
		returned,
		returnMultiplier: tier.returnMultiplier,
		balanceBefore: player.balance,
		balanceAfter,
		chance,
		player: next,
	};
};

// ─── Monte Carlo önizlemesi (ayar paneli) ────────────────────────────────────

export interface SimulationOptions {
	players: number;
	betsPerPlayer: number;
	/** Sanal oyuncu her turda bakiyesinin bu kadarını yatırır. */
	betFraction: number;
}

export const DEFAULT_SIMULATION: SimulationOptions = {
	players: 1000,
	betsPerPlayer: 20,
	betFraction: 0.1,
};

export interface SimulationResult {
	/** Her bahis sırası için ortalama bakiye (index 0 = hiç oynamadan önce). */
	averageBalanceByBet: number[];
	/** Sonunda başlangıç puanının üstünde bitiren oyuncu oranı [0..1]. */
	profitableShare: number;
	/** Ortalama zirve bakiye — "kazandığını sandığı an". */
	averagePeak: number;
	/** Ortalama zirvenin kaçıncı bahiste görüldüğü. */
	averagePeakBet: number;
	/** Son ortalama bakiye. */
	finalAverageBalance: number;
}

/**
 * Ayar panelindeki "bu ayarla ne olur?" önizlemesi. Chatte çalışan kodun
 * aynısını kullanır, dolayısıyla gösterilen eğri gerçek davranıştır.
 */
export const simulate = (
	economy: GameEconomyConfig,
	options: SimulationOptions,
	rng: Rng
): SimulationResult => {
	const playerCount = Math.max(1, Math.floor(options.players));
	const rounds = Math.max(1, Math.floor(options.betsPerPlayer));
	const fraction = clamp(options.betFraction, 0.01, 1);

	const totals = new Array<number>(rounds + 1).fill(0);
	let profitable = 0;
	let peakSum = 0;
	let peakBetSum = 0;

	for (let i = 0; i < playerCount; i++) {
		let player = createPlayer(`sim-${i}`, economy.startingBalance);
		totals[0] += player.balance;
		let peakBet = 0;

		for (let round = 1; round <= rounds; round++) {
			let bet = Math.round(player.balance * fraction);
			if (economy.maxBet > 0) bet = Math.min(bet, economy.maxBet);
			bet = Math.min(bet, player.balance);

			// Bakiye min bahsin altına düştüyse oyuncu oynayamaz — bakiye sabit kalır.
			if (bet >= economy.minBet) {
				const before = player.peakBalance;
				// Simülasyonda cooldown/limit yok; yalnız eğri ölçülür.
				const result = settleBet(player, bet, economy, rng, round);
				player = result.player;
				if (player.peakBalance > before) peakBet = round;
			}
			totals[round] += player.balance;
		}

		if (player.balance > economy.startingBalance) profitable++;
		peakSum += player.peakBalance;
		peakBetSum += peakBet;
	}

	return {
		averageBalanceByBet: totals.map((sum) => sum / playerCount),
		profitableShare: profitable / playerCount,
		averagePeak: peakSum / playerCount,
		averagePeakBet: peakBetSum / playerCount,
		finalAverageBalance: totals[rounds] / playerCount,
	};
};
