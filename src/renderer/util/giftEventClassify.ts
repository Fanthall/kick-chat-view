/**
 * FIX-GIFT-LEADERBOARD (2026-07-06): Bir Pusher event'i gerçek "hediye sub"
 * event'i mi?
 *
 * chatConnection'ın default/fallback case'i, resmî `App\Events\GiftedSubscriptionsEvent`
 * adıyla GELMEYEN hediye event'lerini de yakalamak için "gift-benzeri" bir
 * heuristik kullanıyordu. Ama salt `/gift/i` isim kontrolü, HEDİYE OLMAYAN
 * `GiftsLeaderboardUpdated` (liderlik tablosu güncellemesi) event'ini de
 * yakalıyordu ("Gift"sLeaderboard). Sonuç: her gerçek hediyede önce leaderboard
 * event'i sahte bir "Gift Sub" rutini ateşliyor + aktivite kaydı üretiyor, ardından
 * gelen GERÇEK GiftedSubscriptionsEvent dedup'la düşüyordu. Ayrıca KICKs "Full Send"
 * gibi leaderboard'ı güncelleyen ama hediye-sub olmayan olaylar sahte gift mesajı
 * atabiliyordu.
 *
 * Bu predicate leaderboard/ranking event'lerini isimden HARİÇ tutar; gerisi eski
 * gift-benzeri heuristik.
 */

/** Hediye OLMAYAN ama adında "gift" geçebilen event'ler (leaderboard/ranking). */
const NON_GIFT_EVENT_NAME = /leaderboard|ranking/i;

export const looksLikeGiftEvent = (
	evtName: string | undefined,
	payload: any
): boolean => {
	const name = evtName ?? "";
	// GiftsLeaderboardUpdated vb. — payload'da gifter-benzeri alan olsa bile gift DEĞİL.
	if (NON_GIFT_EVENT_NAME.test(name)) return false;
	return (
		/gift/i.test(name) ||
		payload?.gifter_username != null ||
		payload?.gifter != null ||
		Array.isArray(payload?.gifted_usernames) ||
		Array.isArray(payload?.gifted_users) ||
		payload?.gifted_username != null
	);
};
