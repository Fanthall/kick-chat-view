/**
 * Sprint 61 — Bahis oyunu ekonomi çekirdeği testleri.
 *
 * Buradaki testler tasarım sözleşmesini korur:
 *   "Başta kazandırır, ısrar eden kaybeder."
 * Eğri ayarları değişirse bu testler kırılmalı — sessizce kaymamalı.
 */

import {
	CURVE_PRESETS,
	DEFAULT_ECONOMY,
	DEFAULT_PAYOUT,
	DEFAULT_SIMULATION,
	GameEconomyConfig,
	averageReturn,
	createPlayer,
	payoutEdge,
	pickPayoutTier,
	settleBet,
	simulate,
	validateBet,
	winChance,
	winChanceBreakdown,
} from "../renderer/util/gameEconomy";

const economy: GameEconomyConfig = DEFAULT_ECONOMY;
const { curve } = economy;
const START = economy.startingBalance;

/**
 * Belirli bir bahis derinliğindeki oyuncuyu üretir.
 * Eğri `cycleBets`e (şans döngüsü içindeki bahis sayısı) bakar; `betCount`
 * yalnız istatistiktir. Döngü sıfırlanmamış oyuncuda ikisi eşittir.
 */
const playerAt = (betCount: number, balance = START) => ({
	...createPlayer("tester", balance),
	betCount,
	cycleBets: betCount,
});

describe("winChance — kazanma eğrisi", () => {
	test("ilk bahisler sıcak: base olasılık uygulanır", () => {
		const p = winChance(playerAt(0), 1000, curve, START);
		expect(p).toBeCloseTo(curve.base, 5);
	});

	test("hotBets kadar bahis cezasızdır, sonraki bahis ceza alır", () => {
		// hotBets = 3 → 1./2./3. bahis (betCount 0,1,2) cezasız
		expect(winChance(playerAt(2), 1000, curve, START)).toBeCloseTo(curve.base, 5);
		// 4. bahis (betCount 3) ilk derinlik cezasını alır
		expect(winChance(playerAt(3), 1000, curve, START)).toBeCloseTo(
			curve.base - curve.depthStep,
			5
		);
	});

	test("derinlik arttıkça olasılık monoton düşer", () => {
		const chances = [0, 2, 4, 6, 8, 10, 14].map((n) =>
			winChance(playerAt(n), 1000, curve, START)
		);
		for (let i = 1; i < chances.length; i++) {
			expect(chances[i]).toBeLessThanOrEqual(chances[i - 1]);
		}
		expect(chances[chances.length - 1]).toBeLessThan(chances[0]);
	});

	test("ısrar eden oyuncu 0,5'in altına iner (ev avantajı devreye girer)", () => {
		// 12. bahis, bakiye başlangıcın üstünde — tipik "durmayan" oyuncu
		const p = winChance(playerAt(11, START * 1.5), 1500, curve, START);
		expect(p).toBeLessThan(0.5);
	});

	test("derinlik cezası depthCap ile sınırlıdır, floor altına inilmez", () => {
		const veryDeep = winChance(playerAt(500, START * 8), 1000, curve, START);
		expect(veryDeep).toBeGreaterThanOrEqual(curve.floor);
		expect(veryDeep).toBeCloseTo(curve.floor, 5);
	});

	test("bakiye başlangıcın altındayken açgözlülük cezası yoktur", () => {
		const breakdown = winChanceBreakdown(playerAt(0, START / 2), 500, curve, START);
		expect(breakdown.greedPenalty).toBe(0);
	});

	test("bakiye iki katına çıkınca açgözlülük cezası greedFactor kadardır", () => {
		const breakdown = winChanceBreakdown(playerAt(0, START * 2), 500, curve, START);
		expect(breakdown.greedPenalty).toBeCloseTo(curve.greedFactor, 5);
	});

	test("açgözlülük cezası greedCap ile sınırlıdır", () => {
		const breakdown = winChanceBreakdown(
			playerAt(0, START * 1000),
			500,
			curve,
			START
		);
		expect(breakdown.greedPenalty).toBeCloseTo(curve.greedCap, 5);
	});

	test("all-in cezası büyük-bahis cezasının yerine geçer, toplanmaz", () => {
		const big = winChanceBreakdown(playerAt(0), START * 0.6, curve, START);
		const allIn = winChanceBreakdown(playerAt(0), START, curve, START);
		expect(big.sizePenalty).toBeCloseTo(curve.bigBetPenalty, 5);
		expect(allIn.sizePenalty).toBeCloseTo(curve.allInPenalty, 5);
	});

	test("küçük bahis boyut cezası almaz", () => {
		const breakdown = winChanceBreakdown(playerAt(0), START * 0.1, curve, START);
		expect(breakdown.sizePenalty).toBe(0);
	});

	test("dibe vuran oyuncu merhamet bonusu alır", () => {
		const breakdown = winChanceBreakdown(
			playerAt(20, curve.mercyBalance - 1),
			100,
			curve,
			START
		);
		expect(breakdown.mercyBonus).toBeCloseTo(curve.mercyBonus, 5);
	});

	test("olasılık her zaman [floor, ceil] aralığındadır", () => {
		for (let betCount = 0; betCount < 40; betCount++) {
			for (const balance of [0, 100, START, START * 5, START * 50]) {
				const p = winChance(playerAt(betCount, balance), 100, curve, START);
				expect(p).toBeGreaterThanOrEqual(curve.floor);
				expect(p).toBeLessThanOrEqual(curve.ceil);
			}
		}
	});
});

