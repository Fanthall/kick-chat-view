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
	"activity.filter.kicks": { tr: "Bağışlar", en: "Kicks" },
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
	"settings.nav.advanced": { tr: "Gelişmiş", en: "Advanced" },
	"settings.theme.label": { tr: "Tema", en: "Theme" },
	"settings.theme.dark": { tr: "Koyu", en: "Dark" },
	"settings.theme.light": { tr: "Açık", en: "Light" },
	"settings.language.label": { tr: "Dil", en: "Language" },
	"settings.language.tr": { tr: "Türkçe", en: "Turkish" },
	"settings.language.en": { tr: "İngilizce", en: "English" },
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
