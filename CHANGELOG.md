# 4.6.20 — 2026-07-26

Kick mesajı reddediyordu: emoji temizlendi, metinler kısaldı.

## [Bahis oyunu] — 2026-07-26

- **Fix (kritik):** Kick, çok sayıda özel karakter içeren mesajı reddediyordu — `400 {"data":"MAX_SPECIAL_CHARS_ERROR"}`. Cevaplardaki emoji ve tipografik semboller (`🎲 · — 🎉 💀 🏆 🎮`) bu sınırı aşıyor ve bot **hiçbir şey yazamıyordu**. Tüm varsayılan metinlerden bu karakterler kaldırıldı.
- **Emniyet ağı:** Şablon özelleştirilip yine emoji konursa cevap kaybolmasın diye, gönderim bu hatayla dönerse metin otomatik sadeleştirilip **bir kez yeniden denenir** (yeni `gameSanitize` paketi). Emoji atılır, tipografik işaretler ASCII'ye çevrilir; harf, rakam ve anlam korunur.
- **Metinler kısaldı.** Uzun cümleler yerine tek satırda özet:

  `@ali 15/20 İyi attın! 2 kat, 500 > 1.000 (bakiye 10.500)`
  `@ali 5/20 çeyreği amorti. 250 > 63 (bakiye 11.563)`
  `@ali 0/20 zar tutmadı. 2.000 > 0 (bakiye 9.563)`

- Türkçe karakterler korundu (harf, özel karakter değil); yalnız emoji ve süs sembolleri gitti.
- Testler: 155 oyun testi (yeni sadeleştirme paketi dahil) — varsayılan şablonların emoji içermediği testle kilitli, bir daha sessizce geri sızamaz.

# 4.6.19 — 2026-07-26

Bahis sonucu artık anlatılıyor: d20 zar atışı + tam para akışı.

## [Bahis oyunu] — 2026-07-26

- **Yeni — zar anlatısı.** "3 kat! +2.000" tek başına oyuncuya neden kazandığını anlatmıyordu. Her sonuç artık **0-20 arası bir zar atışına** bağlı ve chatte gösteriliyor:

  `@ali 🎲 17/20 · İyi attın! 2 kat — 1.000 yatırdın, 2.000 aldın 🎉 (bakiye: 11.250)`
  `@ali 🎲 8/20 · yarısı amorti — 1.000 yatırdın, 500 geri geldi, -500 💀 (bakiye: 12.650)`
  `@ali 🎲 0/20 · zar tutmadı — 1.000 yatırdın, 0 geri geldi, -1.000 💀`

- **İlişki monoton:** atış yükseldikçe ödül büyür. `20` = 5 kat (tek sayı, en nadir) · `18-19` = 3 kat · `15-17` = 2 kat · `12-14` = 1,5 kat · `10-11` = 1,2 kat · `7-9` = yarısı amorti · `4-6` = çeyreği · `1-3` = kıl payı · `0` = tamamı gider. Aralıkların boşluksuz, çakışmasız ve monoton olduğu testle korunuyor.
- **Para akışı eksiksiz:** şablonlar artık ne yatırıldığını, kaç kat olduğunu, ne geri geldiğini ve yeni bakiyeyi birlikte yazıyor (`{roll}` `{maxRoll}` `{outcome}` `{multiplier}` `{bet}` `{returned}` `{amount}` `{balance}`).
- **Geçiş (otomatik):** Eski kayıttaki kazanç/kayıp şablonları bu yer tutucuları içermediği için sonuç yine anlatısız kalırdı; ayar şeması **sürüm 3**'e taşınırken bu iki şablon bir kez varsayılana alınıyor. Elle özelleştirilen diğer şablonlara (katılma, sıralama, yardım…) dokunulmaz.
- Not: zar sonucu **belirlemez, anlatır** — kazanma olasılığı davranış eğrisinden, ödeme ağırlıklı kademe çekilişinden gelir; atış o kademenin aralığından üretilir, böylece görülen zar ile ödenen çarpan her zaman tutarlıdır.
- i18n TR + EN tam (140 anahtar). Testler: 137 oyun testi (yeni `gameOutcome` paketi dahil).

# 4.6.18 — 2026-07-26

Test modu kaldırıldı: oyun kutudan çıktığı gibi chate yazar ve oyuncuyu etiketler.

## [Bahis oyunu] — 2026-07-26