describe("settleBet", () => {
	// Kademeler tek seçenekli tutulur ki sonuç deterministik olsun; buradaki
	// amaç çekiliş değil, kademenin bakiyeye DOĞRU uygulanması.
	const fixedPayout = (win: number, loss: number): GameEconomyConfig => ({
		...economy,
		payout: {
			win: [{ returnMultiplier: win, weight: 1 }],
			loss: [{ returnMultiplier: loss, weight: 1 }],
		},
	});

	test("kazanınca bakiye çekilen kademe kadar artar", () => {
		const player = playerAt(0);
		const result = settleBet(player, 1000, fixedPayout(2, 0), () => 0, Date.now());
		expect(result.won).toBe(true);
		expect(result.returned).toBe(2000);
		expect(result.delta).toBe(1000); // 2 katı = bahis + bahis kadar kâr
		expect(result.balanceAfter).toBe(START + 1000);
		expect(result.player.wins).toBe(1);
		expect(result.player.betCount).toBe(1);
	});

	test("tam kayıp kademesinde bahsin tamamı gider", () => {
		const player = playerAt(0);
		const result = settleBet(
			player,
			1000,
			fixedPayout(2, 0),
			() => 0.999,
			Date.now()
		);
		expect(result.won).toBe(false);
		expect(result.returned).toBe(0);
		expect(result.delta).toBe(-1000);
		expect(result.balanceAfter).toBe(START - 1000);
		expect(result.player.losses).toBe(1);
	});

	test("kısmi kayıp kademesinde bahsin bir kısmı geri döner", () => {
		const player = playerAt(0);
		const result = settleBet(
			player,
			1000,
			fixedPayout(2, 0.25),
			() => 0.999,
			Date.now()
		);
		expect(result.won).toBe(false);
		expect(result.returned).toBe(250);
		expect(result.delta).toBe(-750);
		expect(result.balanceAfter).toBe(START - 750);
	});

	test("girdi oyuncusu mutasyona uğramaz", () => {
		const player = playerAt(0);
		settleBet(player, 1000, economy, () => 0, Date.now());
		expect(player.balance).toBe(START);
		expect(player.betCount).toBe(0);
	});

	test("bakiye asla negatife düşmez", () => {
		const player = playerAt(0, 500);
		// Tam kayıp kademesi: bakiyenin tamamı bahisteyken bile dip 0'dır.
		const result = settleBet(
			player,
			500,
			fixedPayout(2, 0),
			() => 0.999,
			Date.now()
		);
		expect(result.balanceAfter).toBe(0);
	});

	test("peakBalance zirveyi korur", () => {
		let player = playerAt(0);
		player = settleBet(player, 2000, economy, () => 0, Date.now()).player;
		const peak = player.peakBalance;
		player = settleBet(player, 2000, economy, () => 0.999, Date.now()).player;
		expect(player.balance).toBeLessThan(peak);
		expect(player.peakBalance).toBe(peak);
	});

	test("cycleBets ve betCount birlikte artar", () => {
		const result = settleBet(playerAt(0), 1000, economy, () => 0, Date.now());
		expect(result.player.betCount).toBe(1);
		expect(result.player.cycleBets).toBe(1);
	});

	// Şans döngüsü: sayaç sıfırlanınca oyuncu yeniden "sıcak" başlangıca döner.
	test("cycleBets sıfırlanmış oyuncu, betCount yüksek olsa da tam şans alır", () => {
		const veteran = { ...playerAt(30), cycleBets: 0 };
		expect(winChance(veteran, 1000, curve, START)).toBeCloseTo(curve.base, 5);
	});

	// Ödeme artık ikili değil: taraf belirlendikten sonra kademe ÇEKİLİR.
	test("kazançta çekilen kademe ödemeyi belirler", () => {
		const cfg: GameEconomyConfig = {
			...economy,
			payout: {
				win: [{ returnMultiplier: 3, weight: 1 }],
				loss: [{ returnMultiplier: 0, weight: 1 }],
			},
		};
		// rng()=0 → hem kazanç tarafı hem tek kademe.
		const result = settleBet(playerAt(0), 1000, cfg, () => 0, Date.now());
		expect(result.won).toBe(true);
		expect(result.returnMultiplier).toBe(3);
		expect(result.returned).toBe(3000);
		expect(result.delta).toBe(2000); // eline 3 kat geçti, kârı 2 kat
	});

	test("kayıpta kısmi geri dönüş bakiyeye yansır", () => {
		const cfg: GameEconomyConfig = {
			...economy,
			payout: {
				win: [{ returnMultiplier: 2, weight: 1 }],
				loss: [{ returnMultiplier: 0.1, weight: 1 }],
			},
		};
		// rng()=0.999 → şans eşiğinin üstünde kalır → kayıp tarafı.
		const result = settleBet(playerAt(0), 1000, cfg, () => 0.999, Date.now());
		expect(result.won).toBe(false);
		expect(result.returned).toBe(100); // %10'u geri
		expect(result.delta).toBe(-900);
	});
});

