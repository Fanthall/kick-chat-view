/**
 * Kick chat mesajı sadeleştirme — AŞAMALI.
 *
 * NEDEN (2026-07-26): Kick `/public/v1/chat`, mesajda "çok fazla" özel karakter
 * varsa 400 döndürüyor:
 *
 *   {"data":"MAX_SPECIAL_CHARS_ERROR","message":"Bad Request"}
 *
 * Kick hangi karakterleri saydığını ve eşiğin ne olduğunu BELGELEMİYOR. Önce
 * yalnız emoji temizlendi, yetmedi: `> ( ) /` gibi ASCII işaretler de sayılıyor
 * olabilir. Tahmin yürütmek yerine motor aşama aşama sadeleştirip yeniden
 * dener ve KABUL EDİLEN SEVİYEYİ HATIRLAR — sonraki mesajlar doğrudan o
 * seviyeden gider, her mesajda boşuna 3 istek atılmaz.
 *
 * Seviyeler (artan sadelik):
 *   0 — dokunma
 *   1 — emoji + tipografik semboller
 *   2 — süslü ASCII işaretler ( ) > < / | : ; " ' ve binlik ayırıcı
 *   3 — Türkçe harfler ASCII'ye + yalnız harf, rakam, boşluk, virgül
 *
 * Saf fonksiyonlar — test edilebilir.
 */

/** Emoji, süs sembolleri, varyasyon seçiciler. */
const DECORATIVE = new RegExp(
	[
		"[\\u{1F300}-\\u{1FAFF}]",
		"[\\u{2600}-\\u{27BF}]",
		"[\\u{FE00}-\\u{FE0F}]",
		"[\\u{1F000}-\\u{1F02F}]",
		"\\u{20E3}",
	].join("|"),
	"gu"
);

/** Tipografik işaretler → ASCII (anlam kaybı yok). */
const TYPOGRAPHIC: [RegExp, string][] = [
	[/[·•∙]/g, "-"],
	[/[—–]/g, "-"],
	[/[“”„]/g, '"'],
	[/[‘’]/g, "'"],
	[/…/g, "..."],
	[/×/g, "x"],
];

/** Türkçe harf → ASCII karşılığı (yalnız en sade seviyede kullanılır). */
const TURKISH: [RegExp, string][] = [
	[/İ/g, "I"],
	[/ı/g, "i"],
	[/Ş/g, "S"],
	[/ş/g, "s"],
	[/Ğ/g, "G"],
	[/ğ/g, "g"],
	[/Ü/g, "U"],
	[/ü/g, "u"],
	[/Ö/g, "O"],
	[/ö/g, "o"],
	[/Ç/g, "C"],
	[/ç/g, "c"],
];

const tidy = (text: string): string =>
	text
		.replace(/\s{2,}/g, " ")
		// `!` ve `?` DIŞARIDA: komut önekleri `!bahis` biçiminde ve
		// "Örnek: !bahis" içindeki boşluk silinirse metin bozulur.
		.replace(/\s+([,.])/g, "$1")
		.trim();

/** En sade seviye dahil, uygulanabilecek en yüksek aşama. */
export const MAX_SANITIZE_LEVEL = 3;

/**
 * Metni verilen sadelik seviyesine indirir. Seviye 0 metni aynen döndürür.
 * Harf, rakam ve anlam her seviyede korunur; giden yalnız süs ve işarettir.
 */
export const sanitizeForKick = (text: string, level: number): string => {
	if (level <= 0) return text;

	let out = text.replace(DECORATIVE, "");
	for (const [pattern, replacement] of TYPOGRAPHIC) {
		out = out.replace(pattern, replacement);
	}
	if (level === 1) return tidy(out);

	// Seviye 2: süslü ASCII işaretler ve binlik ayırıcı.
	out = out
		// 10.500 → 10500 (nokta da özel karakter sayılıyor olabilir)
		.replace(/(\d)[.](?=\d{3}\b)/g, "$1")
		.replace(/[()<>[\]{}|/\\"'`~^*_=+;:]/g, " ");
	if (level === 2) return tidy(out);

	// Seviye 3: Türkçe harfleri ASCII'ye çevir, kalan işaretleri at.
	for (const [pattern, replacement] of TURKISH) {
		out = out.replace(pattern, replacement);
	}
	out = out.replace(/[^A-Za-z0-9@,\s]/g, " ");
	return tidy(out);
};

/** Kick'in "çok fazla özel karakter" hatası mı? */
export const isSpecialCharsError = (error: unknown): boolean =>
	/MAX_SPECIAL_CHARS_ERROR/i.test(String((error as Error)?.message || error));
