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
	"topbar.no-channel": { tr: "Kanal seçili değil", en: "No channel" },
	"topbar.add-channel": { tr: "Kanal ekle", en: "Add channel" },
	"topbar.close-channel": { tr: "Kanalı kapat", en: "Close channel" },
	"topbar.activity": { tr: "Aktivite", en: "Activity" },
	"topbar.moderation": { tr: "Moderasyon", en: "Moderation" },
	"topbar.emote-picker": { tr: "Emote seçici", en: "Emote picker" },
	"topbar.refresh": { tr: "Yenile", en: "Refresh" },
	"topbar.settings": { tr: "Ayarlar", en: "Settings" },
	"topbar.edit-stream": { tr: "Yayını düzenle", en: "Edit stream" },

	// Activity
	"activity.title": { tr: "Aktivite", en: "Activity" },
	"activity.filter.all": { tr: "Tümü", en: "All" },
	"activity.filter.subs": { tr: "Abonelikler", en: "Subs" },
	"activity.filter.gifts": { tr: "Hediyeler", en: "Gifts" },
	"activity.filter.kicks": { tr: "Bağışlar", en: "KICKs" },
	"activity.filter.rewards": { tr: "Ödüller", en: "Rewards" },
	"activity.tab.events": { tr: "Olaylar", en: "Events" },
	"activity.tab.leaderboard": { tr: "Sıralama", en: "Leaderboard" },
	"activity.empty": { tr: "Olay yok", en: "No events" },
	"activity.raw-json": { tr: "Ham JSON", en: "Raw JSON" },
	"activity.accept": { tr: "Kabul et", en: "Accept" },
	"activity.reject": { tr: "Reddet", en: "Reject" },

	// Moderation
	"mod.title": { tr: "Moderasyon", en: "Moderation" },
	"mod.section.selected": { tr: "Seçili kullanıcı", en: "Selected user" },
	"mod.section.actions": { tr: "Hızlı aksiyonlar", en: "Quick actions" },
	"mod.section.controls": { tr: "Sohbet kontrolleri", en: "Chat controls" },
	"mod.section.suspended": { tr: "Kısıtlı kullanıcılar", en: "Suspended users" },
	"mod.empty.click-row": {
		tr: "Bir sohbet satırına tıklayıp kullanıcı seç",
		en: "Click a chat row to select a user",
	},
	"mod.empty.viewer": {
		tr: "İzleyici modu — moderasyon aksiyonları gizli",
		en: "Viewer mode — moderation actions hidden",
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
	"chat.placeholder": { tr: "Mesaj gönder", en: "Send a message" },
	"chat.reply-to": { tr: "Yanıtla", en: "Reply to" },
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
	"settings.nav.emotes": { tr: "Emoteler", en: "Emotes" },
	"settings.nav.automation": { tr: "Rutinler", en: "Routines" },
	"settings.nav.advanced": { tr: "Gelişmiş", en: "Advanced" },
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
	"mod.section.history": { tr: "Son aksiyonlar", en: "Recent actions" },
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
	"activity.tab.leaderboard-full": { tr: "KICKs Sıralama", en: "KICKs Leaderboard" },
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
