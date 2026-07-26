/**
 * Oyun anlatısı — d20 zar atışı.
 *
 * NEDEN: "3 kat! +2.000" tek başına oyuncuya hiçbir şey anlatmıyor; neden
 * kazandığı görünmüyor. Her ödeme kademesi burada bir ZAR ATIŞINA bağlanır:
 *
 *   @ali 🎲 18/20 — Sağlam atış! 3 kat · 500 → 1.500 (bakiye: 11.000)
 *
 * İlişki MONOTONDUR: atış yükseldikçe ödül büyür, düştükçe kayıp derinleşir.
 * Oyuncu tek bakışta "18 attım, 3 kat aldım" diyebilir; 20 en büyük vuruş,
 * 0 tam kayıptır.
 *
 * DÜRÜST OLMAK GEREKİRSE: zar sonucu BELİRLEMEZ, sonucu ANLATIR. Kazanma
 * olasılığı `gameEconomy` içindeki davranış eğrisinden (ısrar/açgözlülük
 * cezaları), ödeme ise ağırlıklı kademe çekilişinden gelir; buradaki atış o
 * kademenin aralığından geriye doğru üretilir. Böylece görülen zar ile ödenen
 * çarpan HER ZAMAN tutarlıdır — düz bir d20 atıp eğriyi bozmaktansa tutarlı
 * ve okunur bir anlatı tercih edildi.
 *
 * Saf fonksiyonlar: rastgelelik dışarıdan enjekte edilir (`Rng`).
 */

import { Rng } from "./gameEconomy";

/** Ödeme kademesi kimliği — atış aralığının ve anlatı metninin anahtarı. */
export type OutcomeId =
	// kazanç (yüksek atış)
	| "slim"
	| "fair"
	| "good"
	| "great"
	| "jackpot"
	// kayıp (düşük atış)
	| "half"
	| "quarter"
	| "scrape"
	| "bust";

export const MAX_ROLL = 20;

/**
 * Kademe → zar aralığı (dahil). Aralıklar 0-20'yi boşluksuz ve çakışmasız
 * kaplar; monotonluk buna dayanır.
 */
export const ROLL_RANGES: Record<OutcomeId, [number, number]> = {
	jackpot: [20, 20], // 5×   — tek sayı, en nadir
	great: [18, 19], // 3×
	good: [15, 17], // 2×
	fair: [12, 14], // 1,5×
	slim: [10, 11], // 1,2×  — kazancın alt sınırı
	half: [7, 9], // %50 geri
	quarter: [4, 6], // %25 geri
	scrape: [1, 3], // %10 geri
	bust: [0, 0], // hepsi gitti
};

/** Kademeye uygun zar atışını üretir (aralık içinde düzgün dağılım). */
export const rollFor = (id: OutcomeId, rng: Rng): number => {
	const [min, max] = ROLL_RANGES[id];
	const span = max - min + 1;
	const offset = Math.min(span - 1, Math.floor(rng() * span));
	return min + offset;
};
