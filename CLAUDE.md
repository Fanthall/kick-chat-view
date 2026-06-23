# chat-view

`chat-view`, Kick chatini masaustu uygulama olarak izlemek ve moderator/abonelik olaylarini ayri panellerde gostermek icin yazilmis Electron + React + TypeScript projesidir. Klasor, Electron React Boilerplate uzerine kuruludur; kok `../CLAUDE.md` workspace base baglamidir.

## Hedef

- Kick kanal chatini Pusher websocket uzerinden dinler.
- Chat mesajlarini, reply/celebration tiplerini, Kick emote'larini ve 7TV emote'larini renderer'da gosterir.
- Ban, timeout, unban ve mesaj silme gibi moderator olaylarini ayri panelde listeler.
- Subscription ve gifted subscription olaylarini ayri panelde tutar.
- Ayarlarda `channelName`, `username`, bloklanan emote listesi ve suspended/suspicious user listesi yonetilir.

## Teknoloji

- Runtime: Electron 26, Electron Builder, Electron Updater
- UI: React 18, NextUI, Tailwind, react-icons, react-toastify
- State: Redux Toolkit ile klasik reducer/action yapisi
- Build: webpack tabanli `.erb` konfigleri
- Test: Jest + Testing Library
- Dil: TypeScript strict mode acik

## Komutlar

- `npm start`: renderer dev server'i ve Electron gelistirme akisini baslatir.
- `npm run start:main`: Electron main process'i development modda baslatir.
- `npm run start:preload`: preload bundle'i development modda uretir.
- `npm run build`: main ve renderer production build alir.
- `npm run package`: dist temizler, build alir, electron-builder ile paketler.
- `npm test`: Jest testlerini calistirir.
- `npm run lint`: ESLint kontrolu yapar.

## Mimari Harita

- `src/main/main.ts`: Electron main process. BrowserWindow burada acilir, menu kurulur, auto updater tetiklenir.
- `src/main/preload.ts`: preload katmani. IPC yuzeyi degisirse once burasi ve `preload.d.ts` kontrol edilmeli.
- `src/renderer/App.tsx`: NextUI provider, toast container, 7TV emote yukleme ve chat listener bootstrap noktasi.
- `src/renderer/src/Layout/Layout.tsx`: Chat, SubView, ModActions ve Settings ekranlarini yerlestiren ana layout.
- `src/renderer/src/Chat/Chat.tsx`: Ana chat render'i. Badge, emote, mention highlight, blocked emote gizleme, suspicious/suspended user highlight ve host toast akisi burada.
- `src/renderer/src/SubView/SubView.tsx`: Subscription/gifted subscription listesi.
- `src/renderer/src/ModActions/ModActions.tsx`: Ban/timeout/unban/delete aksiyonlari ve kullanici mesaj gecmisi popup'i.
- `src/renderer/src/Settings/Settings.tsx`: LocalStorage tabanli kanal/kullanici ayarlari, bloklu emote ve suspended user UI'i.
- `src/renderer/util/chatConnection.ts`: Kick/Pusher websocket aboneligi ve event parse/dispatch merkezi.
- `src/renderer/util/chatInterface.ts`: Kick event ve internal state tipleri.
- `src/renderer/store/reducer/chatMessage.ts`: Chat, mod aksiyonlari, subscription listeleri, badge/emote ve host state'i.
- `src/renderer/services/kick.ts`: Kick channel API wrapper'i.
- `src/renderer/services/sevenTv.ts`: 7TV emote API wrapper'i.
- `src/renderer/util/localModerationStorage.ts`: Blocked emote ve suspended user listelerini localStorage uzerinden okuma/yazma yardimcilari.

## Modern UI Architecture (2026-05-20)

### Shell Switch

- Default shell: **modern** (changed in Sprint 7; was classic).
- Override priority: URL param `?shell=classic|modern` > hash `#...shell=classic|modern` > `localStorage.chatViewShellPreference` > default (modern).
- localStorage key: `chatViewShellPreference` = `"modern" | "classic"`. Legacy key `chatViewShellPreview` is automatically migrated to `chatViewShellPreference` on first App.tsx mount.
- Runtime toggle: Settings → Advanced → "Modern UI (beta)" toggle writes `chatViewShellPreference` and dispatches `chat-view-shell-preference-changed` custom event. `App.tsx` listens and re-renders the shell without reload.
- Classic shell remains fully functional; `src/renderer/src/Layout/Layout.tsx` is unmodified.

### File Map

| File | Role |
|---|---|
| `src/renderer/src/Layout/LayoutModern.tsx` | 3-col shell: topbar, channel tabs, screen routing |
| `src/renderer/src/Chat/ChatModern.tsx` | Chat panel: message list, composer, emote autocomplete integration |
| `src/renderer/src/Chat/EmoteAutocompleteModern.tsx` | Inline emote dropdown (Sprint 3) |
| `src/renderer/src/Chat/EmotePickerModern.tsx` | Modal emote picker with focus trap (Sprint 6b/7) |
| `src/renderer/src/ActivityView/ActivityViewModern.tsx` | Activity panel + KICKs leaderboard sub-tab (Sprint 4) |
| `src/renderer/src/ModActions/ModActionsModern.tsx` | Moderation panel: user card, quick actions, chat controls (Sprint 5) |
| `src/renderer/src/Settings/SettingsModern.tsx` | Settings side-nav IA: 6 sections (Sprint 6a) |
| `src/renderer/src/Component/Icon/Icon.tsx` | Shared icon component (Sprint 2) |
| `src/renderer/src/Settings/SettingsClassic.tsx` | Renamed from Settings.tsx; still imported by classic Layout as default export |
| `src/renderer/util/useFocusTrap.ts` | Focus trap hook for modal dialogs (Sprint 7) |

