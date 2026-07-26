/**
 * Kick mesaj temizleme testleri.
 *
 * REGRESYON (2026-07-26): Kick, emoji/sembol yoğun mesajı 400
 * MAX_SPECIAL_CHARS_ERROR ile reddediyordu ve bot hiç yazamıyordu.
 */

import {
	isSpecialCharsError,
	sanitizeForKick,
} from "../renderer/util/gameSanitize";
import { DEFAULT_GAME_CONFIG } from "../renderer/util/gameStorage";
import { dict } from "../renderer/util/i18n";

describe("sanitizeForKick", () => {
	test("emoji atılır, metin ve sayılar korunur", () => {
		const out = sanitizeForKick("@ali 🎲 17/20 kazandin 2.000 aldin 🎉");
		expect(out).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
		expect(out).toContain("@ali");
		expect(out).toContain("17/20");
		expect(out).toContain("2.000");
	});

	test("tipografik işaretler ASCII'ye çevrilir", () => {
		expect(sanitizeForKick("a · b — c")).toBe("a - b - c");
		expect(sanitizeForKick("2 × 3")).toBe("2 x 3");
		expect(sanitizeForKick("“alinti”")).toBe('"alinti"');
	});

	test("emoji sonrası oluşan çift boşluk toplanır", () => {
		expect(sanitizeForKick("bir 🎲 iki")).toBe("bir iki");
	});

	test("Türkçe harfler ve temel noktalama korunur", () => {
		const out = sanitizeForKick("@ali gecersiz miktar. Ornek: !bahis 500, %50");
		expect(out).toBe("@ali gecersiz miktar. Ornek: !bahis 500, %50");
	});

	test("zaten sade metin değişmez", () => {
		const plain = "@ali zar 17/20 - Iyi attin! 2 kat, 500 yatirdin 1000 aldin";
		expect(sanitizeForKick(plain)).toBe(plain);
	});
});

describe("isSpecialCharsError", () => {
	test("Kick'in özel karakter hatasını tanır", () => {
		const err = new Error(
			'Kick API request failed: 400 {"data":"MAX_SPECIAL_CHARS_ERROR","message":"Bad Request"}'
		);
		expect(isSpecialCharsError(err)).toBe(true);
	});

	test("başka hataları tanımaz", () => {
		expect(isSpecialCharsError(new Error("401 Unauthorized"))).toBe(false);
		expect(isSpecialCharsError(undefined)).toBe(false);
	});
});

// Varsayılanlar zaten sade olmalı; emniyet ağına HİÇ ihtiyaç duyulmamalı.
describe("varsayılan şablonlar", () => {
	const templates = Object.entries(DEFAULT_GAME_CONFIG.reply).filter(
		([key, value]) => key.endsWith("Template") && typeof value === "string"
	) as [string, string][];

	test.each(templates)("%s emoji içermez", (_key, template) => {
		expect(template).toBe(sanitizeForKick(template));
	});

	test("zar sonucu adları da sadedir", () => {
		for (const [key, entry] of Object.entries(dict)) {
			if (!key.startsWith("game.outcome.")) continue;
			expect(entry.tr).toBe(sanitizeForKick(entry.tr));
			expect(entry.en).toBe(sanitizeForKick(entry.en));
		}
	});
});
