/**
 * Sprint 20 — Minimal i18n for the modern shell.
 *
 * Two languages: tr (default) + en. Strings live in a flat key → {tr,en}
 * dictionary. Components call useTranslation() to get t(key) which returns
 * the active-language string (falls back to key when missing).
 *
 * Coverage: most prominent UI strings (topbar / Settings / ModActions /
 * Activity). Long-form / error messages can remain untranslated and migrate
 * incrementally.
 *
 * Storage key: chatViewLanguage = "tr" | "en".
 * Change event: window dispatches "chat-view-language-changed".
 */

import { useEffect, useState } from "react";

export type Language = "tr" | "en";

export const LANGUAGE_STORAGE_KEY = "chatViewLanguage";
export const LANGUAGE_CHANGE_EVENT = "chat-view-language-changed";

export const getLanguage = (): Language => {
	const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
	return stored === "en" ? "en" : "tr";
};

export const setLanguage = (lang: Language) => {
	localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
	window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
};

// ─── Dictionary ──────────────────────────────────────────────────────────────

type Dict = Record<string, { tr: string; en: string }>;

export const dict: Dict = {
	// Topbar
	"topbar.live": { tr: "CANLI", en: "LIVE" },
	"topbar.viewers": { tr: "izleyici", en: "viewers" },
	"topbar.uptime": { tr: "yayın süresi", en: "uptime" },
	"topbar.offline": { tr: "Çevrimdışı", en: "Offline" },
	"topbar.owner": { tr: "Sahip", en: "Owner" },
	"topbar.moderator": { tr: "Moderatör", en: "Moderator" },
	"topbar.viewer": { tr: "İzleyici", en: "Viewer" },
	"topbar.add-channel-short": { tr: "ekle", en: "add" },
	"topbar.no-channel": { tr: "Kanal seçili değil", en: "No channel" },
	"topbar.add-channel": { tr: "Kanal ekle", en: "Add channel" },
	"topbar.close-channel": { tr: "Kanalı kapat", en: "Close channel" },
	"topbar.activity": { tr: "Aktivite", en: "Activity" },
	"topbar.moderation": { tr: "Moderasyon", en: "Moderation" },
	"topbar.emote-picker": { tr: "Emote seçici", en: "Emote picker" },
	"topbar.refresh": { tr: "Yenile", en: "Refresh" },
	"topbar.settings": { tr: "Ayarlar", en: "Settings" },
	"topbar.edit-stream": { tr: "Yayını düzenle", en: "Edit stream" },
	"topbar.more": { tr: "Daha fazla", en: "More" },

	// Activity
	"activity.title": { tr: "Aktivite", en: "Activity" },
	"activity.filter.all": { tr: "Tümü", en: "All" },
	"activity.filter.subs": { tr: "Abone", en: "Subs" },
	"activity.filter.gifts": { tr: "Hediye", en: "Gifts" },
	"activity.filter.kicks": { tr: "KICKs", en: "KICKs" },
	"activity.filter.rewards": { tr: "Ödül", en: "Rewards" },
	"activity.tab.events": { tr: "Olaylar", en: "Events" },
	"activity.tab.leaderboard": { tr: "Liderlik", en: "Leaderboard" },
	"activity.empty": { tr: "Olay yok", en: "No events" },
	"activity.empty-title": { tr: "Sessiz an", en: "Quiet moment" },
	"activity.empty-sub": {
		tr: "Abonelik, hediye ve KICKs olayları burada belirecek.",
		en: "Subscriptions, gifts and KICKs will show up here.",
	},
	"activity.empty-filtered": {
		tr: "Bu filtrede olay yok.",
		en: "No events for this filter.",
	},
	"activity.clear-filter": { tr: "Filtreyi temizle", en: "Clear filter" },
	"activity.raw-json": { tr: "Ham JSON", en: "Raw JSON" },
	"activity.accept": { tr: "Kabul et", en: "Accept" },
	"activity.reject": { tr: "Reddet", en: "Reject" },

	// Moderation
	"mod.title": { tr: "Moderasyon", en: "Moderation" },
	"mod.section.selected": { tr: "Seçili Kullanıcı", en: "Selected User" },
	"mod.section.actions": { tr: "Hızlı aksiyonlar", en: "Quick actions" },
	"mod.section.controls": { tr: "Sohbet kontrolleri", en: "Chat controls" },
	"mod.section.suspended": { tr: "Kısıtlı kullanıcılar", en: "Suspended users" },
	"mod.empty.click-row": {
		tr: "Bir sohbet satırına tıklayıp kullanıcı seç",
		en: "Click a chat row to select a user",
	},
	"mod.empty.viewer": {
		tr: "İzleyici modu — kullanıcı seçip görüntüleyebilir, mod aksiyonlarını okuyabilirsin; ban/timeout yapamazsın.",
		en: "Viewer mode — you can select and view a user and read mod actions; you cannot ban/timeout.",
	},
	"mod.timeout": { tr: "Susturma", en: "Timeout" },
	"mod.timeout.apply": { tr: "Uygula", en: "Apply" },
	"mod.timeout.custom": { tr: "özel", en: "custom" },
	"mod.timeout.seconds": { tr: "sn", en: "sec" },
	"mod.ban": { tr: "Banla", en: "Ban" },
	"mod.ban.permanent": { tr: "kalıcı", en: "permanent" },
	"mod.unban": { tr: "Banı kaldır", en: "Unban" },
	"mod.clear": { tr: "Mesajları temizle", en: "Clear msgs" },
	"mod.note": { tr: "Not ekle", en: "Add note" },
	"mod.promote": { tr: "Yükselt", en: "Promote" },
	"mod.no-suspended": { tr: "Kısıtlı kullanıcı yok", en: "No suspended users" },
	"mod.by-actor": { tr: "tarafından", en: "by" },
	"mod.permanent": { tr: "Kalıcı", en: "Permanent" },

	// Chat composer
	"chat.send": { tr: "Gönder", en: "Send" },
	"chat.placeholder": {
		tr: "Mesaj yaz…  @ ile etiketle, : ile emote ara",
		en: "Write a message…  @ to mention, : to search emotes",
	},
	"chat.reply-to": { tr: "Yanıtla", en: "Reply to" },
	"chat.state.disconnected": {
		tr: "Sohbet bağlantısı koptu, yeniden bağlanılıyor…",
		en: "Chat disconnected, reconnecting…",
	},
	"chat.state.retry": { tr: "Yeniden dene", en: "Retry" },
	"chat.state.empty-title": { tr: "Henüz mesaj yok", en: "No messages yet" },
	"chat.state.empty-sub": {
		tr: "Kanal bağlandı; ilk mesajlar birazdan burada akacak.",
		en: "Connected — the first messages will appear here shortly.",
	},
	"chat.paused": {
		tr: "Otomatik kaydırma duraklatıldı · canlıya atla",
		en: "Auto-scroll paused · jump to live",
	},

	// Settings
	"settings.title": { tr: "Ayarlar", en: "Settings" },
	"settings.nav.channel": { tr: "Kanal", en: "Channel" },
	"settings.nav.account": { tr: "Hesap", en: "Account" },
	"settings.nav.permissions": { tr: "Yetkiler", en: "Permissions" },
	"settings.nav.moderation": { tr: "Moderasyon", en: "Moderation" },
	"settings.nav.emotes": { tr: "Emote", en: "Emotes" },
	"settings.nav.automation": { tr: "Otomasyon", en: "Automation" },
	"settings.nav.game": { tr: "Oyun", en: "Game" },
	"settings.nav.advanced": { tr: "Gelişmiş", en: "Advanced" },
	"settings.nav.aria-label": { tr: "Ayarlar bölümleri", en: "Settings sections" },
	"settings.nav.action-needed": { tr: "İşlem gerekiyor", en: "Action needed" },
	"settings.theme.label": { tr: "Tema", en: "Theme" },
	"settings.theme.dark": { tr: "Koyu", en: "Dark" },
	"settings.theme.light": { tr: "Açık", en: "Light" },
	"settings.language.label": { tr: "Dil", en: "Language" },
	"settings.language.tr": { tr: "Türkçe", en: "Turkish" },
	"settings.language.en": { tr: "İngilizce", en: "English" },

	// Topbar (additional)
	"topbar.close": { tr: "Kapat", en: "Close" },
	"topbar.drawer-close": { tr: "Paneli kapat", en: "Close panel" },

	// Moderation (additional)
	"mod.section.history": { tr: "Mod Aksiyonları", en: "Mod Actions" },
	"mod.history.empty": { tr: "Hiçbir mod aksiyonu kaydedilmedi.", en: "No mod actions recorded." },
	"mod.detail": { tr: "Detay", en: "Detail" },
	"mod.clear-selected": { tr: "Seçimi temizle", en: "Clear selection" },
	"mod.unban.selected": { tr: "Banı kaldır", en: "Unban" },
	"mod.ban.label": { tr: "Ban", en: "Ban" },
	"mod.clear.label": { tr: "Mesajları temizle", en: "Clear msgs" },
	"mod.clear.hint": { tr: "son 30 dk", en: "last 30 min" },
	"mod.note.label": { tr: "Not ekle", en: "Add note" },
	"mod.note.hint": { tr: "modlara görünür", en: "visible to mods" },
	"mod.promote.label": { tr: "Yükselt", en: "Promote" },
	"mod.promote.hint": { tr: "→ VIP", en: "→ VIP" },
	"mod.timeout.label": { tr: "Susturma", en: "Timeout" },
	"mod.timeout.hint": { tr: "Ctrl+T = {dur} · Ctrl+Shift+T = 10m", en: "Ctrl+T = {dur} · Ctrl+Shift+T = 10m" },
	"mod.controls.slow": { tr: "Yavaş mod", en: "Slow mode" },
	"mod.controls.sub": { tr: "Yalnız aboneler", en: "Subscriber only" },
	"mod.controls.follower": { tr: "Yalnız takipçiler", en: "Follower only" },
	"mod.controls.emote": { tr: "Yalnız emote", en: "Emote only" },
	"mod.controls.r9k": { tr: "R9K", en: "R9K" },
	"mod.no-suspended.empty": { tr: "Kısıtlı kullanıcı yok", en: "No suspended users" },
	"mod.suspended.by": { tr: "tarafından", en: "by" },
	"mod.unban.btn": { tr: "Unban", en: "Unban" },

	// Activity (additional)
	"activity.tab.leaderboard-full": { tr: "KICKs Liderlik", en: "KICKs Leaderboard" },
	"activity.expand.event-id": { tr: "Etkinlik ID", en: "Event ID" },
	"activity.expand.actor": { tr: "Aktör", en: "Actor" },
	"activity.expand.created": { tr: "Oluşturuldu", en: "Created" },
	"activity.expand.expires": { tr: "Sona eriyor", en: "Expires" },
	"activity.expand.gift": { tr: "Hediye", en: "Gift" },
	"activity.expand.pinned": { tr: "Sabitlendi", en: "Pinned" },
	"activity.expand.recipients": { tr: "Alıcılar", en: "Recipients" },
	"activity.expand.user-input": { tr: "Kullanıcı girişi", en: "User input" },
	"activity.json.show": { tr: "Ham JSON göster", en: "Show raw JSON" },
	"activity.json.hide": { tr: "Ham JSON gizle", en: "Hide raw JSON" },
	"activity.accept.btn": { tr: "Kabul et", en: "Accept" },
	"activity.reject.btn": { tr: "Reddet", en: "Reject" },

	// Chat (additional)
	"chat.tools.reply": { tr: "Yanıtla", en: "Reply" },
	"chat.tools.pin": { tr: "Sabitle", en: "Pin" },
	"chat.tools.timeout": { tr: "Sustur", en: "Timeout" },
	"chat.tools.remove": { tr: "Sil", en: "Remove" },
	"chat.menu.set-mod-target": { tr: "Moderasyon hedefi yap", en: "Set as mod target" },
	"chat.menu.open-user": { tr: "Kullanıcı detayı aç", en: "Open user detail" },
	"chat.menu.mention": { tr: "Bahset", en: "Mention" },
	"chat.menu.copy-username": { tr: "Kullanıcı adını kopyala", en: "Copy username" },
	"chat.menu.timeout": { tr: "Sustur (varsayılan)", en: "Timeout (default)" },
	"chat.menu.delete": { tr: "Mesajı sil", en: "Delete message" },
	"chat.reply-prefix": { tr: "Yanıtlanıyor:", en: "Replying to" },

	// AddChannelPopover
	"addchannel.title": { tr: "Kanal ekle", en: "Add a channel" },
	"addchannel.placeholder": { tr: "@kanaladi veya URL", en: "@channelname or URL" },
	"addchannel.add": { tr: "Ekle", en: "Add" },
	"addchannel.cancel": { tr: "İptal", en: "Cancel" },

	// UserWindow
	"userwindow.tab.overview": { tr: "Genel Bakış", en: "Overview" },
	"userwindow.tab.messages": { tr: "Mesajlar", en: "Messages" },
	"userwindow.tab.activity": { tr: "Aktivite", en: "Activity" },
	"userwindow.tab.modhistory": { tr: "Mod geçmişi", en: "Mod history" },
	"userwindow.tab.notes": { tr: "Notlar", en: "Notes" },
	"userwindow.status.active": { tr: "Şu an aktif", en: "Active now" },
	"userwindow.status.offline": { tr: "Çevrimdışı", en: "Offline" },
	"userwindow.mod.heading": { tr: "MOD AKSİYONLARI", en: "MOD ACTIONS" },
	"userwindow.mod.timeout": { tr: "Sustur", en: "Timeout" },
	"userwindow.mod.apply": { tr: "Susturmayı uygula", en: "Apply timeout" },
	"userwindow.mod.clear": { tr: "Mesajları temizle", en: "Clear messages" },
	"userwindow.mod.ban": { tr: "Kalıcı olarak banla", en: "Ban permanently" },
	"userwindow.mod.unban": { tr: "Unban", en: "Unban" },
	"userwindow.account.heading": { tr: "HESAP", en: "ACCOUNT" },
	"userwindow.account.joined-channel": { tr: "Kanala katılım", en: "Joined channel" },
	"userwindow.account.joined-kick": { tr: "Kick'e katılım", en: "Joined Kick" },

	// UserWindow (task B1)
	"userwindow.loading": { tr: "Kullanıcı detayları yükleniyor...", en: "Loading user details..." },
	"userwindow.copy": { tr: "Kopyala", en: "Copy" },
	"userwindow.copied": { tr: "Kopyalandı", en: "Copied" },
	"userwindow.copy-failed": { tr: "Başarısız", en: "Failed" },
	"userwindow.copy-username": { tr: "Kullanıcı adını kopyala", en: "Copy username" },
	"userwindow.status.active-title": { tr: "Son mesaj < 5 dk önce", en: "Last message < 5 min ago" },
	"userwindow.status.offline-title": { tr: "Yakın zamanda mesaj yok", en: "No recent messages" },
	"userwindow.subtitle.messages": { tr: "mesaj", en: "messages" },
	"userwindow.subtitle.mod-actions": { tr: "mod aksiyonu", en: "mod actions" },
	"userwindow.sub-badge": { tr: "Abone", en: "Sub" },
	"userwindow.mention-noop": { tr: "Sohbette bahset (devre dışı)", en: "Mention in chat (no-op)" },
	"userwindow.close": { tr: "Kapat", en: "Close" },
	"userwindow.stat.msgs-session": { tr: "bu oturumdaki mesaj", en: "msgs this session" },
	"userwindow.stat.msgs-lifetime": { tr: "toplam mesaj", en: "msgs lifetime" },
	"userwindow.stat.watch-time": { tr: "izleme süresi", en: "watch time" },
	"userwindow.stat.timeouts": { tr: "susturma", en: "timeouts" },
	"userwindow.stat.bans": { tr: "ban", en: "bans" },
	"userwindow.stat.notes": { tr: "not", en: "notes" },
	"userwindow.strip.timeout": { tr: "SUSTURMA", en: "TIMEOUT" },
	"userwindow.ban.title-already": { tr: "Kullanıcı zaten banlı görünüyor", en: "User already appears banned" },
	"userwindow.ban.title-permanent": { tr: "Kalıcı olarak banla", en: "Permanently ban" },
	"userwindow.unban.title": { tr: "Önceki ban'ı kaldır (varsa)", en: "Remove previous ban (if any)" },
	"userwindow.mod.requires-mod": { tr: "Mod aksiyonları için moderatör yetkisi gerekli.", en: "Moderator permission is required for mod actions." },
	"userwindow.card.messages": { tr: "Mesajlar", en: "Messages" },
	"userwindow.card.moderation": { tr: "Moderasyon", en: "Moderation" },
	"userwindow.card.this-session": { tr: "bu oturumda", en: "this session" },
	"userwindow.card.actions": { tr: "aksiyon", en: "actions" },
	"userwindow.empty.no-messages": { tr: "Bu oturumda mesaj yok.", en: "No messages this session." },
	"userwindow.empty.no-mod-actions": { tr: "Moderasyon aksiyonu kaydedilmedi.", en: "No moderation actions captured." },
	"userwindow.empty.no-activity": { tr: "Henüz kullanıcı bazlı aktivite kaydedilmedi.", en: "No per-user activity captured yet." },
	"userwindow.empty.no-notes": { tr: "Henüz not yok. Aşağıdan ekle.", en: "No notes yet. Add one below." },
	"userwindow.notes.placeholder": { tr: "Not ekle...", en: "Add a note..." },
	"userwindow.notes.save": { tr: "Notu kaydet", en: "Save note" },
	"userwindow.msg.delete": { tr: "Sil", en: "Delete" },
	"userwindow.mod.by": { tr: "yapan:", en: "by" },
	"userwindow.mod.system": { tr: "sistem", en: "system" },
	"userwindow.toast.scope-ban": { tr: "Kick moderation:ban yetkisi mevcut değil.", en: "Kick moderation:ban scope is not available." },
	"userwindow.toast.scope-delete": { tr: "Kick moderation:chat_message:manage yetkisi mevcut değil.", en: "Kick moderation:chat_message:manage scope is not available." },
	"userwindow.toast.missing-userid": { tr: "Moderasyon için kullanıcı id'si eksik.", en: "User id is missing for moderation." },
	"userwindow.toast.timeout-positive": { tr: "Susturma süresi > 0 saniye olmalı.", en: "Timeout duration must be > 0 seconds." },
	"userwindow.toast.request-sent": { tr: "isteği gönderildi:", en: "request sent for" },
	"userwindow.toast.request-failed": { tr: "isteği başarısız.", en: "request failed." },
	"userwindow.toast.delete-sent": { tr: "Silme isteği gönderildi.", en: "Delete request sent." },
	"userwindow.toast.delete-failed": { tr: "Silme isteği başarısız.", en: "Delete request failed." },
	"userwindow.mod.type.ban": { tr: "BAN", en: "BAN" },
	"userwindow.mod.type.to": { tr: "SUSTUR", en: "TIMEOUT" },
	"userwindow.mod.type.delete": { tr: "SİL", en: "DELETE" },
	"userwindow.mod.type.unban": { tr: "UNBAN", en: "UNBAN" },
	"userwindow.mod.status.success": { tr: "başarılı", en: "success" },
	"userwindow.mod.status.pending": { tr: "beklemede", en: "pending" },
	"userwindow.mod.status.failed": { tr: "başarısız", en: "failed" },

	// Settings (task B2)
	"settings.channel.title": { tr: "Kanal", en: "Channel" },
	"settings.channel.sub": {
		tr: "İzlediğin veya moderatörlük yaptığın kanallara bağlan. Otomatik bağlanan kanallar chat-view açılışta bağlanır.",
		en: "Connect to channels you watch or moderate. Auto-connect channels open when chat-view launches.",
	},
	"settings.channel.my-channel": { tr: "Kanalım", en: "My channel" },
	"settings.channel.my-badge": { tr: "KANALIM", en: "MY CHANNEL" },
	"settings.channel.active": { tr: "AKTİF", en: "ACTIVE" },
	"settings.channel.connected": { tr: "Bağlı", en: "Connected" },
	"settings.channel.connect": { tr: "Bağlan", en: "Connect" },
	"settings.channel.meta-active": { tr: "açılışta otomatik bağlan · varsayılan yanıt kanalı", en: "auto-connect on launch · default reply channel" },
	"settings.channel.meta-auto": { tr: "otomatik bağlan", en: "auto-connect" },
	"settings.channel.meta-manual": { tr: "Manuel bağlan · yakın zamanda ziyaret edildi", en: "Manual connect · last visited recently" },
	"settings.channel.remove": { tr: "Kaldır", en: "Remove" },
	"settings.channel.add-title": { tr: "Kanal ekle", en: "Add a channel" },
	"settings.channel.add-sub": { tr: "Bir kanal adı veya URL yapıştır.", en: "Paste a channel handle or URL." },
	"settings.channel.add": { tr: "Ekle", en: "Add" },
	"settings.channel.add-input-aria": { tr: "Yeni kanal adı", en: "New channel name" },
	"settings.channel.connecting-toast": { tr: "Bağlanılıyor:", en: "Connecting to" },
	"settings.account.title": { tr: "Hesap", en: "Account" },
	"settings.account.sub": { tr: "Sohbet API'sinde kimlik doğrulamak için kullanılan OAuth bağlantısını yönet.", en: "Manage the OAuth connection used to authenticate with the chat API." },
	"settings.account.connected-as": { tr: "Bağlı:", en: "Connected as" },
	"settings.account.not-connected": { tr: "Bağlı değil", en: "Not connected" },
	"settings.account.ok": { tr: "TAMAM", en: "OK" },
	"settings.account.disconnected": { tr: "BAĞLI DEĞİL", en: "DISCONNECTED" },
	"settings.account.token-expires": { tr: "Token süresi:", en: "Token expires" },
	"settings.account.no-session": { tr: "Aktif oturum yok · ", en: "No active session · " },
	"settings.account.manage-connection": { tr: "Bağlantıyı yönet", en: "Manage connection" },
	"settings.account.sign-out": { tr: "Çıkış yap", en: "Sign out" },
	"settings.account.sign-out-sub": { tr: "Tüm kanalların bağlantısını keser ve yerel oturum durumunu temizler.", en: "Disconnects all channels and clears local session state." },
	"settings.account.signed-out-toast": { tr: "Çıkış yapıldı", en: "Signed out" },
	"settings.account.sign-out-failed-toast": { tr: "Çıkış başarısız", en: "Sign out failed" },
	"settings.account.sign-out-unavailable-toast": { tr: "Çıkış kullanılabilir değil.", en: "Sign out not available." },
	"settings.permissions.title": { tr: "Yetkiler", en: "Permissions" },
	"settings.permissions.sub": { tr: "chat-view'e verilen OAuth kapsamları. Eksik kapsamlar belirli özellikleri sorunsuzca kısıtlar.", en: "OAuth scopes granted to chat-view. Missing scopes degrade specific features gracefully." },
	"settings.permissions.scope-missing-one": { tr: "kapsam eksik.", en: "scope missing." },
	"settings.permissions.scope-missing-many": { tr: "kapsam eksik.", en: "scopes missing." },
	"settings.permissions.reconnect-grant": { tr: "Vermek için yeniden bağlan:", en: "Reconnect to grant:" },
	"settings.permissions.re-authorize": { tr: "Yeniden yetkilendir", en: "Re-authorize" },
	"settings.permissions.granted": { tr: "Verilen", en: "Granted" },
	"settings.permissions.missing": { tr: "Eksik", en: "Missing" },
	"settings.permissions.disables": { tr: "Devre dışı bırakır:", en: "Disables:" },
	"settings.permissions.request": { tr: "İste", en: "Request" },
	"settings.permissions.role-source": { tr: "Rol kaynağı", en: "Role source" },
	"settings.permissions.role-source-sub": { tr: "Kanal rolü API üzerinden doğrulanır; moderatör rozeti gözlenen rozetlerden teyit edilir.", en: "Channel role is verified via API; moderator badge confirmed from observed badges." },
	"settings.permissions.owner": { tr: "SAHİP", en: "OWNER" },
	"settings.permissions.mod": { tr: "MOD", en: "MOD" },
	"settings.permissions.viewer": { tr: "İZLEYİCİ", en: "VIEWER" },
	"settings.moderation.title": { tr: "Moderasyon", en: "Moderation" },
	"settings.moderation.sub": { tr: "Sohbet panelinden moderasyon aksiyonu tetiklediğinde uygulanan varsayılanlar.", en: "Defaults applied when you trigger moderation actions from the chat panel." },
	"settings.moderation.default-timeout": { tr: "Varsayılan susturma", en: "Default timeout" },
	"settings.moderation.default-timeout-sub": { tr: "Susturma butonu ve Ctrl+T tarafından kullanılır.", en: "Used by the timeout button and Ctrl+T." },
	"settings.stepper.decrease": { tr: "Azalt", en: "Decrease" },
	"settings.stepper.increase": { tr: "Artır", en: "Increase" },
	"settings.moderation.seconds": { tr: "saniye", en: "seconds" },
	"settings.moderation.mod-check": { tr: "Mod kontrol mesajı", en: "Mod check message" },
	"settings.moderation.mod-check-sub": { tr: "Bilinmeyen bir kullanıcı susturulduğunda otomatik gönderilen mesaj.", en: "Auto-message when an unknown user is timed out." },
	"settings.moderation.mod-check-input-aria": { tr: "Mod kontrol mesajı", en: "Mod check message" },
	"settings.moderation.sus-title": { tr: "Şüpheli kullanıcılar (elle liste)", en: "Suspicious users (manual list)" },
	"settings.moderation.sus-help": { tr: "Elle izleme listesi — kanaldaki aktif ban/susturma listesi değil. Aktif kısıtlamalar Moderasyon panelinde görülür.", en: "Manual watchlist — not the channel's active ban/timeout list. Active restrictions appear in the Moderation panel." },
	"settings.moderation.sus-empty": { tr: "Listede kimse yok.", en: "The list is empty." },
	"settings.moderation.unban": { tr: "Banı kaldır", en: "Unban" },
	"settings.moderation.blocked-emotes": { tr: "Bloklu emoteler", en: "Blocked emotes" },
	"settings.moderation.blocked-empty": { tr: "Bloklu emote yok.", en: "No blocked emotes." },
	"settings.moderation.unblock": { tr: "Bloğu kaldır", en: "Unblock" },
	"settings.emotes.title": { tr: "Emoteler", en: "Emotes" },
	"settings.emotes.sub": { tr: "Harici sağlayıcılar sohbetteki emote setini genişletir. Sağlayıcı hataları izole edilir ve sohbeti bozmaz.", en: "External providers extend the emote set available in chat. Provider errors are isolated and won't break chat." },
	"settings.emotes.loaded": { tr: "emote yüklendi", en: "loaded" },
	"settings.emotes.refresh": { tr: "Yenile", en: "Refresh" },
	"settings.emotes.refreshing-toast": { tr: "Yenileniyor:", en: "Refreshing" },
	"settings.emotes.favorites": { tr: "Favoriler", en: "Favorites" },
	"settings.emotes.favorites-sub-1": { tr: "emote Favoriler sekmesine ve otomatik tamamlamaya sabitlendi.", en: "pinned to the Favorites tab and autocomplete." },
	"settings.emotes.manage-favorites": { tr: "Favorileri yönet", en: "Manage favorites" },
	"settings.emotes.favorites-toast": { tr: "Emote favori yöneticisi Sprint 6b'de gelecek.", en: "Emote favorites manager coming in Sprint 6b." },
	"settings.emotes.blocked": { tr: "Bloklu emoteler", en: "Blocked emotes" },
	"settings.emotes.blocked-sub": { tr: "sohbetten ve seçiciden gizlendi.", en: "hidden from chat and the picker." },
	"settings.emotes.manage-blocked": { tr: "Bloklananları yönet", en: "Manage blocked" },
	"settings.emotes.blocked-toast": { tr: "Bloklu emoteleri Moderasyon bölümünden yönet.", en: "Manage blocked emotes in the Moderation section." },
	"settings.advanced.title": { tr: "Gelişmiş", en: "Advanced" },
	"settings.advanced.sub": { tr: "Tanılama ve olay abonelik durumu. Çoğu kullanıcının bunlara ihtiyacı olmaz.", en: "Diagnostics and event subscription state. Most users won't need these." },
	"settings.advanced.verbose": { tr: "Ayrıntılı günlük", en: "Verbose logging" },
	"settings.advanced.verbose-sub": { tr: "Ham olay JSON'unu yerel günlük dosyasına yazar. Token'lar gizlenir.", en: "Writes raw event JSON to the local log file. Tokens are redacted." },
	"settings.advanced.open-log": { tr: "Günlük klasörünü aç", en: "Open log directory" },
	"settings.advanced.reveal": { tr: "Göster", en: "Reveal" },
	"settings.advanced.log-dir-toast": { tr: "Günlük klasörü: uygulama veri klasörüne bak.", en: "Log directory: see app data folder." },
	"settings.advanced.followers-title": { tr: "Takipçileri göster", en: "Show followers" },
	"settings.advanced.msg-limit-title": { tr: "Mesaj limiti", en: "Message limit" },
	"settings.advanced.msg-limit-sub": { tr: "Sohbette tutulan en fazla mesaj sayısı (yüksek = daha çok geçmiş, daha çok bellek). 100–5000.", en: "Max messages kept in chat (higher = more history, more memory). 100–5000." },
	"settings.advanced.msg-limit-unit": { tr: "mesaj", en: "msgs" },
	"settings.advanced.followers-sub": { tr: "Kanala yeni takip olduğunda chat akışında ❤ banner ve aktivite kaydı.", en: "Shows a ❤ banner and activity entry in chat when the channel gets a new follow." },
	"settings.advanced.theme-title": { tr: "Tema / Theme", en: "Tema / Theme" },
	"settings.advanced.theme-sub": { tr: "Açık veya koyu görünüm — Modern shell renkleri.", en: "Light or dark appearance — Modern shell colors." },
	"settings.advanced.theme-dark": { tr: "Koyu / Dark", en: "Koyu / Dark" },
	"settings.advanced.theme-light": { tr: "Açık / Light", en: "Açık / Light" },
	"settings.advanced.language-title": { tr: "Dil / Language", en: "Dil / Language" },
	"settings.advanced.language-sub": { tr: "Modern UI metinleri için tercih edilen dil.", en: "Preferred language for Modern UI text." },
	"settings.advanced.language-tr": { tr: "Türkçe", en: "Türkçe" },
	"settings.advanced.language-en": { tr: "English", en: "English" },
	"settings.advanced.theme-radiogroup-aria": { tr: "Tema", en: "Theme" },
	"settings.advanced.language-radiogroup-aria": { tr: "Dil", en: "Language" },
	"settings.update.section-label": { tr: "Güncelleme", en: "Update" },
	"settings.update.version": { tr: "Sürüm", en: "Version" },
	"settings.update.current-prefix": { tr: "mevcut: v", en: "current: v" },
	"settings.update.latest-prefix": { tr: "· son yayın: ", en: "· latest release: " },
	"settings.update.badge.available": { tr: "GÜNCELLEME VAR", en: "UPDATE AVAILABLE" },
	"settings.update.badge.up-to-date": { tr: "GÜNCEL", en: "UP TO DATE" },
	"settings.update.badge.checking": { tr: "KONTROL...", en: "CHECKING..." },
	"settings.update.badge.error": { tr: "AĞ HATASI", en: "NETWORK ERROR" },
	"settings.update.check": { tr: "Kontrol et", en: "Check" },
	"settings.update.download-install": { tr: "İndir ve Kur", en: "Download & Install" },
	"settings.update.open-browser": { tr: "Tarayıcıda aç", en: "Open in browser" },
	"settings.update.open-browser-title": { tr: "Tarayıcıda release sayfasını aç", en: "Open the release page in your browser" },
	"settings.update.restart-install": { tr: "Şimdi yeniden başlat ve kur", en: "Restart and install now" },
	"settings.update.downloading": { tr: "İndiriliyor…", en: "Downloading…" },
	"settings.update.ready": { tr: "✓ Yeni sürüm hazır. Uygulamayı yeniden başlatınca kurulacak.", en: "✓ New version ready. It will install on next restart." },
	"settings.update.download-error": { tr: "⚠ İndirme hatası:", en: "⚠ Download error:" },
	// SCOPE_AFFECTS descriptions
	"settings.scope.chat-write": { tr: "Sohbete mesaj gönder", en: "Send messages in chat" },
	"settings.scope.moderation-ban": { tr: "Kullanıcıları banla / banı kaldır", en: "Ban / unban users" },
	"settings.scope.moderation-manage": { tr: "Sohbet mesajlarını sil", en: "Delete chat messages" },
	"settings.scope.rewards-read": { tr: "Kanal puan ödüllerini görüntüle", en: "View channel point rewards" },
	"settings.scope.rewards-write": { tr: "Ödül taleplerini kabul et/reddet", en: "Accept/reject reward redemptions" },
	"settings.scope.channel-write": { tr: "Yayın başlığını ve kategorisini düzenle", en: "Edit stream title and category" },
	"settings.scope.kicks-read": { tr: "KICKs sıralamasını görüntüle", en: "View KICKs leaderboard" },
	"settings.scope.events-subscribe": { tr: "Webhook olaylarına abone ol", en: "Subscribe to webhook events" },
	"settings.scope.user-read": { tr: "OAuth kullanıcı bilgisini görüntüle", en: "View OAuth user info" },
	"settings.scope.channel-read": { tr: "Kanal bilgisini görüntüle", en: "View channel info" },
	"settings.scope.streamkey-read": { tr: "Yayın anahtarını oku", en: "Read stream key" },

	// Layout / Topbar (task B3)
	"topbar.viewers-title": { tr: "İzleyici", en: "Viewers" },
	"topbar.uptime-title": { tr: "Yayın süresi", en: "Uptime" },
	"topbar.stream-live": { tr: "Yayın canlı", en: "Stream is live" },
	"topbar.mod-badge-observed": { tr: "+ Moderatör rozeti gözlendi", en: "+ Moderator badge observed" },
	"topbar.chat": { tr: "Sohbet", en: "Chat" },
	"topbar.activity-panel": { tr: "Aktivite", en: "Activity" },
	"topbar.moderation-panel": { tr: "Moderasyon", en: "Moderation" },
	"topbar.switch-to": { tr: "Geç:", en: "Switch to" },
	"topbar.close-tab": { tr: "Kapat", en: "Close" },
	"topbar.toggle-activity": { tr: "Aktivite panelini aç/kapat", en: "Toggle activity panel" },
	"topbar.toggle-moderation": { tr: "Moderasyon panelini aç/kapat", en: "Toggle moderation panel" },
	"topbar.refresh-channel": { tr: "Kanal verisini yenile", en: "Refresh channel data" },
	"topbar.open-settings": { tr: "Ayarları aç", en: "Open settings" },
	"topbar.open-separate": { tr: "Ayrı pencerede aç", en: "Open in separate window" },
	"topbar.stream-stats": { tr: "Yayın istatistikleri", en: "Stream stats" },
	"topbar.channel-tabs": { tr: "Kanal sekmeleri", en: "Channel tabs" },

	// Activity (task B4)
	"activity.tag.new": { tr: "YENİ", en: "NEW" },
	"activity.tag.pinned": { tr: "sabit", en: "pinned" },
	"activity.tag.tier": { tr: "kademe", en: "tier" },
	"activity.expand.message": { tr: "Mesaj", en: "Message" },
	"activity.expand.time": { tr: "Saat", en: "Time" },
	"activity.expand.pinned-label": { tr: "Sabitlendi", en: "Pinned" },
	"activity.expand.recipients-label": { tr: "Alıcılar", en: "Recipients" },
	"activity.dbltap-hint": { tr: "Çift tık: kullanıcı detayı", en: "Double-click: user detail" },
	"activity.refresh": { tr: "Yenile", en: "Refresh" },
	"activity.open-new-window": { tr: "Yeni pencerede aç", en: "Open in new window" },
	"activity.collapse": { tr: "Daralt", en: "Collapse" },
	"activity.state.disconnected": {
		tr: "Aktivite bağlantısı koptu, yeniden bağlanılıyor…",
		en: "Activity disconnected, reconnecting…",
	},
	"activity.state.retry": { tr: "Yeniden dene", en: "Retry" },

	// Chat composer (task B5)
	"chat.title": { tr: "Sohbet", en: "Chat" },
	"chat.resume-scroll": { tr: "Kaydırmayı sürdür", en: "Resume scroll" },
	"chat.pause-scroll": { tr: "Kaydırmayı duraklat", en: "Pause scroll" },
	"chat.resume-auto-scroll": { tr: "Otomatik kaydırmayı sürdür", en: "Resume auto-scroll" },
	"chat.pause-auto-scroll": { tr: "Otomatik kaydırmayı duraklat", en: "Pause auto-scroll" },
	"chat.refresh-emotes": { tr: "Emoteleri yenile", en: "Refresh emotes" },
	"chat.connected-as": { tr: "Bağlı:", en: "Connected as" },
	"chat.not-connected": { tr: "Bağlı değil", en: "Not connected" },
	"chat.shortcut-hint": { tr: "⏎ gönder · ⇧⏎ satır · : emote · Ctrl+E seçici · 😀 emoji", en: "⏎ send · ⇧⏎ newline · : emote · Ctrl+E picker · 😀 emoji" },
	"chat.emoji-loading": { tr: "Yükleniyor…", en: "Loading…" },
	"chat.emoji-search": { tr: "Ara...", en: "Search..." },
	"chat.cancel-reply": { tr: "Yanıtı iptal et", en: "Cancel reply" },

	// EmotePicker (task B6)
	"emotepicker.title": { tr: "Emote seçici", en: "Emote picker" },
	"emotepicker.close": { tr: "Emote seçiciyi kapat", en: "Close emote picker" },
	"emotepicker.tab.favorites": { tr: "Favoriler", en: "Favorites" },
	"emotepicker.tab.channel": { tr: "Kanal", en: "Channel" },
	"emotepicker.tab.emoji": { tr: "Kick", en: "Kick" },
	"emotepicker.search": { tr: "Ara:", en: "Search" },
	"emotepicker.search-emotes": { tr: "emote ara", en: "emotes" },
	"emotepicker.no-favorites": { tr: "Henüz favori yok. Favorilemek için bir emote'a sağ tıkla.", en: "No favorites yet. Right-click an emote to favorite." },
	"emotepicker.no-loaded": { tr: "yüklü emote yok.", en: "emotes loaded." },
	"emotepicker.no-match": { tr: "Eşleşen emote yok:", en: "No emotes match" },
	"emotepicker.clear": { tr: "Temizle", en: "Clear" },
	"emotepicker.hover-preview": { tr: "Önizlemek için bir emote'un üzerine gel", en: "Hover an emote to preview" },
	"emotepicker.insert-hint": { tr: "Composer'a eklemek için tıkla.", en: "Click to insert into composer." },
	"emotepicker.right-click": { tr: "Sağ tıkla:", en: "Right-click to" },
	"emotepicker.favorite": { tr: "favorile", en: "favorite" },
	"emotepicker.unfavorite": { tr: "favoriden çıkar", en: "unfavorite" },
	"emotepicker.insert": { tr: "Ekle", en: "Insert" },
	"emotepicker.from-channel": { tr: "kanal", en: "channel" },
	"emotepicker.from-global": { tr: "global set", en: "global set" },
	"emotepicker.from": { tr: "kaynak:", en: "from" },
	"emotepicker.total": { tr: "toplam", en: "total" },
	"emotepicker.refresh-all": { tr: "Tümünü yenile", en: "Refresh all" },
	"emotepicker.refresh-provider": { tr: "Bu sağlayıcıyı yenile", en: "Refresh this provider" },

	// ModActions (task B7)
	"mod.by-prefix": { tr: "yapan @", en: "by @" },
	"mod.status.restricted": { tr: "kısıtlı", en: "restricted" },
	"mod.status.restricted-title": { tr: "Şu an kısıtlı", en: "Currently restricted" },
	"mod.status.suspicious": { tr: "şüpheli", en: "suspicious" },
	"mod.status.suspicious-title": { tr: "Şüpheli kullanıcı", en: "Suspicious user" },
	"mod.meta.messages": { tr: "mesaj", en: "messages" },
	"mod.meta.timeouts": { tr: "susturma", en: "timeouts" },
	"mod.meta.bans": { tr: "ban", en: "bans" },
	"mod.profile": { tr: "Profil", en: "Profile" },
	"mod.section.quick-timeout": { tr: "Hızlı Timeout", en: "Quick Timeout" },
	"mod.aria.timeout-user": { tr: "Kullanıcıyı sustur", en: "Timeout user" },
	"mod.action-tag.timeout": { tr: "SUSTURMA", en: "TIMEOUT" },
	"mod.action-tag.ban": { tr: "BAN", en: "BAN" },
	"mod.action-tag.unban": { tr: "UNBAN", en: "UNBAN" },
	"mod.action-tag.delete": { tr: "SİL", en: "DELETE" },
	"mod.actor.fallback": { tr: "bir moderatör", en: "a moderator" },
	"mod.until.permanent": { tr: "Kalıcı", en: "Permanent" },
	"mod.until.expired": { tr: "süresi doldu", en: "expired" },
	"mod.reason.banned": { tr: "Banlandı", en: "Banned" },
	"mod.reason.timed-out": { tr: "Susturuldu", en: "Timed out" },
	"mod.guard.self": { tr: "Kendine mod aksiyonu yapamazsın.", en: "You cannot moderate yourself." },
	"mod.guard.owner": { tr: "Kanal sahibine mod aksiyonu yapılamaz.", en: "You cannot moderate the channel owner." },
	"mod.guard.protected": { tr: "Bu kullanıcının rolü mod aksiyonlarına karşı korumalı.", en: "This user's role is protected from mod actions." },
	"mod.dblclick-hint": { tr: "Çift tık veya sağ tık: kullanıcı detayını aç", en: "Double-click or right-click: open user detail" },
	"mod.toast.no-user-timeout": { tr: "Susturma için kullanıcı veya kanal seçilmedi.", en: "No user or channel selected for timeout." },
	"mod.toast.no-user-ban": { tr: "Ban için kullanıcı veya kanal seçilmedi.", en: "No user or channel selected for ban." },
	"mod.toast.timeout-positive": { tr: "Susturma süresi > 0 saniye olmalı.", en: "Timeout duration must be > 0 seconds." },
	"mod.toast.unbanned": { tr: "banı kaldırıldı.", en: "unbanned." },
	"mod.toast.unban-failed": { tr: "Banı kaldırma başarısız.", en: "Unban failed." },
	"mod.toast.no-user-id": { tr: "Kanal veya kullanıcı id'si bulunamadı.", en: "Channel or user id not found." },
	"mod.toast.user-info-failed": { tr: "Kullanıcı bilgisi çıkartılamadı.", en: "Could not extract user info." },
	"mod.toast.window-failed": { tr: "Kullanıcı penceresi açılamadı.", en: "Could not open user window." },
	"mod.open-new-window": { tr: "Yeni pencerede aç", en: "Open in new window" },
	"mod.collapse": { tr: "Daralt", en: "Collapse" },

	// Activity row line-text (task: ActivityViewModern i18n)
	"activity.line.anon": { tr: "Anonim", en: "Anonymous" },
	"activity.line.subscribed": { tr: "abone oldu", en: "subscribed" },
	"activity.line.renewed": { tr: "yeniledi", en: "renewed" },
	"activity.line.months": { tr: "ay", en: "mo" },
	"activity.line.streak": { tr: "ay seri", en: "mo streak" },
	"activity.line.gifted-subs": { tr: "abonelik hediye etti", en: "gifted a sub" },
	"activity.line.gift-arrow": { tr: "abonelik hediye etti →", en: "gifted a sub →" },
	"activity.line.someone": { tr: "birine", en: "someone" },
	"activity.line.sent-kicks": { tr: "KICKs gönderdi", en: "sent KICKs" },
	"activity.line.followed": { tr: "takip etti", en: "followed" },
	"activity.line.raided": { tr: "raid yaptı", en: "raided" },
	"activity.line.viewers": { tr: "izleyici", en: "viewers" },
	"activity.line.a-reward": { tr: "bir ödül", en: "a reward" },
	"activity.line.redeemed": { tr: "kullandı", en: "redeemed" },

	// Activity expand summary (task: ActivityViewModern i18n)
	"activity.summary.sub-received-1": { tr: "aylık abonelik", en: "-month subscription" },
	"activity.summary.sub-received-2": { tr: "aldı.", en: "received." },
	"activity.summary.streak-label": { tr: "Seri:", en: "Streak:" },
	"activity.summary.streak-months": { tr: "ay.", en: "months." },
	"activity.summary.renewed-1": { tr: "aboneliğini yeniledi —", en: "renewed their subscription —" },
	"activity.summary.months-dot": { tr: "ay.", en: "mo." },
	"activity.summary.gift-people": { tr: "kişiye", en: "people" },
	"activity.summary.gift-sent": { tr: "hediye abonelik gönderdi", en: "gifted subscriptions" },
	"activity.summary.tier": { tr: "Kademe", en: "Tier" },
	"activity.summary.anon-paren": { tr: "(Anonim)", en: "(Anonymous)" },
	"activity.summary.sent-kicks": { tr: "KICKs gönderdi", en: "sent KICKs" },
	"activity.summary.pinned": { tr: "sabitlendi.", en: "pinned." },
	"activity.summary.raid-into": { tr: "kanalına", en: "raided" },
	"activity.summary.raid-with-viewers": { tr: "izleyici ile", en: "viewers into" },
	"activity.summary.raided": { tr: "raid yaptı.", en: "the channel." },
	"activity.summary.message-label": { tr: "Mesaj:", en: "Message:" },
	"activity.summary.followed-1": { tr: "kanalı", en: "followed" },
	"activity.summary.followed-2": { tr: "takip etti", en: "the channel" },
	"activity.summary.reward-fallback": { tr: "ödülü", en: "the reward" },
	"activity.summary.redeemed-claim": { tr: "talep etti", en: "redeemed" },
	"activity.summary.points": { tr: "puan", en: "points" },

	// Automation section (task: AutomationSection i18n)
	// Template variable hints
	"automation.ph.username": { tr: "Olayı tetikleyen kullanıcı", en: "User who triggered the event" },
	"automation.ph.amount": { tr: "KICKs / sub sayısı", en: "KICKs / sub count" },
	"automation.ph.months": { tr: "Abonelik ay sayısı", en: "Subscription month count" },
	"automation.ph.tier": { tr: "Sub tier (varsa)", en: "Sub tier (if any)" },
	"automation.ph.message": { tr: "Chat mesajı", en: "Chat message" },
	"automation.ph.channel": { tr: "Kanal slug", en: "Channel slug" },
	"automation.ph.reward": { tr: "Reward başlığı", en: "Reward title" },

	"automation.title": { tr: "Otomasyon Rutinleri", en: "Automation Routines" },
	"automation.desc": {
		tr: "Chat olaylarına otomatik yanıt verecek kuralları yönet.",
		en: "Manage rules that automatically respond to chat events.",
	},
	"automation.new-rule": { tr: "+ Yeni rutin", en: "+ New routine" },
	"automation.quick-templates": { tr: "Hızlı şablonlar", en: "Quick templates" },
	"automation.template-start": { tr: "şablonundan başla", en: "template — start from here" },
	"automation.empty": {
		tr: "Henüz rutin yok. Üstten bir şablon seç veya",
		en: "No routines yet. Pick a template above or",
	},
	"automation.empty-start": { tr: "ile başla.", en: "to begin." },
	"automation.unnamed": { tr: "(adsız rutin)", en: "(unnamed routine)" },
	"automation.active": { tr: "Aktif", en: "Active" },
	"automation.passive": { tr: "Pasif", en: "Inactive" },
	"automation.edit": { tr: "Düzenle", en: "Edit" },
	"automation.delete": { tr: "Sil", en: "Delete" },
	"automation.cooldown-tip": {
		tr: "Çalıştıktan sonra yeniden tetiklenmeden önceki bekleme süresi",
		en: "Wait time after firing before it can trigger again",
	},
	"automation.wait-suffix": { tr: "sn bekle", en: "s cooldown" },

	// Channel chips
	"automation.channels-empty": {
		tr: "Henüz kanal eklenmemiş — bu rutin tüm bağlanılan kanallarda çalışır.",
		en: "No channels added yet — this routine runs on all connected channels.",
	},
	"automation.all-channels": { tr: "Tüm kanallar", en: "All channels" },
	"automation.all-channels-tip": { tr: "Tüm kanallarda çalış", en: "Run on all channels" },

	// Editor: top
	"automation.name-placeholder": { tr: "Rutin adı", en: "Routine name" },
	"automation.cooldown-label": { tr: "Bekleme", en: "Cooldown" },
	"automation.editor-cooldown-tip": {
		tr: "Rutin bir kez çalıştıktan sonra, bu süre boyunca yeniden tetiklenmez. Spam koruması için.",
		en: "After the routine fires once, it won't trigger again for this duration. Spam protection.",
	},
	"automation.unit-sec": { tr: "sn", en: "s" },
	"automation.unit-min": { tr: "dk", en: "min" },
	"automation.cd-hint-1": { tr: "Bekleme süresi: rutin çalıştıktan sonra", en: "Cooldown: after the routine fires," },
	"automation.cd-hint-2": { tr: "boyunca tekrar tetiklenmez.", en: "it won't trigger again for this long." },
	"automation.cd-hint-zero": {
		tr: "0 = sınırsız spam, dikkatli kullan.",
		en: "0 = unlimited spam, use with care.",
	},

	// Editor: fields
	"automation.field.channels": { tr: "Hangi kanallarda çalışsın?", en: "Which channels should it run on?" },
	"automation.field.trigger": { tr: "Ne zaman tetiklensin?", en: "When should it trigger?" },
	"automation.field.action": { tr: "Ne yapsın?", en: "What should it do?" },
	"automation.field.match-text": { tr: "Aranan metin veya emote", en: "Text or emote to match" },
	"automation.match-placeholder": { tr: "örn: merhaba veya [emote:...]", en: "e.g. hello or [emote:...]" },
	"automation.emote-btn": { tr: "😀 emote", en: "😀 emote" },
	"automation.case-insensitive": { tr: "Büyük/küçük harfi yoksay", en: "Ignore case" },
	"automation.regex": { tr: "Regex", en: "Regex" },
	"automation.field.which-mention": { tr: "Hangi kullanıcı etiketleninince?", en: "Which user, when mentioned?" },
	"automation.mention-placeholder": { tr: "Boş = kendi kullanıcı adın", en: "Empty = your own username" },
	"automation.field.min-kicks": { tr: "En az kaç KICKs?", en: "Minimum KICKs?" },
	"automation.field.sub-type": { tr: "Hangi abonelik tipinde?", en: "Which subscription type?" },
	"automation.sub.new": { tr: "Yeni abone", en: "New sub" },
	"automation.sub.renewal": { tr: "Yenileme", en: "Renewal" },
	"automation.sub.any": { tr: "Hepsi", en: "All" },
	"automation.sub-hint": {
		tr: "Yeni: ilk kez abone olanlar. Yenileme: aboneliğini uzatanlar (1 aydan fazla). Hepsi: ikisinde de tetiklenir.",
		en: "New: first-time subscribers. Renewal: those extending a sub (over 1 month). All: triggers on both.",
	},
	"automation.gift-sub-behavior": { tr: "Hediye sub davranışı", en: "Gift sub behavior" },
	"automation.gift-sub-toggle": { tr: "Hediye olarak gelen sub'ları da tetikle", en: "Also trigger for gifted subs" },
	"automation.gift-sub-on": {
		tr: "Açık: hem direkt sub hem de hediye alan kullanıcılar için çalışacak. Eğer ayrıca bir \"Hediye sub\" rutinin varsa çift mesaj riski var.",
		en: "On: fires for both direct subs and users who received a gift. If you also have a \"Gift sub\" routine, there's a double-message risk.",
	},
	"automation.gift-sub-off": {
		tr: "Kapalı (önerilen): sadece kendi parasıyla abone olanlar tetikler. Hediye olarak sub alan kullanıcılar için sadece \"Hediye sub\" rutini çalışır.",
		en: "Off (recommended): only self-paid subscribers trigger it. Users who received a gifted sub only fire the \"Gift sub\" routine.",
	},
	"automation.field.frequency": { tr: "Hangi sıklıkla?", en: "How often?" },
	"automation.interval.live-hint": {
		tr: "Live-only: kanal yayında değilse mesaj atılmaz. Yayın açılınca {min} dakikada bir tekrar eder.",
		en: "Live-only: no message is sent while the channel is offline. Once live, it repeats every {min} minutes.",
	},
	"automation.interval.always-hint": {
		tr: "Sürekli: kanal offline olsa bile {min} dakikada bir çalışır.",
		en: "Always: runs every {min} minutes even if the channel is offline.",
	},
	"automation.live-only": { tr: "Sadece kanal yayında (live) iken çalış", en: "Only run while the channel is live" },
	"automation.fire-immediately": {
		tr: "Hemen ilk mesajı at (default: önce bekle, sonra at)",
		en: "Send the first message immediately (default: wait first, then send)",
	},
	"automation.interval.live-on": {
		tr: "kanal yayında değilse mesaj atılmaz. Yayın açılınca",
		en: "no message is sent while the channel is offline. Once live, it repeats every",
	},
	"automation.interval.live-on-suffix": { tr: "dakikada bir tekrar eder.", en: "minutes." },
	"automation.interval.always": { tr: "kanal offline olsa bile", en: "runs every" },
	"automation.interval.always-suffix": { tr: "dakikada bir çalışır.", en: "minutes even if the channel is offline." },
	"automation.interval.live-label": { tr: "Live-only:", en: "Live-only:" },
	"automation.interval.always-label": { tr: "Sürekli:", en: "Always:" },
	"automation.interval.needs-channel": {
		tr: "⚠ Zamanlı rutin için en az 1 kanal seçmelisin (üstteki \"Hangi kanallarda\" alanından).",
		en: "⚠ A scheduled routine needs at least 1 channel (from the \"Which channels\" field above).",
	},
	"automation.field.reward-title": { tr: "Reward başlığı (boş = hepsi)", en: "Reward title (empty = all)" },
	"automation.field.reward-title-placeholder": { tr: "Mesajımı öne çıkar", en: "Highlight My Message" },
	"automation.field.msg-to-send": { tr: "Gönderilecek mesaj", en: "Message to send" },
	"automation.field.toast-text": { tr: "Bildirim metni", en: "Notification text" },
	"automation.msg-placeholder-thanks": { tr: "Teşekkürler {username}!", en: "Thanks {username}!" },
	"automation.msg-placeholder-hi": { tr: "Selam {username}!", en: "Hi {username}!" },

	// Multi-message / tiered repeat
	"automation.multi.title": { tr: "Çok mesaj (hediye adedine göre)", en: "Multiple messages (by gift count)" },
	"automation.multi.toggle-hint-1": {
		tr: "Kapalı = her hediyede tek mesaj (varsayılan). Açık = hediye adedine göre kademeli, en fazla",
		en: "Off = one message per gift (default). On = tiered by gift count, up to",
	},
	"automation.multi.toggle-hint-2": { tr: "mesaj.", en: "messages." },
	"automation.multi.delay": { tr: "Mesajlar arası bekleme (sn)", en: "Delay between messages (s)" },
	"automation.multi.cap": { tr: "Tavan (maks. mesaj)", en: "Cap (max messages)" },
	"automation.multi.tier-min": { tr: "Hediye adedi ≥", en: "Gift count ≥" },
	"automation.multi.tier-count": { tr: "Mesaj sayısı", en: "Message count" },
	"automation.multi.remove-tier": { tr: "Satırı sil", en: "Remove row" },
	"automation.multi.add-tier": { tr: "+ eşik ekle", en: "+ add tier" },
	"automation.multi.example": {
		tr: "Örn. hediye 5 → 2 mesaj, 10 → 3 mesaj. Sayı tavanı geçemez. Yalnız hediye (gift sub) rutininde etkilidir.",
		en: "E.g. 5 gifts → 2 messages, 10 → 3 messages. Count can't exceed the cap. Only affects gift-sub routines.",
	},

	// Editor: footer
	"automation.save": { tr: "Kaydet", en: "Save" },
	"automation.cancel": { tr: "İptal", en: "Cancel" },

	// Templates
	"automation.tpl.sub-thanks.label": { tr: "Sub'a teşekkür", en: "Thank a sub" },
	"automation.tpl.sub-thanks.name": { tr: "Sub'a teşekkür", en: "Thank a sub" },
	"automation.tpl.sub-thanks.content": {
		tr: "Teşekkürler {username}! Abonelik için sevgiler 💚",
		en: "Thanks {username}! Love for the sub 💚",
	},
	"automation.tpl.follow.label": { tr: "Yeni takipçi", en: "New follower" },
	"automation.tpl.follow.name": { tr: "Yeni takipçi karşılama", en: "New follower welcome" },
	"automation.tpl.follow.content": {
		tr: "Hoş geldin, takip ettiğin için sağol!",
		en: "Welcome, and thanks for the follow!",
	},
	"automation.tpl.mention.label": { tr: "Mention yanıtı", en: "Mention reply" },
	"automation.tpl.mention.name": { tr: "Etiketlenince yanıt", en: "Reply when mentioned" },
	"automation.tpl.mention.content": { tr: "Buradayım {username}!", en: "I'm here {username}!" },
	"automation.tpl.discord.label": { tr: "Discord komutu", en: "Discord command" },
	"automation.tpl.discord.name": { tr: "!discord komutu", en: "!discord command" },
	"automation.tpl.discord.content": { tr: "Discord: https://discord.gg/xxxxx", en: "Discord: https://discord.gg/xxxxx" },
	"automation.tpl.interval.label": { tr: "30dk'da bir hatırlatma", en: "Reminder every 30m" },
	"automation.tpl.interval.name": { tr: "30 dakikalık hatırlatma", en: "30-minute reminder" },
	"automation.tpl.interval.content": {
		tr: "Beğenmeyi ve takip etmeyi unutmayın 💚",
		en: "Don't forget to like and follow 💚",
	},

	// Interval presets
	"automation.interval-preset.15m": { tr: "15 dk", en: "15 min" },
	"automation.interval-preset.30m": { tr: "30 dk", en: "30 min" },
	"automation.interval-preset.1h": { tr: "1 saat", en: "1 hour" },
	"automation.interval-preset.2h": { tr: "2 saat", en: "2 hours" },

	// Validation toasts
	"automation.toast.name-required": { tr: "Rutinin bir adı olmalı.", en: "The routine must have a name." },
	"automation.toast.content-required": { tr: "Mesaj içeriği boş olamaz.", en: "Message content can't be empty." },
	"automation.toast.channel-required": {
		tr: "Zamanlı rutin için en az 1 kanal seçmelisin (Hangi kanallarda alanından).",
		en: "A scheduled routine needs at least 1 channel (from the Which channels field).",
	},
	"automation.toast.saved": { tr: "Rutin kaydedildi.", en: "Routine saved." },
	"automation.confirm.delete": {
		tr: "Bu rutini silmek istediğine emin misin?",
		en: "Are you sure you want to delete this routine?",
	},

	// Trigger labels (dropdown + row pill)
	"automation.trigger.chat_match": { tr: "Chat mesajı", en: "Chat message" },
	"automation.trigger.mention": { tr: "Etiketleme (@)", en: "Mention (@)" },
	"automation.trigger.sub_event": { tr: "Yeni abone", en: "New subscriber" },
	"automation.trigger.gift_sub_event": { tr: "Hediye sub", en: "Gift sub" },
	"automation.trigger.follow_event": { tr: "Yeni takipçi", en: "New follower" },
	"automation.trigger.kicks_event": { tr: "KICKs bağışı", en: "KICKs donation" },
	"automation.trigger.host_event": { tr: "Host / raid", en: "Host / raid" },
	"automation.trigger.reward_redeemed": { tr: "Channel point reward", en: "Channel point reward" },
	"automation.trigger.interval": { tr: "Zamanlı (her X dakika)", en: "Scheduled (every X minutes)" },

	// Action labels (dropdown)
	"automation.action.send_message": { tr: "Chat'e mesaj gönder", en: "Send a chat message" },
	"automation.action.send_toast": { tr: "Bana bildirim göster", en: "Show me a notification" },

	// Faz 8 — i18n coverage sweep (aria-label / title / badge strings)
	"emotepicker.close-esc": { tr: "Kapat (Esc)", en: "Close (Esc)" },
	"emotepicker.tag.zero-width": { tr: "Sıfır genişlik", en: "Zero-width" },
	"emotepicker.tag.subscriber": { tr: "Abone", en: "Subscriber" },
	"emotepicker.provider.kick-emotes": { tr: "Kick emoteleri", en: "Kick emotes" },
	"emotepicker.provider.7tv-emotes": { tr: "7TV emoteleri", en: "7TV emotes" },

	"mod.aria.custom-timeout-seconds": { tr: "Özel susturma süresi (saniye)", en: "Custom timeout seconds" },
	"mod.aria.open-new-window": { tr: "Moderasyon panelini yeni pencerede aç", en: "Open moderation panel in new window" },
	"mod.aria.close-panel": { tr: "Moderasyon panelini kapat", en: "Close moderation panel" },
	"mod.aria.clear-selected": { tr: "Seçili kullanıcıyı temizle", en: "Clear selected user" },
	"mod.aria.ban-user": { tr: "Kullanıcıyı banla", en: "Ban user" },
	"mod.aria.add-note": { tr: "Not ekle", en: "Add note" },
	"mod.aria.promote-user": { tr: "Kullanıcıyı yükselt", en: "Promote user" },

	"chat.aria.message-actions": { tr: "Mesaj aksiyonları", en: "Message actions" },
	"chat.aria.messages": { tr: "Sohbet mesajları", en: "Chat messages" },
	"chat.aria.mention-suggestions": { tr: "Etiketleme önerileri", en: "Mention suggestions" },
	"chat.aria.commands": { tr: "Sohbet komutları", en: "Chat commands" },
	"chat.aria.message-input": { tr: "Sohbet mesajı girişi", en: "Chat message input" },
	"chat.aria.emoji-title": { tr: "Emoji (😀)", en: "Emoji (😀)" },
	"chat.aria.open-emoji": { tr: "Emoji seçiciyi aç", en: "Open emoji picker" },
	"chat.aria.emote-title": { tr: "Emote seçici (Ctrl+E)", en: "Emote picker (Ctrl+E)" },
	"chat.aria.open-emote": { tr: "Emote seçiciyi aç", en: "Open emote picker" },
	"chat.aria.emoji-picker": { tr: "Emoji seçici", en: "Emoji picker" },

	"emotepicker.aria.suggestions": { tr: "Emote önerileri", en: "Emote suggestions" },

	"activity.aria.accept-reward": { tr: "Ödül talebini kabul et", en: "Accept reward redemption" },
	"activity.aria.reject-reward": { tr: "Ödül talebini reddet", en: "Reject reward redemption" },
	"activity.aria.leaderboard-period": { tr: "Sıralama dönemi", en: "Leaderboard period" },
	"activity.aria.refresh-leaderboard": { tr: "Sıralamayı yenile", en: "Refresh leaderboard" },
	"activity.aria.refresh-activity": { tr: "Aktiviteyi yenile", en: "Refresh activity" },
	"activity.aria.open-new-window": { tr: "Aktivite panelini yeni pencerede aç", en: "Open activity panel in new window" },
	"activity.aria.collapse": { tr: "Aktivite panelini daralt", en: "Collapse activity panel" },
	"activity.aria.sub-tabs": { tr: "Aktivite alt sekmeleri", en: "Activity sub-tabs" },
	"activity.leaderboard.empty": { tr: "Henüz KICKs aktivitesi yok", en: "No KICKs activity yet" },
	"activity.leaderboard.period.week": { tr: "Hafta", en: "Week" },
	"activity.leaderboard.period.month": { tr: "Ay", en: "Month" },
	"activity.leaderboard.period.lifetime": { tr: "Tüm zamanlar", en: "Lifetime" },
	"activity.leaderboard.retry": { tr: "Yeniden dene", en: "Retry" },
	"activity.leaderboard.scope-required-1": { tr: "KICKs sıralaması", en: "KICKs leaderboard requires" },
	"activity.leaderboard.scope-required-perm": { tr: "yetkisi gerektirir.", en: "permission." },
	"activity.leaderboard.scope-hint": { tr: "Ayarlar → Yetkiler bölümünden KICKs yetkisiyle bağlan.", en: "Connect with KICKs permission in Settings → Permissions." },

	// ─── Sprint 61: Bahis oyunu ───────────────────────────────────────────────
	"game.title": { tr: "Bahis Oyunu", en: "Betting Game" },
	"game.desc": {
		tr: "İzleyiciler chatten bahis oynar. Her yayın herkes aynı puanla başlar; puanların nakit karşılığı yoktur.",
		en: "Viewers bet from chat. Everyone starts each stream with the same points; points have no cash value.",
	},

	"game.general": { tr: "Genel", en: "General" },
	"game.enabled": { tr: "Oyunu aç", en: "Enable game" },
	"game.enabled-sub": {
		tr: "Kapalıyken komutlar tamamen yok sayılır.",
		en: "While off, commands are ignored entirely.",
	},
	"game.require-join": { tr: "Katılım zorunlu", en: "Require joining" },
	"game.require-join-sub": {
		tr: "Oyuncu katılma komutunu yazmadan puan almaz. Kapatılırsa ilk bahiste otomatik hesap açılır.",
		en: "Players get no points until they type the join command. Turn off to open an account on the first bet.",
	},
	"game.live-only": { tr: "Yalnız yayın açıkken", en: "Only while live" },
	"game.live-only-sub": {
		tr: "Yayın kapanınca puanlar sıfırlanır ve yeni yayın sıfırdan başlar.",
		en: "Points reset when the stream ends, and the next stream starts fresh.",
	},
	"game.channels": { tr: "Kanallar", en: "Channels" },
	"game.channels-sub": {
		tr: "Oyunun çalışacağı kanalları seç.",
		en: "Pick the channels where the game runs.",
	},
	"game.channels-all": {
		tr: "Hiçbiri seçili değil — oyun tüm kanallarda çalışır.",
		en: "None selected — the game runs on every channel.",
	},
	"game.channels-none": { tr: "Kayıtlı kanal yok", en: "No saved channels" },

	"game.economy": { tr: "Ekonomi", en: "Economy" },
	"game.starting": { tr: "Başlangıç puanı", en: "Starting points" },
	"game.starting-sub": {
		tr: "Her oyuncunun yayın başına aldığı puan.",
		en: "Points each player receives per stream.",
	},
	"game.min-bet": { tr: "En az bahis", en: "Minimum bet" },
	"game.max-bet": { tr: "En çok bahis", en: "Maximum bet" },
	"game.max-bet-sub": { tr: "0 = sınırsız", en: "0 = unlimited" },
	"game.payout": { tr: "Ödeme kademeleri", en: "Payout tiers" },
	"game.payout-sub": {
		tr: "Sonuç sabit değil: önce kazanç/kayıp belirlenir, sonra kademe ağırlıklı çekilişle seçilir. Sayılar o kademenin ihtimal ağırlığıdır — çarpanın kendisi değil.",
		en: "Outcomes are not fixed: the win/loss side is decided first, then a tier is drawn by weight. The numbers are each tier's probability weight, not the multiplier.",
	},
	"game.status": { tr: "Bot durumu", en: "Bot status" },
	"game.status-sub": {
		tr: "Cevap chate gitmiyorsa nedeni burada yazar.",
		en: "If replies are not reaching chat, the reason shows here.",
	},
	"game.status.idle": { tr: "Henüz komut işlenmedi", en: "No command handled yet" },
	"game.status.ok": { tr: "✓ Chate yazıyor", en: "✓ Posting to chat" },
	"game.status.silent_mode": {
		tr: "⚠ Cevap modu «sessiz»",
		en: "⚠ Reply mode is “silent”",
	},
	"game.status.not_live": {
		tr: "⚠ Yayın kapalı (yalnız yayında çalışır)",
		en: "⚠ Stream offline (runs only while live)",
	},
	"game.status.no_broadcaster_id": {
		tr: "⚠ Kanal kimliği çözülemedi — Kick bağlantısını kontrol et",
		en: "⚠ Could not resolve channel — check the Kick connection",
	},
	"game.status.send_failed": {
		tr: "⚠ Kick mesajı reddetti",
		en: "⚠ Kick rejected the message",
	},
	"game.status.disabled": { tr: "Oyun kapalı", en: "Game disabled" },
	"game.payout.win": { tr: "Kazanç", en: "Win" },
	"game.payout.loss": { tr: "Kayıp", en: "Loss" },
	"game.payout.edge": { tr: "Ev avantajı", en: "House edge" },
	"game.payout.edge-warn": {
		tr: "oyuncu lehine — ağırlıkları düşür",
		en: "favours players — lower the weights",
	},
	"game.chat-reward": { tr: "Sohbet ödülü", en: "Chat reward" },
	"game.chat-reward-sub": {
		tr: "Oyuna katılmış izleyici chate her yazdığında sessizce puan kazanır — bot bunu duyurmaz. Bekleme veya uzunluk şartı yoktur; tek sınır oturum başına toplam tavandır.",
		en: "Players who joined the game earn points silently for every chat message — the bot never announces it. There is no cooldown or length requirement; the only limit is the per-session cap.",
	},
	"game.chat-reward.per-message": {
		tr: "Mesaj başına puan",
		en: "Points per message",
	},
	"game.chat-reward.cap": { tr: "Oturum tavanı", en: "Session cap" },
	"game.cooldown": { tr: "Bekleme (sn)", en: "Cooldown (s)" },
	"game.cooldown-sub": {
		tr: "Aynı oyuncunun iki bahsi arasındaki en az süre.",
		en: "Minimum time between one player's bets.",
	},
	"game.session-limit": { tr: "Yayın başına bahis hakkı", en: "Bets per stream" },
	"game.session-limit-sub": { tr: "0 = sınırsız", en: "0 = unlimited" },

	"game.curve": { tr: "Kazanma eğrisi", en: "Win curve" },
	"game.curve-desc": {
		tr: "Kazanma şansı sabit değildir: ilk bahisler yüksek şansla başlar, oyuncu devam ettikçe ve bakiyesi büyüdükçe düşer.",
		en: "Win chance is not fixed: the first bets start high, then fall as a player keeps going and their balance grows.",
	},
	"game.preset": { tr: "Hazır ayar", en: "Preset" },
	"game.preset-sub": {
		tr: "Aşağıdaki önizleme seçime göre anında güncellenir.",
		en: "The preview below updates instantly with your choice.",
	},
	"game.preset.generous": { tr: "Cömert", en: "Generous" },
	"game.preset.balanced": { tr: "Dengeli", en: "Balanced" },
	"game.preset.casino": { tr: "Kumarhane", en: "Casino" },

	"game.sim.title": { tr: "Bu ayarla ne olur?", en: "What happens with these settings?" },
	"game.sim.hint": {
		tr: "1.000 sanal oyuncu · 20 bahis",
		en: "1,000 simulated players · 20 bets",
	},
	"game.sim.aria": {
		tr: "Bahis sırasına göre ortalama bakiye eğrisi",
		en: "Average balance by bet number",
	},
	"game.sim.start-line": { tr: "başlangıç", en: "start" },
	// Sıra sayısı dillerde farklı kurulur ("3. bahis" ≠ "bet 3") — yer tutuculu tek anahtar.
	"game.sim.bet-n": { tr: "{n}. bahis", en: "bet {n}" },
	"game.sim.peak-mark": { tr: "zirve", en: "peak" },
	"game.sim.peak": { tr: "Ortalama zirve", en: "Average peak" },
	"game.sim.final": { tr: "20 bahis sonunda", en: "After 20 bets" },
	"game.sim.profitable": { tr: "Kârda bitiren", en: "Finish in profit" },

	"game.cycle": { tr: "Şans döngüsü (dk)", en: "Luck cycle (min)" },
	"game.cycle-sub": {
		tr: "Bu sürenin sonunda herkesin kazanma şansı yeniden başa döner; puanlar korunur. Uzun oynayan sonsuza kadar kaybetmez. 0 = kapalı.",
		en: "At the end of this period everyone's win chance starts over; points are kept. Long-running players don't lose forever. 0 = off.",
	},
	"game.advanced": { tr: "Gelişmiş ayarlar", en: "Advanced settings" },
	"game.advanced-sub": {
		tr: "Eğriyi elle ayarla. Hazır ayarlar çoğu yayın için yeterlidir.",
		en: "Tune the curve by hand. The presets cover most streams.",
	},
	"game.curve.base": { tr: "Başlangıç şansı", en: "Base chance" },
	"game.curve.base-sub": {
		tr: "İlk bahislerin kazanma olasılığı.",
		en: "Win probability on the first bets.",
	},
	"game.curve.hotbets": { tr: "Cezasız bahis sayısı", en: "Penalty-free bets" },
	"game.curve.hotbets-sub": {
		tr: "İlk kaç bahis tam şansla oynanır.",
		en: "How many opening bets keep the full chance.",
	},
	"game.curve.depthstep": { tr: "Bahis başına düşüş", en: "Drop per bet" },
	"game.curve.depthstep-sub": {
		tr: "Cezasız bahisler bittikten sonra her bahiste düşen olasılık.",
		en: "Probability lost on each bet once the penalty-free ones are used up.",
	},
	"game.curve.depthcap": { tr: "En çok düşüş", en: "Maximum drop" },
	"game.curve.depthcap-sub": {
		tr: "Israrın toplam bedeli. Yükseltmek ısrar edeni daha sert erozyona uğratır.",
		en: "Total cost of persistence. Raising it erodes persistent players faster.",
	},
	"game.curve.greedfactor": { tr: "Zenginlik cezası", en: "Wealth penalty" },
	"game.curve.greedfactor-sub": {
		tr: "Bakiye başlangıcın iki katına çıktığında düşen olasılık.",
		en: "Probability lost when a balance reaches twice the starting points.",
	},
	"game.curve.floor": { tr: "En düşük şans", en: "Chance floor" },
	"game.curve.floor-sub": {
		tr: "Kazanma şansı bunun altına inmez.",
		en: "Win chance never drops below this.",
	},
	"game.curve.mercy": { tr: "Merhamet bonusu", en: "Mercy bonus" },
	"game.curve.mercy-sub": {
		tr: "Bakiyesi dibe vuran oyuncuya eklenen şans — oyuncu tamamen kopmasın.",
		en: "Extra chance for a player who has bottomed out, so they stay in the game.",
	},

	"game.commands": { tr: "Komutlar", en: "Commands" },
	"game.prefix": { tr: "Komut ön eki", en: "Command prefix" },
	"game.prefix-sub": {
		tr: "Komutların başındaki işaret.",
		en: "The character commands start with.",
	},
	"game.cmd.join": { tr: "Oyuna katıl", en: "Join game" },
	"game.cmd.join-sub": {
		tr: "Oyuncu bunu yazmadan puan almaz.",
		en: "Players get no points until they type this.",
	},
	"game.cmd.reset": { tr: "Sıfırla (yetkili)", en: "Reset (privileged)" },
	"game.cmd.reset-sub": {
		tr: "Yalnız sen ve moderatörler çalıştırabilir; başkası yazarsa yok sayılır.",
		en: "Only you and your moderators can run it; anyone else is ignored.",
	},
	"game.cmd.bet": { tr: "Bahis", en: "Bet" },
	"game.cmd.bet-sub": {
		tr: "Örnek: 500 · %50 · yarısı · hepsi",
		en: "Examples: 500 · 50% · half · all",
	},
	"game.cmd.balance": { tr: "Bakiye sorgu", en: "Check balance" },
	"game.cmd.balance-sub": {
		tr: "Oyuncu kendi puanını sorar.",
		en: "A player asks for their own points.",
	},
	"game.cmd.top": { tr: "Sıralama", en: "Leaderboard" },
	"game.cmd.top-sub": { tr: "İlk 5 oyuncu.", en: "Top 5 players." },
	"game.cmd.help": { tr: "Yardım", en: "Help" },
	"game.cmd.help-sub": {
		tr: "Kuralları kısaca anlatır.",
		en: "Explains the rules briefly.",
	},
	"game.cmd.names": { tr: "Komut adları", en: "Command names" },
	"game.cmd.names-ph": {
		tr: "virgülle ayır",
		en: "comma separated",
	},

	"game.reply": { tr: "Chat cevapları", en: "Chat replies" },
	"game.reply.mode": { tr: "Cevap biçimi", en: "Reply style" },
	"game.reply.mode-sub": {
		tr: "Kalabalık yayında toplu özet önerilir — Kick mesaj sınırına takılmamak için.",
		en: "On a busy stream prefer the batched summary, so you stay under Kick's message limits.",
	},
	"game.reply.batch": { tr: "Toplu özet (önerilen)", en: "Batched summary (recommended)" },
	"game.reply.each": { tr: "Her bahse ayrı cevap", en: "One reply per bet" },
	"game.reply.silent": { tr: "Sessiz (chate yazma)", en: "Silent (no chat messages)" },
	"game.reply.batch-sec": { tr: "Toplama aralığı (sn)", en: "Batch window (s)" },
	"game.reply.batch-sec-sub": {
		tr: "Bu süre boyunca biriken sonuçlar tek mesajda gönderilir.",
		en: "Results collected during this window go out in a single message.",
	},
	"game.reply.prefix": { tr: "Özet ön eki", en: "Summary prefix" },
	"game.reply.win": { tr: "Kazanma metni", en: "Win message" },
	"game.reply.loss": { tr: "Kaybetme metni", en: "Loss message" },
	"game.reply.join": { tr: "Katılım metni", en: "Join message" },
	"game.reply.cycle": { tr: "Şans döngüsü metni", en: "Luck cycle message" },
	"game.reply.cycle-sub": {
		tr: "Döngü yenilenince chate yazılır. Boş bırakılırsa duyurulmaz.",
		en: "Posted to chat when the cycle refreshes. Leave empty to stay quiet.",
	},
	"game.reply.help": { tr: "Yardım metni", en: "Help message" },
	"game.reply.help-sub": {
		tr: "Puanların eğlence amaçlı olduğunu belirtmek iyi olur.",
		en: "Worth stating that the points are just for fun.",
	},
	"game.reply.restore": { tr: "Metinleri sıfırla", en: "Reset messages" },
	"game.reply.restore-sub": {
		tr: "Şablonları arayüz dilinin varsayılanlarına döndürür.",
		en: "Restores the templates to the interface language's defaults.",
	},
	"game.reply.restore-btn": { tr: "Varsayılana dön", en: "Restore defaults" },
	"game.reply.restore-done": { tr: "Metinler sıfırlandı.", en: "Messages restored." },
	"game.reply.placeholders": {
		tr: "Kullanılabilir alanlar: {username} {amount} {balance} {top} · komutlar: {joinCommand} {betCommand} {balanceCommand} {topCommand} {resetCommand}",
		en: "Available fields: {username} {amount} {balance} {top} · commands: {joinCommand} {betCommand} {balanceCommand} {topCommand} {resetCommand}",
	},

	"game.session": { tr: "Bu yayın", en: "This stream" },
	"game.session.none": {
		tr: "Henüz oyun oturumu yok. İlk komut geldiğinde başlar.",
		en: "No game session yet. It starts with the first command.",
	},
	"game.session.channel": { tr: "Kanal", en: "Channel" },
	"game.session.players": { tr: "Oyuncu", en: "Players" },
	"game.session.bets": { tr: "Toplam bahis", en: "Total bets" },
	"game.session.leaderboard": { tr: "Sıralama", en: "Leaderboard" },
	"game.session.reset": { tr: "Oturumu sıfırla", en: "Reset session" },
	"game.session.reset-sub": {
		tr: "Herkesin puanı başlangıç değerine döner. Yeni yayında bu zaten kendiliğinden olur.",
		en: "Everyone's points return to the starting value. This already happens on its own each new stream.",
	},
	"game.session.reset-btn": { tr: "Sıfırla", en: "Reset" },
	"game.session.reset-confirm": {
		tr: "Bu yayındaki tüm puanlar sıfırlanacak. Onaylıyor musun?",
		en: "All points for this stream will be reset. Are you sure?",
	},
	"game.session.reset-done": { tr: "Oturum sıfırlandı.", en: "Session reset." },

	// Varsayılan chat şablonları — bunlar izleyicinin chatte GÖRDÜĞÜ metinlerdir,
	// dolayısıyla arayüz diliyle birlikte gelmeleri gerekir (sabit TR bırakılamaz).
	// Zar sonucu adları — oyuncunun "ne oldu da kazandım" sorusunun cevabı.
	// Atış yükseldikçe ödül büyür (bkz. gameOutcome > ROLL_RANGES).
	"game.outcome.jackpot": { tr: "TAM İSABET", en: "JACKPOT" },
	"game.outcome.great": { tr: "Sağlam atış", en: "Big roll" },
	"game.outcome.good": { tr: "İyi attın", en: "Good roll" },
	"game.outcome.fair": { tr: "Fena değil", en: "Decent roll" },
	"game.outcome.slim": { tr: "Kıl payı tuttu", en: "Just made it" },
	"game.outcome.half": { tr: "yarısı amorti", en: "half back" },
	"game.outcome.quarter": { tr: "çeyreği amorti", en: "quarter back" },
	"game.outcome.scrape": { tr: "kıl payı kurtardın", en: "barely scraped" },
	"game.outcome.bust": { tr: "zar tutmadı", en: "cold dice" },

	// NOT: kişiye giden cevaplarda ad `@` ile etiketlenir — oyuncu akan chatte
	// kendi sonucunu bildirimden yakalasın diye. Metin "ne oldu da ne kazandım"
	// zincirini eksiksiz kurar: atış · sonuç · çarpan · yatırılan → geri gelen.
	// DİKKAT: Kick, çok sayıda özel karakter içeren mesajı 400
	// MAX_SPECIAL_CHARS_ERROR ile reddediyor. Bu yüzden varsayılan metinlerde
	// emoji ve tipografik sembol (· — 🎲 🎉 💀) KULLANILMAZ; sade noktalama
	// yeterli. Şablonu özelleştirirken bunu akılda tut (motor yine de
	// sadeleştirip yeniden dener, bkz. gameSanitize).
	"game.default.win": {
		tr: "@{username} {roll}/{maxRoll} {outcome}! {multiplier} kat, {bet} > {returned} (bakiye {balance})",
		en: "@{username} {roll}/{maxRoll} {outcome}! {multiplier}x, {bet} > {returned} (balance {balance})",
	},
	"game.default.loss": {
		tr: "@{username} {roll}/{maxRoll} {outcome}. {bet} > {returned} (bakiye {balance})",
		en: "@{username} {roll}/{maxRoll} {outcome}. {bet} > {returned} (balance {balance})",
	},
	"game.default.balance": {
		tr: "@{username} bakiyen {balance}",
		en: "@{username} your balance {balance}",
	},
	"game.default.top": { tr: "Sıralama: {top}", en: "Leaderboard: {top}" },
	"game.default.join": {
		tr: "@{username} katıldın! {balance} puan. {betCommand} <miktar> ile oyna",
		en: "@{username} you're in! {balance} points. Play with {betCommand} <amount>",
	},
	"game.default.already-joined": {
		tr: "@{username} zaten oyundasın, bakiye {balance}",
		en: "@{username} you're already in, balance {balance}",
	},
	"game.default.not-joined": {
		tr: "@{username} önce {joinCommand} yaz",
		en: "@{username} type {joinCommand} first",
	},
	"game.default.reset": {
		tr: "Oyun sıfırlandı, herkes {balance} puanla başlıyor",
		en: "Game reset, everyone starts with {balance} points",
	},
	"game.default.cycle": {
		tr: "Şans döngüsü yenilendi, herkes sıfırdan",
		en: "Luck cycle refreshed, everyone starts over",
	},
	// Yardım üç parçaya bölünür: tek mesajda hem uzunluk hem özel karakter
	// sınırına takılıyor, ayrıca chatte tek blok metin okunmuyor.
	"game.default.help": {
		tr: "@{username} Katılmak için {joinCommand} yaz, {balance} puanla başlarsın. Oynamak için {betCommand} 500 ya da {betCommand} %50 veya {betCommand} hepsi. Bakiyen {balanceCommand}, sıralama {topCommand}",
		en: "@{username} Type {joinCommand} to join and start with {balance} points. Play with {betCommand} 500 or {betCommand} %50 or {betCommand} all. Balance {balanceCommand}, leaderboard {topCommand}",
	},
	"game.default.help-dice": {
		tr: "Her bahiste 0 ile 20 arası zar atılır. 20 attın mı 5 kat, 18-19 ise 3 kat, 15-17 ise 2 kat, 12-14 ise 1,5 kat, 10-11 ise 1,2 kat kazanırsın. 7-9 yarısını, 4-6 çeyreğini, 1-3 kıl payını geri verir, 0 ise hepsi gider",
		en: "Every bet rolls a die from 0 to 20. Roll 20 for 5x, 18-19 for 3x, 15-17 for 2x, 12-14 for 1,5x, 10-11 for 1,2x. 7-9 returns half, 4-6 a quarter, 1-3 a sliver, and 0 loses it all",
	},
	"game.default.help-reward": {
		tr: "Ayrıca chate yazdıkça sessizce puan kazanırsın, bunun için bir şey yapmana gerek yok. Ne kadar çok sohbet edersen o kadar çok puan, oturum başına {rewardCap} puana kadar",
		en: "You also earn points silently just by chatting, no command needed. The more you talk the more you earn, up to {rewardCap} points per session",
	},
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export const useTranslation = () => {
	const [lang, setLangState] = useState<Language>(getLanguage);
	useEffect(() => {
		const onChange = () => setLangState(getLanguage());
		window.addEventListener(LANGUAGE_CHANGE_EVENT, onChange);
		return () => window.removeEventListener(LANGUAGE_CHANGE_EVENT, onChange);
	}, []);
	const t = (key: string): string => {
		const entry = dict[key];
		if (!entry) return key;
		return entry[lang] || entry.tr || key;
	};
	return { t, lang, setLanguage };
};