### Design Tokens Scope

All Modern UI CSS variables are scoped under `[data-app-shell="modern"]` in the stylesheet. They do not affect NextUI or classic component styles. Token prefix: `--ms-*`.

### Constraint Reminders

- CONSTRAINT-2: `chatViewShellPreference` is the authoritative key; `chatViewShellPreview` is legacy (migrated, then removed).
- CONSTRAINT-4: All message HTML goes through `renderMessageHtml` / `buildBadgesHtml` (sanitized). No raw `dangerouslySetInnerHTML` outside these helpers.
- NextUI ↔ OKLCH scope isolation: Modern tokens under `[data-app-shell="modern"]` only; do not bleed into NextUI `dark` class scope.

## Veri Akisi

1. `App.tsx` acilista 7TV emote listesini ceker ve `chatListener()` thunk'ini dispatch eder.
2. `chatConnection.ts`, `localStorage.channelName` ile Kick kanal bilgisini alir ve `chatrooms.{id}.v2` Pusher kanalina abone olur.
3. Gelen Pusher eventleri `ChatMessageReducers` uzerinden Redux state'e yazilir.
4. `Chat`, `SubView` ve `ModActions` panelleri ayni `messages` state'inden beslenir.
5. Settings ekrani kalici ayarlari `localStorage` uzerinden tutar; blocked emote ve suspended user degisimleri ayni pencerede custom event ile chat'e yansir.

## Kick OAuth 2.1 ve Resmi API

- Resmi Kick OAuth/API entegrasyonu main process tarafindadir; renderer token veya client secret ile dogrudan is yapmaz.
- OAuth PKCE flow `src/main/kickOAuth.ts` icindedir. Varsayilan callback URL: `http://localhost:18291/kick/oauth/callback`.
- Token ve Kick app config `app.getPath("userData")/kick-oauth.json` altinda tutulur.
- Renderer API yuzeyi `window.electron.kick.*` uzerinden preload ile acilir.
- Varsayilan scope seti `src/shared/kickScopes.ts` icindeki resmi Kick scope listesinden gelir: `user:read`, `channel:read`, `channel:write`, `channel:rewards:read`, `channel:rewards:write`, `chat:write`, `streamkey:read`, `events:subscribe`, `moderation:ban`, `moderation:chat_message:manage`, `kicks:read`.
- Resmi API wrapper `src/main/kickService.ts` icinde kanal, livestream, chat, moderation ve event subscription yardimcilarini barindirir.
- Kick Developer App tarafinda redirect URI, uygulamadaki callback URL ile birebir ayni olmali.
- Canli chat/sub/gift/host akisinda mevcut Pusher listener v1 icin korunur. Resmi Kick event sistemi webhook tabanli oldugu icin desktop app'te dogrudan canli event kaynagi olarak kullanilmaz.
- Raid/host icin resmi API tarafinda net endpoint/event olmadigindan `StreamHostEvent` Pusher uzerinden izlenmeye devam eder.

## Kritik Notlar

- Eski GitHub contents tabanli suspicious user senkronizasyonu kaldirildi; bu veriler artik localStorage'da tutulur.
- Renderer tarafinda `dangerouslySetInnerHTML` ile mesaj HTML'i uretiliyor. Chat icerigi, emote adi ve kullanici verisi escape edilmeden basilirsa XSS riski dogar.
- `localStorage` anahtarlari proje sozlesmesi gibi kullaniliyor: `channelName`, `username`, `susUsers`, `blockEmotes`.
- Websocket connection su an tek sefer kuruluyor; kanal ayari degisince uygulama yeniden baslatma veya listener yenileme ihtiyaci olabilir.
- Reducer listeleri 500 elemanda truncate ediyor; performans/UX degisikliginde bu limit bilincli korunmali veya acikca degistirilmeli.
- `electron-updater` ve `electron-builder.publish` hala boilerplate GitHub owner/repo degerlerine yakin duruyor; release yapmadan once publish hedefleri kontrol edilmeli.
- `package.json` engines alani Node `>=24.11.1`, npm `>=10` istiyor; eski Node ile postinstall/build kirilabilir.

## Bilinen Teknik Borclar

- `Chat.tsx` ve `ModActions.tsx` icinde badge/emote HTML uretimi ciddi tekrar iceriyor; ortak helper/component'a alinabilir.
- `removeHostInfo` reducer filtresi callback'i deger return etmiyor; host toast temizleme davranisi hatali olabilir.
- Bazi `useEffect` bloklarinda interval cleanup eksik veya state'e interval id yaziliyor; ozellikle `Layout.tsx` ve `Chat.tsx` incelenmeli.
- Bazi listelerde React key sabit veya eksik (`SubView` Action). UI warning ve reconcile problemi yaratabilir.
- Kodda mojibake/encoding bozulmalari var; Turkce yorum/metin duzenlenecekse UTF-8 temizlenmeli.

## Calisma Kurallari

- Electron main/preload/renderer sinirini koru. Renderer'dan Node/Electron API ihtiyaci dogarsa preload + typed bridge tercih et.
- Websocket event tipi eklerken once `chatInterface.ts`, sonra action/reducer, sonra UI panelini guncelle.
- Chat HTML'i uretirken kullanici/kaynak verisini sanitize/escape etmeden `dangerouslySetInnerHTML` icine koyma.
- Ayar davranisi degisirse `localStorage` anahtarlarini ve Settings/Chat/Layout tarafindaki okuma noktalarini birlikte kontrol et.
- Build veya test calistirirken komutlari bu proje kokunde calistir: `F:\dev-apps\chat-view`.
- Var olan `package.json`/`package-lock.json` degisiklikleri kullaniciya ait olabilir; bu dosyalari gereksiz formatlama veya revert etme.