describe("ödeme kademeleri", () => {
	test("pickPayoutTier ağırlığa göre seçer", () => {
		const tiers = [
			{ returnMultiplier: 1.5, weight: 70 },
			{ returnMultiplier: 5, weight: 30 },
		];
		expect(pickPayoutTier(tiers, () => 0).returnMultiplier).toBe(1.5);
		expect(pickPayoutTier(tiers, () => 0.5).returnMultiplier).toBe(1.5);
		expect(pickPayoutTier(tiers, () => 0.8).returnMultiplier).toBe(5);
	});

	test("ağırlığı 0 olan kademe hiç çıkmaz", () => {
		const tiers = [
			{ returnMultiplier: 1.5, weight: 0 },
			{ returnMultiplier: 5, weight: 10 },
		];
		for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
			expect(pickPayoutTier(tiers, () => r).returnMultiplier).toBe(5);
		}
	});

	test("tablo tamamen boşaltılırsa başabaş döner (bakiye sessizce erimez)", () => {
		expect(pickPayoutTier([], () => 0.5).returnMultiplier).toBe(1);
	});

	test("averageReturn ağırlıklı ortalamayı verir", () => {
		expect(
			averageReturn([
				{ returnMultiplier: 1, weight: 1 },
				{ returnMultiplier: 3, weight: 1 },
			])
		).toBeCloseTo(2, 5);
	});

	// Regresyon: varsayılan tablo oyuncu lehine dönerse kasa uzun vadede erir.
	test("varsayılan tabloda ev avantajı korunur (edge < 0)", () => {
		expect(payoutEdge(DEFAULT_PAYOUT)).toBeLessThan(0);
	});
});

describe("validateBet", () => {
	const now = 1_000_000;

	test("min bahis altı reddedilir", () => {
		const r = validateBet(playerAt(0), economy.minBet - 1, economy, now);
		expect(r?.reason).toBe("below_min");
	});

	test("bakiyeden fazlası reddedilir", () => {
		const r = validateBet(playerAt(0, 500), 1000, economy, now);
		expect(r?.reason).toBe("insufficient_balance");
	});

	test("maks bahis üstü reddedilir (maxBet > 0 iken)", () => {
		const cfg: GameEconomyConfig = { ...economy, maxBet: 2000 };
		const r = validateBet(playerAt(0), 2001, cfg, now);
		expect(r?.reason).toBe("above_max");
	});

	test("maxBet = 0 sınırsız demektir", () => {
		const r = validateBet(playerAt(0), START, economy, now);
		expect(r).toBeUndefined();
	});

	test("cooldown dolmadan ikinci bahis reddedilir ve kalan süre döner", () => {
		const player = { ...playerAt(1), lastBetAt: now - 10_000 };
		const r = validateBet(player, 1000, economy, now);
		expect(r?.reason).toBe("cooldown");
		expect(r?.detail).toBe(economy.cooldownSec - 10);
	});

	test("cooldown dolduysa bahis geçer", () => {
		const player = {
			...playerAt(1),
			lastBetAt: now - economy.cooldownSec * 1000 - 1,
		};
		expect(validateBet(player, 1000, economy, now)).toBeUndefined();
	});

	test("oturum bahis limiti uygulanır", () => {
		const cfg: GameEconomyConfig = { ...economy, maxBetsPerSession: 5 };
		const r = validateBet(playerAt(5), 1000, cfg, now);
		expect(r?.reason).toBe("session_limit");
	});
});