- **Kaldırıldı — "test modu" (`dryRun`).** Ara bir sessiz mod artık yok; oyun varsayılan olarak **açık** gelir ve chate **yazar**. Susturmak isteyen oyunu kapatır ya da cevap modunu «sessiz» yapar.
- **Geçiş (otomatik):** Eski kayıtlarda `dryRun: true` durduğu için güncelleme sonrası bot yine susardı. Ayar şemasına sürüm eklendi; eski kayıtlar bir kez **sürüm 2**'ye taşınıyor — `dryRun` ayıklanır, cevap modu `each` olur, `minBet` 1'e iner. Sonrasında ne seçersen o kalır.
- **Oyuncu etiketleniyor:** Kişiye giden tüm cevaplarda ad `@` ile yazılır (`@ali 3 kat! +2.000`) ve mesaj komutun kendisine **reply** olarak gider. Varsayılan cevap modu bu yüzden `each` oldu — toplu özet tek mesaj olduğu için ne tag ne reply mümkün.
- **En az bahis 1 puan** (önceden 100).
- **Ödeme kademeleri artık ayarlanamaz.** Ağırlıklar dengeli kurulu (ev avantajı korunuyor) ve panelde yalnız **salt okunur** gösteriliyor: kazanç `1,2× / 1,5× / 2× / 3× / 5×`, kayıp `0× / %10 / %25 / %50 geri`, yüzdeleriyle birlikte.
- i18n TR + EN tam (131 anahtar). Testler: 131 oyun testi — sürüm 2 geçişi, geçişin bir kez uygulanması ve `minBet: 1` davranışı dahil.

# 4.6.17 — 2026-07-26

Oyun botu: çarpanlı ödeme, cevabı reply olarak gönderme ve "bot neden yazmıyor" göstergesi.

## [Bahis oyunu] — 2026-07-26

- **Fix (kritik):** `liveOnly` açıkken oyun hiç konuşmayabiliyordu. Kick `/public/v1/channels` yanıtında `stream` alanı **opsiyoneldir** ve üst seviyede `is_live` yoktur; alan gelmediğinde `Boolean(undefined)` false olup "yayın kapalı" sanılıyor ve motor sessizce susuyordu. Artık canlılık **bilinmiyor** ile **kesin kapalı** ayrıştırılıyor — yalnız `is_live: false` geldiğinde susulur.
- **Yeni:** Cevaplar komutu yazan kişinin mesajına **reply** olarak gidiyor (`each` modunda). Toplu (`batch`) modda tek mesajda birden fazla oyuncu olduğu için reply atılmaz, isimler metinde geçer.
- **Yeni — çarpanlı ödeme:** Sonuç artık ikili (kazandı/kaybetti) değil. Şans eğrisi önce tarafı belirler, ardından o tarafın kademelerinden **ağırlıklı çekiliş** yapılır: kazançta 1,2× / 1,5× / 2× / 3× / 5×; kayıpta 0× / %10 / %25 / %50 geri dönüş. Çarpanlar sabit kural değil, ihtimale bağlıdır ve ağırlıkları Ayarlar → Oyun'dan düzenlenebilir.
- **Yeni:** Panelde canlı **ev avantajı** göstergesi. Ağırlıklar oyuncu lehine döndüğünde uyarır (varsayılan tabloda birim bahiste ≈ −%3).
- **Yeni — bot durumu göstergesi:** Motor sessizce durabildiği her noktada nedeni kaydeder ve Ayarlar → Oyun → Oturum altında gösterir: test modu, sessiz mod, yayın kapalı, kanal kimliği çözülemedi, Kick mesajı reddetti veya "✓ chate yazıyor" (son gönderim saatiyle). DevTools açmaya gerek kalmaz.
- Cevap şablonlarına `{multiplier}`, `{returned}` ve `{bet}` yer tutucuları eklendi; varsayılan kazanç/kayıp metinleri çekilen kademeyi gösterir.
- i18n TR + EN tam (134 anahtar). Testler: 128 oyun testi (11 yeni; kademe çekilişi, ev avantajı regresyonu, reply davranışı ve `liveOnly` fail-closed regresyonu dahil).

# 4.6.16 — 2026-07-26

Chat bahis oyunu (Ayarlar → Oyun): komut sistemi, ekonomi eğrisi ve yayın bazlı oturum.

## [Bahis oyunu] — 2026-07-26

