/**
 * Sprint 61 — Bahis oyunu komut ayrıştırma testleri.
 */

import {
	DEFAULT_COMMANDS,
	GameCommandConfig,
	foldCommand,
	parseBetAmount,
	parseGameCommand,
	primaryCommandName,
	resolveBetAmount,
} from "../renderer/util/gameCommands";

const config: GameCommandConfig = DEFAULT_COMMANDS;

describe("foldCommand — Türkçe duyarsız eşleştirme", () => {
	test("büyük İ ve I aynı harfe iner", () => {
		expect(foldCommand("BAHİS")).toBe("bahis");
		expect(foldCommand("BAHIS")).toBe("bahis");
		expect(foldCommand("bahıs")).toBe("bahis");
	});

	test("Türkçe diakritikler ASCII'ye çevrilir", () => {
		expect(foldCommand("Sıralama")).toBe("siralama");
		expect(foldCommand("SIRALAMA")).toBe("siralama");
		expect(foldCommand("güç")).toBe("guc");
		expect(foldCommand("ŞÖĞÜÇ")).toBe("soguc");
	});
});

describe("parseBetAmount", () => {
	test("düz sayı", () => {
		expect(parseBetAmount("500")).toEqual({ kind: "absolute", value: 500 });
	});

	test("k / m son ekleri", () => {
		expect(parseBetAmount("1k")).toEqual({ kind: "absolute", value: 1000 });
		expect(parseBetAmount("2.5k")).toEqual({ kind: "absolute", value: 2500 });
		expect(parseBetAmount("1,5k")).toEqual({ kind: "absolute", value: 1500 });
		expect(parseBetAmount("1m")).toEqual({ kind: "absolute", value: 1_000_000 });
	});

	test("binlik nokta ondalık sayılmaz", () => {
		expect(parseBetAmount("1.000")).toEqual({ kind: "absolute", value: 1000 });
		expect(parseBetAmount("12.500")).toEqual({ kind: "absolute", value: 12500 });
	});

	test("yüzde biçimleri", () => {
		expect(parseBetAmount("%50")).toEqual({ kind: "percent", percent: 50 });
		expect(parseBetAmount("50%")).toEqual({ kind: "percent", percent: 50 });
	});

	test("kelime kısayolları", () => {
		expect(parseBetAmount("hepsi")).toEqual({ kind: "percent", percent: 100 });
		expect(parseBetAmount("HEPSİ")).toEqual({ kind: "percent", percent: 100 });
		expect(parseBetAmount("allin")).toEqual({ kind: "percent", percent: 100 });
		expect(parseBetAmount("yarısı")).toEqual({ kind: "percent", percent: 50 });
		expect(parseBetAmount("yarisi")).toEqual({ kind: "percent", percent: 50 });
	});

	test("geçersiz girdiler", () => {
		expect(parseBetAmount("")).toEqual({ kind: "invalid" });
		expect(parseBetAmount("abc")).toEqual({ kind: "invalid" });
		expect(parseBetAmount("-100")).toEqual({ kind: "invalid" });
		expect(parseBetAmount("0")).toEqual({ kind: "invalid" });
		expect(parseBetAmount("%0")).toEqual({ kind: "invalid" });
		expect(parseBetAmount("%150")).toEqual({ kind: "invalid" });
	});
});

describe("resolveBetAmount", () => {
	test("mutlak değer aynen döner", () => {
		expect(resolveBetAmount({ kind: "absolute", value: 500 }, 10000)).toBe(500);
	});

	test("yüzde bakiyeye uygulanır ve aşağı yuvarlanır", () => {
		expect(resolveBetAmount({ kind: "percent", percent: 50 }, 10001)).toBe(5000);
		expect(resolveBetAmount({ kind: "percent", percent: 100 }, 7350)).toBe(7350);
	});

	test("geçersiz spec sıfır döner", () => {
		expect(resolveBetAmount({ kind: "invalid" }, 10000)).toBe(0);
	});
});

describe("parseGameCommand", () => {
	test("bahis komutu miktarla ayrıştırılır", () => {
		const parsed = parseGameCommand("!bahis 500", config);
		expect(parsed?.kind).toBe("bet");
		expect(parsed?.amount).toEqual({ kind: "absolute", value: 500 });
	});

	test("takma adlar çalışır", () => {
		expect(parseGameCommand("!bet 500", config)?.kind).toBe("bet");
		expect(parseGameCommand("!bakiye", config)?.kind).toBe("balance");
		expect(parseGameCommand("!sıralama", config)?.kind).toBe("top");
	});

	test("büyük harf ve fazladan boşluk tolere edilir", () => {
		const parsed = parseGameCommand("   !BAHİS    %50   ", config);
		expect(parsed?.kind).toBe("bet");
		expect(parsed?.amount).toEqual({ kind: "percent", percent: 50 });
	});

	test("miktarsız bahis geçersiz miktar döner (komut yine tanınır)", () => {
		const parsed = parseGameCommand("!bahis", config);
		expect(parsed?.kind).toBe("bet");
		expect(parsed?.amount).toEqual({ kind: "invalid" });
	});

	test("prefix yoksa komut değildir", () => {
		expect(parseGameCommand("bahis 500", config)).toBeUndefined();
	});

	test("bilinmeyen komut yok sayılır", () => {
		expect(parseGameCommand("!zıpzıp", config)).toBeUndefined();
	});

	test("kapalı komut eşleşmez", () => {
		const disabled: GameCommandConfig = {
			...config,
			commands: {
				...config.commands,
				bet: { enabled: false, names: ["bahis"] },
			},
		};
		expect(parseGameCommand("!bahis 500", disabled)).toBeUndefined();
	});

	test("özel prefix desteklenir", () => {
		const custom: GameCommandConfig = { ...config, prefix: "?" };
		expect(parseGameCommand("?bahis 500", custom)?.kind).toBe("bet");
		expect(parseGameCommand("!bahis 500", custom)).toBeUndefined();
	});

	test("mod komutlarıyla çakışmaz (/ban gibi)", () => {
		expect(parseGameCommand("/ban fanthal", config)).toBeUndefined();
	});
});

describe("primaryCommandName", () => {
	test("prefix + ilk isim", () => {
		expect(primaryCommandName(config, "bet")).toBe("!bahis");
		expect(primaryCommandName(config, "balance")).toBe("!puan");
	});
});
