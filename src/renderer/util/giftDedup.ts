/**
 * FIX-GIFT-DUP (2026-07-05): Tek hediyenin çift işlenmesini engelleyen kısa
 * pencereli dedup.
 *
 * Sorun: Bazı kanallarda Kick tek bir hediye için İKİ ayrı Pusher event'i
 * yayıyor:
 *   1) resmî "App\Events\GiftedSubscriptionsEvent" (alıcı adı dolu)
 *   2) farklı adlı / farklı şekilli "gift-benzeri" event (alıcı adı boş)
 * chatConnection'daki `FIX-GIFT-CAPTURE` fallback'i (resmî event'i GÖNDERMEYEN
 * kanallar için eklenmişti) bu ikinci event'i de yakalayınca aynı hediye hem
 * aktivite listesine iki kez düşüyor hem otomasyon rutini iki kez ateşleniyor
 * (chate çift mesaj).
 *
 * Çözüm: (channelSlug + gifter) için son işlenen hediyenin zamanını tut. Aynı
 * gifter'dan pencere içinde gelen ikinci hediye "duplike" sayılır ve hem
 * dispatch hem otomasyon atlanır. İki event'in ORTAK güvenilir alanları yalnız
 * gifter + zaman olduğu için (biri isimli biri isimsiz, adet/alıcı farklı
 * gelebilir) anahtar SADECE gifter'a dayanır — amount/recipient anahtara
 * KATILMAZ, aksi halde isimli+isimsiz çift yakalanamaz.
 *
 * Not: Resmî event'i GÖNDERMEYEN kanallarda yalnız fallback gelir; ilk gelen o
 * olur ve işlenir — davranış bozulmaz.
 */

/** Aynı gifter'dan bu süre içinde ikinci hediye event'i duplike sayılır. */
export const GIFT_DEDUP_WINDOW_MS = 8000;

const lastGiftAt = new Map<string, number>(); // "slug::gifter".toLowerCase → epoch ms

const dedupKey = (channelSlug: string, gifter: string | undefined) =>
	`${channelSlug}::${gifter ?? "__anon__"}`.toLowerCase();

/**
 * Bu hediye event'i yakın zamanda aynı gifter'dan işlenen bir hediyenin
 * duplikesi mi? true dönerse çağıran hem dispatch'i hem otomasyonu ATLAMALI.
 * false dönerse zaman damgası GÜNCELLENİR (bu event "işlendi" kabul edilir).
 *
 * @param now  Test edilebilirlik için enjekte edilebilir (default Date.now()).
 */
export const isDuplicateGift = (
	channelSlug: string,
	gifter: string | undefined,
	now: number = Date.now()
): boolean => {
	const key = dedupKey(channelSlug, gifter);
	const last = lastGiftAt.get(key);
	if (last !== undefined && now - last < GIFT_DEDUP_WINDOW_MS) {
		return true; // duplike — çağıran atlar
	}
	lastGiftAt.set(key, now);
	return false;
};

/** Test helper — pencere state'ini sıfırla. */
export const __resetGiftDedupForTest = () => {
	lastGiftAt.clear();
};