describe("simulate — tasarım sözleşmesi", () => {
	/** Deterministik sözde-rastgele (sabit tohum) — test kararlı olsun. */
	const seededRng = (seed: number) => {
		let state = seed;
		return () => {
			state = (state * 1664525 + 1013904223) % 4294967296;
			return state / 4294967296;
		};
	};

	test("ortalama bakiye önce yükselir, sonra düşer (zirve ortada)", () => {
		const result = simulate(economy, DEFAULT_SIMULATION, seededRng(42));
		const curveByBet = result.averageBalanceByBet;
		const peakIndex = curveByBet.indexOf(Math.max(...curveByBet));

		// Zirve başlangıçta da sonda da değil — ortalarda bir yerde.
		expect(peakIndex).toBeGreaterThan(0);
		expect(peakIndex).toBeLessThan(curveByBet.length - 1);
		// Zirve başlangıç puanının üstünde: "kazanıyorum" hissi gerçekten oluşuyor.
		expect(curveByBet[peakIndex]).toBeGreaterThan(START);
		// Son ortalama zirvenin altında: ısrar eden eritiyor.
		expect(curveByBet[curveByBet.length - 1]).toBeLessThan(curveByBet[peakIndex]);
	});

	test("ilk bahislerden sonra ortalama bakiye başlangıcın üstündedir", () => {
		const result = simulate(economy, DEFAULT_SIMULATION, seededRng(7));
		expect(result.averageBalanceByBet[3]).toBeGreaterThan(START);
	});

	test("20 bahis sonunda oyuncuların çoğunluğu kârda değildir", () => {
		const result = simulate(economy, DEFAULT_SIMULATION, seededRng(99));
		// Ölçüm (4000 oyuncu): %30,7. Eşik regresyon koruması —
		// eğri sulandırılırsa (depthCap düşerse) bu test kırılmalı.
		expect(result.profitableShare).toBeLessThan(0.4);
	});

	test("agresif oyuncu (bakiyenin %25'i) çok daha sert erir", () => {
		const calm = simulate(economy, DEFAULT_SIMULATION, seededRng(99));
		const aggressive = simulate(
			economy,
			{ ...DEFAULT_SIMULATION, betFraction: 0.25 },
			seededRng(99)
		);
		expect(aggressive.profitableShare).toBeLessThan(calm.profitableShare);
		expect(aggressive.finalAverageBalance).toBeLessThan(START);
	});

	test("cömert preset bile para basma makinesi değildir", () => {
		const result = simulate(
			{ ...economy, curve: CURVE_PRESETS.generous },
			DEFAULT_SIMULATION,
			seededRng(99)
		);
		// Zirveden sonra düşüş olmalı — herkesin kazandığı ekonomi bozuk ekonomidir.
		const curveByBet = result.averageBalanceByBet;
		const peak = Math.max(...curveByBet);
		expect(curveByBet[curveByBet.length - 1]).toBeLessThan(peak);
		expect(result.profitableShare).toBeLessThan(0.9);
	});

	test("kumarhane preset'i dengeliden daha sert erozyon üretir", () => {
		const balanced = simulate(economy, DEFAULT_SIMULATION, seededRng(5));
		const casino = simulate(
			{ ...economy, curve: CURVE_PRESETS.casino },
			DEFAULT_SIMULATION,
			seededRng(5)
		);
		expect(casino.finalAverageBalance).toBeLessThan(balanced.finalAverageBalance);
	});

	test("cömert preset'i dengeliden daha iyi bitirir", () => {
		const balanced = simulate(economy, DEFAULT_SIMULATION, seededRng(5));
		const generous = simulate(
			{ ...economy, curve: CURVE_PRESETS.generous },
			DEFAULT_SIMULATION,
			seededRng(5)
		);
		expect(generous.finalAverageBalance).toBeGreaterThan(
			balanced.finalAverageBalance
		);
	});
});
