/**
 * Kick canli olay soketi icin main ↔ renderer sozlesmesi.
 *
 * 2026-11: Kick sabit Pusher anahtarini kaldirdi. kick.com artik baglanti
 * adresini ve jetonu `web.kick.com/api/v1/realtime/*` uzerinden alip
 * Centrifugo soketine baglaniyor. Pazarlik main process'te yapilir (bu uc
 * noktalar CORS'u yalniz https://kick.com'a acik), soket renderer'da acilir.
 */
export interface KickRealtimeConnection {
	/** Centrifugo websocket adresi (bolgeye gore degisir, orn. us-east-1). */
	url: string;
	/** `connect` komutunda gonderilen, suresi dolan baglanti jetonu. */
	token: string;
	/** Jetonu yenilerken ayni istemci kimligi kullanilir. */
	clientId: string;
}

/**
 * Soket main process'te acilir: Kick'in Centrifugo sunucusu tarayici kokenlerini
 * (file://, localhost) el sikismada reddediyor, Origin gondermeyen tarayici disi
 * istemciyi kabul ediyor. Cerceveler renderer'a bu olaylarla tasinir.
 */
export type RealtimeSocketEvent =
	| { id: string; type: "open" }
	| { id: string; type: "message"; data: string }
	| { id: string; type: "error"; message: string }
	| { id: string; type: "close"; code: number; reason: string };
