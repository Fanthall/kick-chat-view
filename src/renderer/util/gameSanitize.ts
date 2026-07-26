/**
 * Kick chat mesajı temizleme.
 *
 * NEDEN (2026-07-26): Kick `/public/v1/chat` isteği, mesajda çok sayıda özel
 * karakter varsa 400 döndürüyor:
 *
 *   {"data":"MAX_SPECIAL_CHARS_ERROR","message":"Bad Request"}
 *
 * Oyun cevaplarındaki emoji ve tipografik semboller (🎲 · — 🎉 💀) bu sınırı
 * aşıyordu ve bot hiçbir şey yazamıyordu. Varsayılan şablonlar sadeleştirildi;
 * ama kullanıcı şablonu özelleştirebildiği için motorun da bir emniyet ağı
 * olmalı: gönderim bu hatayla dönerse metin sadeleştirilip BİR KEZ yeniden
 * denenir (bkz. gameEngine > deliver).
 *
 * Saf fonksiyonlar — test edilebilir.
 */

/**
 * Emoji, süs sembolleri ve tipografik işaretler. Türkçe harfler (çğıöşü) ve
 * temel noktalama KORUNUR; onlar "özel karakter" değildir.
 */
const DECORATIVE = new RegExp(
	[
		"[\\u{1F300}-\\u{1FAFF}]", // emoji blokları
		"[\\u{2600}-\\u{27BF}]", // muhtelif semboller + dingbat
		"[\\u{FE00}-\\u{FE0F}]", // varyasyon seçiciler
		"[\\u{1F000}-\\u{1F02F}]", // mahjong/domino
		"\\u{20E3}", // keycap
	].join("|"),
	"gu"
);

/** Tipografik işaretler → ASCII karşılığı (anlam kaybı yok). */
const TYPOGRAPHIC: [RegExp, string][] = [
	[/[·•∙]/g, "-"],
	[/[—–]/g, "-"],
	[/[“”„]/g, '"'],
	[/[‘’]/g, "'"],
	[/…/g, "..."],
	[/×/g, "x"],
];

/**
 * Mesajı Kick'in kabul edeceği sade biçime indirir: süs karakterleri atılır,
 * tipografik işaretler ASCII'ye çevrilir, oluşan fazla boşluklar toplanır.
 * Harf/rakam ve anlam KORUNUR.
 */
export const sanitizeForKick = (text: string): string => {
	let out = text.replace(DECORATIVE, "");
	for (const [pattern, replacement] of TYPOGRAPHIC) {
		out = out.replace(pattern, replacement);
	}
	return (
		out
			.replace(/\s{2,}/g, " ")
			// Yalnız virgül ve nokta öncesi boşluk toplanır. `!` ve `?` DIŞARIDA:
			// komut önekleri `!bahis` biçiminde ve "Örnek: !bahis" içindeki boşluk
			// silinirse metin bozulur.
			.replace(/\s+([,.])/g, "$1")
			.trim()
	);
};

/** Kick'in "çok fazla özel karakter" hatası mı? */
export const isSpecialCharsError = (error: unknown): boolean =>
	/MAX_SPECIAL_CHARS_ERROR/i.test(String((error as Error)?.message || error));
