/**
 * Kick mesaj sadeleştirme testleri.
 *
 * REGRESYON (2026-07-26): Kick, özel karakter yoğun mesajı 400
 * MAX_SPECIAL_CHARS_ERROR ile reddediyordu ve bot hiç yazamıyordu. Eşik
 * belgelenmediği için sadeleştirme AŞAMALI: her seviye bir öncekinden daha
 * sade olmalı ve harf/rakam her seviyede korunmalı.
 */

import {
	MAX_SANITIZE_LEVEL,
	isSpecialCharsError,
	sanitizeForKick,
} from "../renderer/util/gameSanitize";
import { DEFAULT_GAME_CONFIG } from "../renderer/util/gameStorage";
import { dict } from "../renderer/util/i18n";

const SPECIAL = /[^A-Za-zÇĞİÖŞÜçğıöşü0-9\s]/g;
const countSpecial = (text: string) => (text.match(SPECIAL) || []).length;

describe("aşamalı sadeleştirme", () => {
	const sample = "@ali 15/20 İyi attın! 2 kat, 500 > 1.000 (bakiye 10.500) 🎲";

	test("seviye 0 metne dokunmaz", () => {
		expect(sanitizeForKick(sample, 0)).toBe(sample);
	});

	test("her seviye bir öncekinden daha sade (özel karakter azalır)", () => {
		let previous = countSpecial(sanitizeForKick(sample, 0));
		for (let level = 1; level <= MAX_SANITIZE_LEVEL; level++) {
			const current = countSpecial(sanitizeForKick(sample, level));
			expect(current).toBeLessThanOrEqual(previous);
			previous = current;
		}
	});

	test("en sade seviyede yalnız harf, rakam, boşluk, virgül ve @ kalır", () => {
		const out = sanitizeForKick(sample, MAX_SANITIZE_LEVEL);
		expect(out).toMatch(/^[A-Za-z0-9@,\s]*$/);
	});

	test("sayılar ve kullanıcı adı her seviyede korunur", () => {
		for (let level = 0; level <= MAX_SANITIZE_LEVEL; level++) {
			const out = sanitizeForKick(sample, level);
			expect(out).toContain("ali");
			expect(out).toContain("15");
			expect(out).toContain("2 kat");
		}
	});

	test("seviye 1 emoji ve tipografik işaretleri temizler", () => {
		expect(sanitizeForKick("a 🎲 b · c — d", 1)).toBe("a b - c - d");
	});

	test("seviye 2 parantez, slash ve binlik ayırıcıyı atar", () => {
		const out = sanitizeForKick("(bakiye 10.500) 15/20", 2);
		expect(out).not.toMatch(/[()/]/);
		expect(out).toContain("10500");
	});

	test("seviye 3 Türkçe harfleri ASCII'ye çevirir", () => {
		expect(sanitizeForKick("İyi attın çğüöş", MAX_SANITIZE_LEVEL)).toBe(
			"Iyi attin cguos"
		);
	});

	test("komut öneki bozulmaz: 'Örnek: !bahis' boşluğu yenmez", () => {
		expect(sanitizeForKick("Ornek: !bahis 500", 1)).toBe("Ornek: !bahis 500");
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

/**
 * REGRESYON: v3'te yalnız kazanç/kayıp metinleri sadeleştirilmişti; `!puan`,
 * `!top`, `!oyun` ve katılma metinleri emoji'li kaldığı için o komutlar hiç
 * cevap üretmiyordu. HİÇBİR varsayılan şablonda emoji kalmamalı.
 */
describe("varsayılan şablonlar", () => {
	const templates = Object.entries(DEFAULT_GAME_CONFIG.reply).filter(
		([key, value]) => typeof value === "string" && key !== "mode"
	) as [string, string][];

	test.each(templates)("%s emoji/tipografik sembol içermez", (_key, template) => {
		expect(template).toBe(sanitizeForKick(template, 1));
	});

	test("zar sonucu adları da sadedir", () => {
		for (const [key, entry] of Object.entries(dict)) {
			if (!key.startsWith("game.outcome.")) continue;
			expect(entry.tr).toBe(sanitizeForKick(entry.tr, 1));
			expect(entry.en).toBe(sanitizeForKick(entry.en, 1));
		}
	});
});