- **Yeni:** Chatten çalışan puan/bahis oyunu. Varsayılan komutlar: `!joingame` (katıl), `!bahis 500` (bahis), `!puan` (bakiye), `!top` (sıralama), `!oyun` (yardım), `!reset` (yalnız yayıncı/mod). Komut adları ve prefix ayarlardan değiştirilebilir; eşleştirme Türkçe diakritiğe duyarsızdır (`SIRALAMA` = `sıralama` = `siralama`).
- **Yeni:** Bahis miktarı esnek biçimleri: `500` · `1k` · `2.5k` · `1.000` · `%50` · `yarısı` · `hepsi`.
- **Yeni:** Kazanma olasılığı sabit değil — oyuncunun davranışına göre hesaplanır (derinlik/ısrar, açgözlülük, bahis boyutu cezaları + dibe vuranlara merhamet bonusu). Ekonomi çekirdeği saf fonksiyonlardan oluşur; ayar panelindeki Monte Carlo önizlemesi chatte çalışan **aynı kodu** kullanır.
- **Yeni:** Yayın bazlı oturum. Yeni yayın = sıfırdan başlar; kısa kopmalarda oturum korunur (`sessionGraceMinutes`). `liveOnly` açıkken oyun yalnız yayın açıkken çalışır ve yayın kapanınca oturum düşer — chat sussa bile 2 dakikalık canlılık yoklaması bunu yakalar.
- **Yeni:** Cevap modu — `batch` (varsayılan, 8 sn'lik pencerede tek özet mesaj; Kick rate-limit koruması), `each` (her sonuca ayrı mesaj) veya `silent`. Hata/ret cevapları toplu modda da kısaltılmaz, çünkü oyuncunun bahsinin neden işlenmediğini bilmesi gerekir.
- **Yeni:** Katılım kapısı (`requireJoin`) — hesap yalnız `!joingame` ile açılır; `!top` yazan herkese hesap açılmaz.
- **Not:** İlk kurulumda oyun **kapalı** ve **test modu (`dryRun`) açık** gelir — kazara canlı yayında spam olmasın diye. Test modunda komutlar tam işlenir (bakiye güncellenir) ama chate mesaj gitmez, yalnız DevTools konsoluna `[game][DRYRUN]` satırı düşer. Gerçekten chate yazması için Ayarlar → Oyun'dan **"Oyunu aç"** açılmalı ve **"Test modu (chate yazma)"** kapatılmalıdır.
- Arayüz metinleri TR + EN tam (120 anahtar).

# 4.6.12 — 2026-06-03

Render-crash kaynaklı mesaj kaybı + gift event yakalama düzeltmeleri.

## [Mesaj kaybı — render crash] — 2026-06-03

- **Fix (kritik):** Kick chatinde gelen bazı mesajlar app'te görünmüyor, **ancak uygulamayı yenileyince (reload) geliyordu**. Kök neden: `content: null` ile gelen mesajlar (salt-emote / sistem mesajları) kullanıcı adı ayarlıyken `message.content.toLowerCase()` çağrısında **throw** ediyor → tüm mesaj listesi render'ı çöküyor → error boundary olmadığı için chat donuyordu. `(message.content || "")` guard eklendi.
- **Fix:** Her mesaj satırı artık `RowErrorBoundary` ile sarılı — beklenmeyen payload şekli olan tek bir mesaj artık yalnızca o satırı atlar (loglar), **liste akmaya devam eder**. Bir daha reload gerekmez.

## [Gift event yakalama] — 2026-06-03

- **Fix:** Hediye abonelik (gift) bazı kanallarda activity'de hiç görünmüyor ve gift rutini hiç tetiklenmiyordu (sub yenileme çalışırken). Kök: gift olayı resmi `GiftedSubscriptionsEvent` adıyla gelmeyip işlenmeden düşüyordu. Artık gift-benzeri her event (ad veya `gifter`/`gifted_*` alanları) yakalanıp resmi gift yoluna sokuluyor → farklı event adıyla gelse bile activity + rutin çalışır. Gerçek event adı konsola loglanır (`[GiftLikeEvent]`).

# 4.6.11 — 2026-06-01

Güncelleme sonrası otomatik yeniden başlatma (relaunch) düzeltmesi.

## [Auto-update relaunch] — 2026-06-01

- **Fix:** Güncelleme indirildikten sonra app kapanıyor ama **yeniden açılmıyordu** (kullanıcı "crash" sanıyordu). Kök neden: `autoInstallOnAppQuit` electron-updater'ı `isForceRunAfter=false` ile sessizce kuruyor → relaunch yok. Ayrıca `quitAndInstall(false, true)` çağrısında `isSilent=false` olduğu için `isForceRunAfter` **yok sayılıyordu**.
- **Çözüm:** `autoInstallOnAppQuit` kapatıldı; kurulum+relaunch artık `before-quit`'te `quitAndInstall(true, true)` (silent + force-run-after) ile yönetiliyor → güncelleme sonrası **garantili otomatik restart**. Manuel "install" butonu da `(true, true)` ile güncellendi. Re-entry guard eklendi.

# 4.6.10 — 2026-06-01

Bağlantı dayanıklılığı + abonelik event ayrımı (yeni / yenileme / hediye).

## [Bağlantı Dayanıklılığı] — 2026-06-01

- **Fix (kritik):** Chat websocket'i bir süre sonra (özellikle pencere arka plandayken) sessizce dinlemeyi bırakıyordu. Üç kök neden giderildi:
  - **Pusher heartbeat:** `pusher:ping` → `pusher:pong` cevabı + istemci-tarafı watchdog (trafik yoksa proaktif ping, `activity_timeout + grace` boyunca aktivite yoksa ölü socket'i kapat). Önceden hiç pong gönderilmiyordu → sunucu ~2 dakikada bağlantıyı kapatıyordu.
  - **Otomatik reconnect:** `close`/`error` durumunda exponential backoff ile yeniden bağlanma (`sevenTvEvents` deseni). `intentionalClose` ile kanal kapatılınca sonsuz reconnect engellenir.
  - **Background throttling:** `mainWindow` `webPreferences.backgroundThrottling: false` — pencere arka plandayken timer/socket işleme durmaz.
  - **online/offline:** Ağ geri gelince otomatik reconnect (modül seviyesi, shell-agnostic) — modern shell geçişinde kaybolan handler geri getirildi.

## [Abonelik Event Ayrımı] — 2026-06-01

- **Fix:** Yenileme (renewal) yeni abone gibi davranıyordu ve hep aynı sabit mesajı gösteriyordu. Renewal tespiti artık `months > 1` (veya streak) bazlı → "aboneliğini yeniledi — X ay" vs "abone oldu — X ay".
- **Fix:** Re-sub (celebration) yolu artık chat'e banner basıyor + otomasyon `sub_event` rutinini tetikliyor (önceden sadece activity'e düşüyordu). `metadata.celebration.total_months` okunuyor; SubscriptionEvent ile 30sn dedup.
- **Fix (kritik):** Hediye abonelik (gift) bazen hiç görünmüyordu — payload alan adı farklı olduğunda reducer `gifted_usernames.length` throw ediyor, dıştaki try/catch sessizce yutuyordu. `gifted_usernames | usernames | gifted_users[].username | recipients` varyantları normalize edildi + guard eklendi.
- **New:** Otomasyon rutinlerinde `sub_event` trigger'ına alt-seçim — **Yeni abone / Yenileme / Hepsi** (`subType`). Gift recipient'lar renewal/sub olarak çift sayılmaz. Geriye uyumlu (eski kurallar `any`).

# 4.6.9 — 2026-05-22

Emote Rendering Unification — bkz aşağıdaki bölüm.

## [Emote Rendering Unification] — 2026-05-22

- **Fix:** `[emote:ID:NAME]` tokens now render correctly in all message surfaces. Previously broken in: UserWindow Messages tab, UserWindow Overview/Mod history excerpts, PopupHistory (user message history popup), reply preview area (Chat + ChatModern), composer reply target.
- **New helper:** `renderMessageHtmlSnippet(content, index, blocked, maxChars)` in `chatHtml.ts` — tokenize-then-truncate so emote tokens are never split mid-way. Appends Unicode `…` when truncated.
- **Deprecated:** `buildEmoteMessageHtml(content, sevenTvList)` — only renders global 7TV emotes; missed Kick channel/sub, BTTV, FFZ, and channel-specific 7TV. Kept for backward compat; flagged with `@deprecated` JSDoc. No production callers remain.
- **`UserWindowPayload` extended:** added optional `channelEmoteSets`, `globalEmoteSets`, `blockedEmotes` fields. UserWindow (separate Electron renderer with no Redux access) builds its own `EmoteIndex` locally via `buildEmoteIndex`. Backward compatible: existing payloads without these fields fall back to empty index.
- **CONSTRAINT-4 enforced everywhere:** all message HTML now goes through `renderMessageHtml` / `renderMessageHtmlSnippet` (sanitized via `escapeHtml` + `safeUrl`). UserWindow file comment updated accordingly.
- **Tests:** 13 new unit tests in `chatHtml.test.ts` covering rendering, escaping, snippet truncation at token boundary, Unicode ellipsis, blocked emote handling, and deprecated API behavior.

## [Modern UI (beta)] — 2026-05-20

- **LayoutModern shell:** 3-column layout (Chat / Activity / Moderation) + topbar with channel tabs, live pill, viewer count, uptime, category. Modern shell is now the default; classic accessible via Settings → Advanced → Modern UI toggle.
- **ChatModern:** Full chat panel with emote rendering (Kick/7TV/BTTV/FFZ), reply, pin, timeout/ban quick-actions, optimistic send, scroll pause/resume, emote autocomplete.
- **EmoteAutocompleteModern:** Inline autocomplete dropdown with provider badges, animated/zero-width/sub-only indicators.
- **EmotePickerModern:** Modal emote picker with per-provider tabs (Kick/7TV/BTTV/FFZ/Emoji/Favorites), search, preview pane, right-click favorite, provider status footer, focus trap (Sprint 7 a11y).
- **ActivityViewModern + KICKs Leaderboard:** Activity panel with filter chips (All/Subs/Gifts/KICKs/Rewards), expand drawer with raw JSON inspect (token-masked), reward accept/reject actions. KICKs leaderboard sub-tab with week/month/lifetime periods.
- **ModActionsModern:** Selected user card, 6 quick-action buttons (timeout/ban/clear/note/promote), chat controls panel (slow/sub/follower/emote/R9K localStorage toggles), suspended users list.
- **SettingsModern:** Side-nav IA with 6 sections — Channel (multi-channel, auto-connect), Account (OAuth status, sign-out), Permissions (scope matrix, re-authorize), Moderation (timeout defaults, mod check message, suspended users, blocked emotes), Emotes (provider status, GIF/badge toggles), Advanced (event subscriptions, verbose logging, shell toggle).
- **Design tokens:** OKLCH-based color palette under `[data-app-shell="modern"]` scope; Geist font; does not affect NextUI classic scope.
- **Settings → Advanced:** Modern UI toggle dispatches `chat-view-shell-preference-changed` event; App.tsx re-renders immediately without reload.
- **A11y (Sprint 7):** aria-label + title on all icon-only buttons; role=tablist/tab/switch; aria-modal + role=dialog + aria-labelledby on EmotePickerModern; focus trap hook (useFocusTrap); aria-expanded on activity row expand; aria-selected on all tab strips.
- **localStorage key:** `chatViewShellPreference` (replaces legacy `chatViewShellPreview` — migrated automatically on first load).

# 2.1.0

- Migrate to `css-minifier-webpack-plugin`

# 2.0.1

## Fixes

- Fix broken css linking in production build

# 2.0.0

## Breaking Changes

- drop redux
- remove counter example app
- simplify directory structure
- move `dll` dir to `.erb` dir
- fix icon/font import paths
- migrate to `react-refresh` from `react-hot-loader`
- migrate to webpack@5
- migrate to electron@11
- remove e2e tests and testcafe integration
- rename `app` dir to more conventional `src` dir
- rename `resources` dir to `assets`
- simplify npm scripts
- drop stylelint
- simplify styling of boilerplate app
- remove `START_HOT` env variable
- notarize support
- landing page boilerplate
- docs updates
- restore removed debugging support

# 1.4.0

- Migrate to `eslint-config-erb@2`
- Rename `dev` npm script to `start`
- GitHub Actions: only publish GitHub releases when on master branch

# 1.3.1

- Fix sass building bug ([#2540](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/2540))
- Fix CI bug related to E2E tests and network timeouts
- Move automated dependency PRs to `next` ([#2554](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/2554))
- Bump dependencies to patch semver

# 1.3.0

- Fixes E2E tests ([#2516](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/2516))
- Fixes preload entrypoint ([#2503](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/2503))
- Downgrade to `electron@8`
- Bump dependencies to latest semver

# 1.2.0

- Migrate to redux toolkit
- Lazy load routes with react suspense
- Drop support for azure-pipelines and use only github actions
- Bump all deps to latest semver
- Remove `test-e2e` script from tests (blocked on release of https://github.com/DevExpress/testcafe-browser-provider-electron/pull/65)
- Swap `typed-css-modules-webpack-plugin` for `typings-for-css-modules-loader`
- Use latest version of `eslint-config-erb`
- Remove unnecessary file extensions from ts exclude
- Add experimental support for vscode debugging
- Revert https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/2365 as default for users, provide as opt in option

# 1.1.0

- Fix #2402
- Simplify configs (https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/2406)

# 1.0.0

- Migrate to TypeScript from Flow ([#2363](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/2363))
- Use browserslist for `@babel/preset-env` targets ([#2368](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/2368))
- Use preload script, disable `nodeIntegration` in renderer process for [improved security](https://www.electronjs.org/docs/tutorial/security#2-do-not-enable-nodejs-integration-for-remote-content) ([#2365](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/2365))
- Add support for azure pipelines ([#2369](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/2369))
- Disable sourcemaps in production

# 0.18.1 (2019.12.12)

- Fix HMR env bug ([#2343](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/2343))
- Bump all deps to latest semver
- Bump to `electron@7`

# 0.18.0 (2019.11.19)

- Bump electron to `electron@6` (`electron@7` introduces breaking changes to testcafe end to end tests)
- Revert back to [two `package.json` structure](https://www.electron.build/tutorials/two-package-structure)
- Bump all deps to latest semver

# 0.17.1 (2018.11.20)

- Fix `yarn test-e2e` and testcafe for single package.json structure
- Fixes incorrect path in `yarn start` script
- Bumped deps
- Bump g++ in travis
- Change clone arguments to clone only master
- Change babel config to target current electron version

For full change list, see https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/2021

# 0.17.0 (2018.10.30)

- upgraded to `babel@7` (thanks to @vikr01 🎉🎉🎉)
- migrated from [two `package.json` structure](https://www.electron.build/tutorials/two-package-structure) (thanks to @HyperSprite!)
- initial auto update support (experimental)
- migrate from greenkeeper to [renovate](https://renovatebot.com)
- added issue template
- use `babel-preset-env` to target current electron version
- add [opencollective](https://opencollective.com/electron-react-boilerplate-594) banner message display in postinstall script (help support ERB 🙏)
- fix failing ci issues

# 0.16.0 (2018.10.3)

- removed unused dependencies
- migrate from `react-redux-router` to `connect-react-router`
- move webpack configs to `./webpack` dir
- use `g++` on travis when testing linux
- migrate from `spectron` to `testcafe` for e2e tests
- add linting support for config styles
- changed stylelint config
- temporarily disabled flow in appveyor to make ci pass
- added necessary infra to publish releases from ci

# 0.15.0 (2018.8.25)

- Performance: cache webpack uglify results
- Feature: add start minimized feature
- Feature: lint and fix styles with prettier and stylelint
- Feature: add greenkeeper support

# 0.14.0 (2018.5.24)

- Improved CI timings
- Migrated README commands to yarn from npm
- Improved vscode config
- Updated all dependencies to latest semver
- Fix `electron-rebuild` script bug
- Migrated to `mini-css-extract-plugin` from `extract-text-plugin`
- Added `optimize-css-assets-webpack-plugin`
- Run `prettier` on json, css, scss, and more filetypes

# 0.13.3 (2018.5.24)

- Add git precommit hook, when git commit will use `prettier` to format git add code
- Add format code function in `lint-fix` npm script which can use `prettier` to format project js code

# 0.13.2 (2018.1.31)

- Hot Module Reload (HMR) fixes
- Bumped all dependencies to latest semver
- Prevent error propagation of `CheckNativeDeps` script

# 0.13.1 (2018.1.13)

- Hot Module Reload (HMR) fixes
- Bumped all dependencies to latest semver
- Fixed electron-rebuild script
- Fixed tests scripts to run on all platforms
- Skip redux logs in console in test ENV

# 0.13.0 (2018.1.6)

#### Additions

- Add native dependencies check on postinstall
- Updated all dependencies to latest semver

# 0.12.0 (2017.7.8)

#### Misc

- Removed `babel-polyfill`
- Renamed and alphabetized npm scripts

#### Breaking

- Changed node dev `__dirname` and `__filename` to node built in fn's (https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/1035)
- Renamed `src/bundle.js` to `src/renderer.prod.js` for consistency
- Renamed `dll/vendor.js` to `dll/renderer.dev.dll.js` for consistency

#### Additions

- Enable node_modules cache on CI

# 0.11.2 (2017.5.1)

Yay! Another patch release. This release mostly includes refactorings and router bug fixes. Huge thanks to @anthonyraymond!

⚠️ Windows electron builds are failing because of [this issue](https://github.com/electron/electron/issues/9321). This is not an issue with the boilerplate ⚠️

#### Breaking

- **Renamed `./src/main.development.js` => `./src/main.{dev,prod}.js`:** [#963](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/963)

#### Fixes

- **Fixed reloading when not on `/` path:** [#958](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/958) [#949](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/949)

#### Additions

- **Added support for stylefmt:** [#960](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/960)

# 0.11.1 (2017.4.23)

You can now debug the production build with devtools like so:

```
DEBUG_PROD=true npm run package
```

🎉🎉🎉

#### Additions

- **Added support for debugging production build:** [#fab245a](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/941/commits/fab245a077d02a09630f74270806c0c534a4ff95)

#### Bug Fixes

- **Fixed bug related to importing native dependencies:** [#933](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/933)

#### Improvements

- **Updated all deps to latest semver**

# 0.11.0 (2017.4.19)

Here's the most notable changes since `v0.10.0`. Its been about a year since a release has been pushed. Expect a new release to be published every 3-4 weeks.

#### Breaking Changes

- **Dropped support for node < 6**
- **Refactored webpack config files**
- **Migrate to two-package.json project structure**
- **Updated all devDeps to latest semver**
- **Migrated to Jest:** [#768](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/768)
- **Migrated to `react-router@4`**
- **Migrated to `electron-builder@4`**
- **Migrated to `webpack@2`**
- **Migrated to `react-hot-loader@3`**
- **Changed default live reload server PORT to `1212` from `3000`**

#### Additions

- **Added support for Yarn:** [#451](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/451)
- **Added support for Flow:** [#425](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/425)
- **Added support for stylelint:** [#911](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/911)
- **Added support for electron-builder:** [#876](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/876)
- **Added optional support for SASS:** [#880](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/880)
- **Added support for eslint-plugin-flowtype:** [#911](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/911)
- **Added support for appveyor:** [#280](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/280)
- **Added support for webpack dlls:** [#860](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/860)
- **Route based code splitting:** [#884](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/884)
- **Added support for Webpack Bundle Analyzer:** [#922](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/922)

#### Improvements

- **Parallelize renderer and main build processes when running `npm run build`**
- **Dynamically generate electron app menu**
- **Improved vscode integration:** [#856](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/856)

#### Bug Fixes

- **Fixed hot module replacement race condition bug:** [#917](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/917) [#920](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/920)

# 0.10.0 (2016.4.18)

#### Improvements

- **Use Babel in main process with Webpack build:** [#201](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/201)
- **Change targets to built-in support by webpack:** [#197](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/197)
- **use es2015 syntax for webpack configs:** [#195](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/195)
- **Open application when webcontent is loaded:** [#192](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/192)
- **Upgraded dependencies**

#### Bug fixed

- **Fix `npm list electron-prebuilt` in package.js:** [#188](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/188)

# 0.9.0 (2016.3.23)

#### Improvements

- **Added [redux-logger](https://github.com/fcomb/redux-logger)**
- **Upgraded [react-router-redux](https://github.com/reactjs/react-router-redux) to v4**
- **Upgraded dependencies**
- **Added `npm run dev` command:** [#162](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/162)
- **electron to v0.37.2**

#### Breaking Changes

- **css module as default:** [#154](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/154).
- **set default NODE_ENV to production:** [#140](https://github.com/electron-react-boilerplate/electron-react-boilerplate/issues/140)

# 0.8.0 (2016.2.17)

#### Bug fixed

- **Fix lint errors**
- **Fix Webpack publicPath for production builds**: [#119](https://github.com/electron-react-boilerplate/electron-react-boilerplate/issues/119).
- **package script now chooses correct OS icon extension**

#### Improvements

- **babel 6**
- **Upgrade Dependencies**
- **Enable CSS source maps**
- **Add json-loader**: [#128](https://github.com/electron-react-boilerplate/electron-react-boilerplate/issues/128).
- **react-router 2.0 and react-router-redux 3.0**

# 0.7.1 (2015.12.27)

#### Bug fixed

- **Fixed npm script on windows 10:** [#103](https://github.com/electron-react-boilerplate/electron-react-boilerplate/issues/103).
- **history and react-router version bump**: [#109](https://github.com/electron-react-boilerplate/electron-react-boilerplate/issues/109), [#110](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/110).

#### Improvements

- **electron 0.36**

# 0.7.0 (2015.12.16)

#### Bug fixed

- **Fixed process.env.NODE_ENV variable in webpack:** [#74](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/74).
- **add missing object-assign**: [#76](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/76).
- **packaging in npm@3:** [#77](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/77).
- **compatibility in windows:** [#100](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/100).
- **disable chrome debugger in production env:** [#102](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/102).

#### Improvements

- **redux**
- **css-modules**
- **upgrade to react-router 1.x**
- **unit tests**
- **e2e tests**
- **travis-ci**
- **upgrade to electron 0.35.x**
- **use es2015**
- **check dev engine for node and npm**

# 0.6.5 (2015.11.7)

#### Improvements

- **Bump style-loader to 0.13**
- **Bump css-loader to 0.22**

# 0.6.4 (2015.10.27)

#### Improvements

- **Bump electron-debug to 0.3**

# 0.6.3 (2015.10.26)

#### Improvements

- **Initialize ExtractTextPlugin once:** [#64](https://github.com/electron-react-boilerplate/electron-react-boilerplate/issues/64).

# 0.6.2 (2015.10.18)

#### Bug fixed

- **Babel plugins production env not be set properly:** [#57](https://github.com/electron-react-boilerplate/electron-react-boilerplate/issues/57).

# 0.6.1 (2015.10.17)

#### Improvements

- **Bump electron to v0.34.0**

# 0.6.0 (2015.10.16)

#### Breaking Changes

- **From react-hot-loader to react-transform**

# 0.5.2 (2015.10.15)

#### Improvements

- **Run tests with babel-register:** [#29](https://github.com/electron-react-boilerplate/electron-react-boilerplate/issues/29).

# 0.5.1 (2015.10.12)

#### Bug fixed

- **Fix #51:** use `path.join(__dirname` instead of `./`.

# 0.5.0 (2015.10.11)

#### Improvements

- **Simplify webpack config** see [#50](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/50).

#### Breaking Changes

- **webpack configs**
- **port changed:** changed default port from 2992 to 3000.
- **npm scripts:** remove `start-dev` and `dev-server`. rename `hot-dev-server` to `hot-server`.

# 0.4.3 (2015.9.22)

#### Bug fixed

- **Fix #45 zeromq crash:** bump version of `electron-prebuilt`.

# 0.4.2 (2015.9.15)

#### Bug fixed

- **run start-hot breaks chrome refresh(CTRL+R) (#42)**: bump `electron-debug` to `0.2.1`

# 0.4.1 (2015.9.11)

#### Improvements

- **use electron-prebuilt version for packaging (#33)**

# 0.4.0 (2015.9.5)

#### Improvements

- **update dependencies**

# 0.3.0 (2015.8.31)

#### Improvements

- **eslint-config-airbnb**

# 0.2.10 (2015.8.27)

#### Features

- **custom placeholder icon**

#### Improvements

- **electron-renderer as target:** via [webpack-target-electron-renderer](https://github.com/chentsulin/webpack-target-electron-renderer)

# 0.2.9 (2015.8.18)

#### Bug fixed

- **Fix hot-reload**

# 0.2.8 (2015.8.13)

#### Improvements

- **bump electron-debug**
- **babelrc**
- **organize webpack scripts**

# 0.2.7 (2015.7.9)

#### Bug fixed

- **defaultProps:** fix typos.

# 0.2.6 (2015.7.3)

#### Features

- **menu**

#### Bug fixed

- **package.js:** include webpack build.

# 0.2.5 (2015.7.1)

#### Features

- **NPM Script:** support multi-platform
- **package:** `--all` option

# 0.2.4 (2015.6.9)

#### Bug fixed

- **Eslint:** typo, [#17](https://github.com/electron-react-boilerplate/electron-react-boilerplate/issues/17) and improve `.eslintrc`

# 0.2.3 (2015.6.3)

#### Features

- **Package Version:** use latest release electron version as default
- **Ignore Large peerDependencies**

#### Bug fixed

- **Npm Script:** typo, [#6](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/6)
- **Missing css:** [#7](https://github.com/electron-react-boilerplate/electron-react-boilerplate/pull/7)

# 0.2.2 (2015.6.2)

#### Features

- **electron-debug**

#### Bug fixed

- **Webpack:** add `.json` and `.node` to extensions for imitating node require.
- **Webpack:** set `node_modules` to externals for native module support.

# 0.2.1 (2015.5.30)

#### Bug fixed

- **Webpack:** #1, change build target to `atom`.

# 0.2.0 (2015.5.30)

#### Features

- **Ignore:** `test`, `tools`, `release` folder and devDependencies in `package.json`.
- **Support asar**
- **Support icon**

# 0.1.0 (2015.5.27)

#### Features

- **Webpack:** babel, react-hot, ...
- **Flux:** actions, api, components, containers, stores..
- **Package:** darwin (osx), linux and win32 (windows) platform.
