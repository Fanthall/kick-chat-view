/**
 * Zar anlatısı testleri.
 *
 * Sözleşme: atış ile ödül MONOTON ilişkilidir — yüksek atış hep daha iyi
 * ödeme demektir. Aralıklar çakışırsa veya boşluk kalırsa oyuncuya
 * "18 attım ama az kazandım" gibi tutarsız bir sonuç görünür.
 */

import { DEFAULT_PAYOUT } from "../renderer/util/gameEconomy";
import {
	MAX_ROLL,
	OutcomeId,
	ROLL_RANGES,
	rollFor,
} from "../renderer/util/gameOutcome";

describe("zar aralıkları", () => {
	test("0..20 aralığı boşluksuz ve çakışmasız kaplanır", () => {
		const covered = new Map<number, OutcomeId>();
		for (const [id, [min, max]] of Object.entries(ROLL_RANGES) as [
			OutcomeId,
			[number, number],
		][]) {
			for (let roll = min; roll <= max; roll++) {
				expect(covered.has(roll)).toBe(false); // çakışma yok
				covered.set(roll, id);
			}
		}
		for (let roll = 0; roll <= MAX_ROLL; roll++) {
			expect(covered.has(roll)).toBe(true); // boşluk yok
		}
	});

	test("atış yükseldikçe ödeme çarpanı da yükselir (monotonluk)", () => {
		const tiers = [...DEFAULT_PAYOUT.loss, ...DEFAULT_PAYOUT.win]
			.map((tier) => ({
				multiplier: tier.returnMultiplier,
				min: ROLL_RANGES[tier.id][0],
			}))
			.sort((a, b) => a.min - b.min);

		for (let i = 1; i < tiers.length; i++) {
			expect(tiers[i].multiplier).toBeGreaterThan(tiers[i - 1].multiplier);
		}
	});

	test("her ödeme kademesinin bir zar aralığı vardır", () => {
		for (const tier of [...DEFAULT_PAYOUT.win, ...DEFAULT_PAYOUT.loss]) {
			expect(ROLL_RANGES[tier.id]).toBeDefined();
		}
	});

	// En büyük ödül tek sayıya bağlı olmalı — "20 attım" özel hissettirsin.
	test("jackpot yalnız 20'de, bust yalnız 0'da", () => {
		expect(ROLL_RANGES.jackpot).toEqual([20, 20]);
		expect(ROLL_RANGES.bust).toEqual([0, 0]);
	});
});

describe("rollFor", () => {
	test("üretilen atış her zaman kademenin aralığındadır", () => {
		for (const id of Object.keys(ROLL_RANGES) as OutcomeId[]) {
			const [min, max] = ROLL_RANGES[id];
			for (const r of [0, 0.1, 0.5, 0.9, 0.999999]) {
				const roll = rollFor(id, () => r);
				expect(roll).toBeGreaterThanOrEqual(min);
				expect(roll).toBeLessThanOrEqual(max);
			}
		}
	});

	test("aralık içindeki tüm değerler üretilebilir", () => {
		const seen = new Set<number>();
		for (let i = 0; i < 300; i++) seen.add(rollFor("good", Math.random));
		expect([...seen].sort()).toEqual([15, 16, 17]);
	});
});
