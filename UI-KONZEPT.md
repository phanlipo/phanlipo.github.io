# UI-Konzept: einheitliche Bedienelemente, Werkzeuglisten und Icons

**Status:** Vorschlag zur Abstimmung (November 2026), noch nichts umgesetzt.
**Grundlage:** Screenshots aller 57 Apps und der Vorlage (375 px, hell, Deutsch; jeweils die Startansicht und das geöffnete Menü) sowie eine Auswertung des Codes (Knöpfe, Icons, eigenes CSS je App).

Ziel: Wer eine App kennt, findet sich in jeder anderen sofort zurecht. Gleiche Handlungen sehen überall gleich aus, und Icons machen Knöpfe auf dem Handy schneller erkennbar.

---

## 1. Bestandsaufnahme

### Was schon einheitlich ist

- **Kopfleiste:** App-Icon, Titel, ☰ und 0–3 Schnellaktionen (`.head-btn`, 44 px). Die Icons sind durchweg **Tabler Outline** und meist gleich zugeordnet: `download` für Speichern (4 Apps), `arrow-back-up` für Rückgängig (5), `trash` (5), `copy` (2), `logout` für „Spiel verlassen“ (3), `pencil` für Bearbeiten (4), `x` für Schließen (3).
- Karten, Menü-Sheet, Fußzeile, Sprachumschalter, `.btn` / `.btn.primary`, Farb-Tokens, Dark Mode.
- Der Startbildschirm der Mehrspieler-Spiele (`card-games`, `quartet`, `sea-battle`) folgt schon einem gemeinsamen Muster.

### Befunde

| # | Befund | Beispiele |
|---|---|---|
| 1 | **Icons stehen fast nur in der Kopfleiste.** Von 1 207 Knöpfen im HTML haben 81 ein SVG-Icon (7 %), 51 ein Emoji (4 %), **1 075 nur Text (89 %)**. Hauptaktionen wie „PDF wählen“, „Transkribieren“, „Hinzufügen“ oder „Erinnerung speichern“ haben kein Icon. | fast alle |
| 2 | **Drei Icon-Quellen nebeneinander:** Tabler-SVG (in rund 30 Apps von Hand ins HTML kopiert, z. B. `download` viermal), **Emoji als Funktionssymbol** (🔴 Aufnehmen, ▶️ Start, ➕ Neue Schatzsuche, 📂 Öffnen, 🖥️ Computer, 📱 Zu zweit, 🎤 Aufnehmen, 🔁 Nochmal, 📳 Schwingen erkennen, 🍾 Drehen …) und **Textzeichen** (▶ ✕ ↔ ⇥ ▾). Emoji sehen auf Android, iPhone und Windows verschieden aus, lassen sich nicht einfärben (Akzent, Dark Mode, deaktiviert) und sitzen unterschiedlich hoch. | `loop-station`, `treasure-hunt`, `rock-paper-scissors`, `tic-tac-toe`, `talking-animal`, `camera-effects`, `move-play`, `reaction-game`, `whip`, `spin-the-bottle` |
| 3 | **Auswahlleisten baut jede App selbst:** `.seg` ist in 24 Apps einzeln definiert, in mindestens 8 verschiedenen CSS-Varianten (eckig/rund, 1 px/2 px Rand, Grid/Flex). Dazu kommen `.tabs`, `.chips`, `.choice(s)`, `.opts`, `.options`. Sichtbar wird das als dunkle eckige Leiste (`api-check`), Pillen mit Emoji (`dice-coin`), Pillen-Tabs (`duty-roster`, `wind-instruments`), abgeschnittene Pillen (`brew-calculator`) und zweizeilige Segmente („Link / Text“ in `qr-code`). | siehe links |
| 4 | **Kachel-Auswahl** (Optionen mit Bild) in unterschiedlichen Größen und mit unterschiedlicher Kennzeichnung der Auswahl: Tabler-Icon in Akzentfarbe (`sensors`), Emoji (`whip`, `whoopee-cushion`, `talking-animal`, `camera-effects`, `rock-paper-scissors`), Illustration (`plush-puzzle`). | |
| 5 | **Werkzeugleisten unten** (Bühnen-Apps) ohne gemeinsames Muster: Icon + Text (`mind-map`), nur Icon (`paint`), Buchstaben B/I/S/H ohne Text (`markdown-editor`), Icon + Emoji-Text (`loop-station`), Textzeichen `⇥ ( ) [ ]` (`code-runner`). | |
| 6 | **Hauptaktion uneinheitlich:** mal volle Breite (`dice-coin`, `marquee`, `doc-scanner`), mal schmal links (`api-check`, `data-logger`, `rss-reader`, `reminders`), mal zentriert (`pdf-viewer`, `piano`). **Gesperrte Knöpfe** erscheinen als blasse Akzentfarbe (`pdf-edit`, `pdf2word`, `video-to-audio`, `voice-transcriber`) – das wirkt wie „lädt“, und niemand sagt, was noch fehlt. | |
| 7 | **„Datei wählen“ in vier Varianten:** gestrichelte Fläche als Knopf (`audio-studio`, `pdf2word`, `video-to-audio`, `voice-transcriber`), Fläche mit Knopf darin (`image-converter`), großer Primärknopf (`pdf-edit`, `video-analysis`, `doc-scanner`), zentrierter Knopf im Leerzustand (`pdf-viewer`). Nirgends zeigt ein Icon, welche Art Datei gemeint ist. | |
| 8 | **Leerzustände** einmal nur als Text (`calc-pad`, `ai-chat`), einmal mit Emoji-Bild (`loop-station`, `treasure-hunt`) oder in gestricheltem Rahmen (`image-swipe`, `qr-code`, `raffle`), mal mit und mal ohne Knopf. | |
| 9 | **Schrittnummern** „1 · Audiodatei wählen“ gibt es nur in einigen Apps, als „1 ·“, als „1.“ oder in Tabs (`brew-calculator`). | `audio-studio`, `pdf2word`, `video-to-audio`, `voice-transcriber`, `securpharm-scanner`, `image-converter` |
| 10 | **Hinweise und Status** sehen jedes Mal anders aus: orangefarbener Randbalken (`ai-chat`), Emoji 🔕 (`reminders`), grauer Kasten (`duty-roster`), Fließtext. | |
| 11 | **Menü:** Jedes Menü beginnt mit der großen Karte „📲 Als App installieren“ (etwa ⅓ der Bildschirmhöhe), die eigenen Einträge der App rutschen nach unten. Abschnitte sind mal offene Karten (Einstellungen, Verlauf), mal zugeklappt (Daten sichern, Anleitung). Es gibt keine Icons, verschiedene Überschriftgrößen (`camera-effects`: „Personenerkennung“ größer als „Einstellungen“) und verstreute Text-Knöpfe als Aktionen (`pdf-viewer`: Andere PDF öffnen / Herunterladen / PDF schließen; `mind-map`). „Löschen“ ist mal rot, mal nicht. | alle |
| 12 | **Formularfelder:** 29 Apps haben noch ihr eigenes `.field`-CSS, nur 2 nutzen schon `.form-field`. | |

---

## 2. Leitlinien

1. **Ein Icon-Satz:** nur **Tabler Outline**, Strichstärke 2, Farbe `currentColor`. Er ist schon die Quelle der App-Icons (`scripts/vendor.json`, Eintrag `tabler-icons`).
2. **Feste Größen:** 24 px in Kopfleiste und Werkzeugleiste, 20 px in Knöpfen mit Text und in Menüzeilen, 16 px neben Fließtext und in Hinweisen, 32–48 px in Kacheln und Leerzuständen.
3. **Icon + Text ist der Normalfall.** Nur ein Icon ohne Text gibt es ausschließlich in der Kopfleiste und in Werkzeugleisten, mit Icons aus dem Lexikon (Abschnitt 3) und immer mit `aria-label` und `title`.
4. **Ein Wort, ein Icon – und umgekehrt.** Das Lexikon ist verbindlich: Wer „Teilen“ anbietet, nimmt `share`; `share` bedeutet nie etwas anderes.
5. **Emoji sind Inhalt, keine Bedienung.** Erlaubt sind sie für Spielfiguren, Tiere, die „Charaktere“ von Geräuschen und Stimmen, Sportarten, Kartensätze und Kinder-Illustrationen. Nicht erlaubt sind sie als Funktionssymbol vor einem Knopftext, in Statusmeldungen und in Überschriften (auch nicht 📲 im Menü).
6. **Pro Ansicht eine Hauptaktion** (`.btn.primary`). Auf dem Handy nimmt sie die volle Breite ein und steht am Ende ihrer Karte, in Bühnen-Apps unten in Daumennähe.
7. **Die Akzentfarbe markiert genau zwei Dinge:** die Hauptaktion und die aktuelle Auswahl. Icons erscheinen in Akzentfarbe nur in Kacheln und in aktiven Werkzeugen.
8. **Gesperrt heißt erklärt:** Ein gesperrter Knopf bekommt einen sichtbaren Hinweis, was noch fehlt (z. B. „Erst ein Video wählen.“).

---

## 3. Icon-Lexikon

Verbindliche Zuordnung von Bedeutung zu Tabler-Name. Alle Namen sind gegen `@tabler/icons@3.50.0` geprüft. Wo ein Icon heute schon so verwendet wird, ist das vermerkt – das Lexikon übernimmt den Bestand und ergänzt ihn.

### Datei & Daten

| Bedeutung (DE / EN) | Tabler | heute schon |
|---|---|---|
| Neu, Hinzufügen / New, Add | `plus` | – (➕ in `treasure-hunt`, „+“ als Text) |
| Neue Datei / New file | `file-plus` | `markdown-editor` |
| Öffnen, Datei wählen / Open | `folder-open` | `piano` (📂 in `treasure-hunt`) |
| Datei hierher ziehen (Ablagefläche) / Drop file | `file-upload` | – |
| Speichern, Herunterladen / Save, Download | `download` | `paint`, `function-plotter`, `loop-station`, `markdown-editor` |
| Teilen / Share | `share` | `markdown-editor`, `pdf-viewer` (`paint` hat eine abweichende Variante) |
| Kopieren / Copy | `copy` | `ai-chat`, `calc-pad` |
| Einfügen / Paste | `clipboard` | `calc-pad` |
| Drucken / Print | `printer` | – |

### Bearbeiten

| Bedeutung | Tabler | heute schon |
|---|---|---|
| Bearbeiten / Edit | `pencil` | `lucky-wheel`, `raffle` |
| Löschen / Delete | `trash` | `calc-pad`, `code-runner`, `loop-station`, `mind-map`, `paint` |
| Leeren, Radieren / Clear | `eraser` | `code-runner`, `paint` |
| Rückgängig / Undo | `arrow-back-up` | 5 Apps |
| Wiederholen / Redo | `arrow-forward-up` | `business-card`, `loop-station` |
| Zurücksetzen / Reset | `restore` | – |
| Suchen / Search | `search` | – |
| Filtern / Filter | `filter` | – |

### Medien & Geräte

| Bedeutung | Tabler | heute schon |
|---|---|---|
| Abspielen / Pause / Stopp | `player-play` / `player-pause` / `player-stop` | `playlist-player`, `move-play` (▶ als Zeichen in `audio-studio`, `text-to-speech`, `plush-puzzle`) |
| Aufnehmen / Record | `player-record` (rot gefüllt während der Aufnahme) | – (🔴 in `loop-station`, 🎤 in `talking-animal`) |
| Zum Anfang / Vor / Zurück | `player-skip-back` / `player-skip-forward` | `playlist-player` |
| Ton an / aus | `volume` / `volume-off` | `move-play` |
| Mikrofon an / aus | `microphone` / `microphone-off` | `wind-instruments` |
| Kamera, Foto / Kamera wechseln | `camera` / `camera-rotate` | `camera-effects` |
| Video / Bild / Musik | `video` / `photo` / `music` | `cast-demo` |

### Ansicht & Navigation

| Bedeutung | Tabler | heute schon |
|---|---|---|
| Menü | `menu-2` | `common.js` |
| Schließen / Close | `x` | `business-card`, `piano`, `treasure-hunt` |
| Zurück / Weiter (Seite, Woche, Oktave) | `chevron-left` / `chevron-right` | `piano`, `duty-roster` |
| Aufklappen | `chevron-down` | (▸ ▾ als Zeichen in `<summary>`) |
| Vollbild / Vollbild beenden | `maximize` / `minimize` | `pdf-viewer` |
| Alles zeigen, Einpassen | `focus-centered` | `mind-map` |
| Vergrößern / Verkleinern | `zoom-in` / `zoom-out` | – („+“/„−“ als Text in `function-plotter`) |
| Neu laden (Update) | `refresh` | `common.js` |

### Spiel & Mitspieler

| Bedeutung | Tabler | heute schon |
|---|---|---|
| Mitspieler, Zu zweit / Players | `users` | `spin-the-bottle` (👥 in `move-play`, `tic-tac-toe`) |
| Ein Spieler | `user` | – (👤 in `move-play`) |
| Gegen den Computer | `device-desktop` | – (🖥️ in `rock-paper-scissors`, 🤖 in `tic-tac-toe`) |
| Mit anderen Handys | `devices` | – |
| Beitreten (Code scannen) | `scan` | – |
| Zufall, Würfeln | `dice-5` | – (🎲) |
| Mischen | `arrows-shuffle` | – |
| Seiten tauschen | `arrows-left-right` | `scoreboard` |
| Bestwerte | `trophy` | `reaction-game` |
| Tipp | `bulb` | `laser-mirrors` |
| Lösung zeigen | `eye` | `plush-puzzle` |
| Spiel verlassen (Sitzung beenden) | `logout` | `card-games`, `quartet`, `sea-battle` |
| Laufende Runde stoppen | `player-stop` | `move-play` |

### Status

| Bedeutung | Tabler | Farbe |
|---|---|---|
| Info | `info-circle` | `--muted` / Text |
| Warnung | `alert-triangle` | Warnfarbe |
| Fehler | `alert-circle` | `--err` |
| Erledigt | `circle-check` | `--ok` |
| Benachrichtigungen an / aus | `bell` / `bell-off` | – (🔕 in `reminders`) |

### Menü-Abschnitte (gelten für alle Apps)

| Abschnitt | Tabler |
|---|---|
| Einstellungen | `settings` |
| Verlauf | `history` |
| Daten sichern & übertragen | `database` |
| Anleitung & Hinweise | `help-circle` |
| Fehlersuche | `bug` |
| Als App installieren | `device-mobile-down` |
| Sprache | `language` |
| Alle Tools | `apps` |

App-eigene Listen im Menü (Meine Mindmaps, Feeds, Playlists, Profile) bekommen ein passendes Icon aus derselben Bibliothek, das in der App-README festgehalten wird.

---

## 4. Bausteine in `base.css`

Neue gemeinsame Klassen, damit Apps keine eigenen Varianten mehr bauen müssen. Alle Bausteine haben Touch-Ziele ≥ 44 px, funktionieren hell und dunkel und nutzen nur Tokens.

| Baustein | Markup (gekürzt) | Regel |
|---|---|---|
| **Icon** | `<svg class="ic" aria-hidden="true"><use href="../assets/icons.svg#download"/></svg>` bzw. `Tools.icon('download')` | Größe über den Kontext (siehe Leitlinie 2), Farbe `currentColor` |
| **Knopf mit Icon** | `<button class="btn primary block">${icon} Audio herausziehen</button>` | Icon vor dem Text, Abstand 8 px. `.block` = volle Breite. `.btn.icon` = quadratisch 44 px, nur Icon + `aria-label` |
| **Umschalter** `.seg` | `<div class="seg" role="radiogroup">` mit Knöpfen `aria-pressed` | 2–4 kurze, sich ausschließende Optionen, gleich breit, Auswahl in Akzent, optional Icon. Ersetzt alle 8 eigenen `.seg`-Varianten |
| **Chips** `.chips` | Reihe von Pillen, waagrecht scrollbar | 5+ Optionen oder Ansichten (Woche/Team/Räume, Instrumente, Würfelseiten). Bei sehr vielen Optionen ein `<select>` |
| **Kacheln** `.tiles` | Raster mit Bild oben und Text darunter | Optionen mit Bild (Sensoren, Geräusche, Stimmen, Effekte). Bild = Tabler-Icon (Funktion) oder Emoji/Illustration (Inhalt). 3 Spalten bei 375 px, Auswahl = Akzentfläche |
| **Werkzeugleiste** `.toolbar` | unten in Bühnen-Apps, Knöpfe mit Icon über kurzem Wort | höchstens 5 Einträge, sonst „Mehr“ (`dots`). Immer mit Beschriftung; nur bei allgemein bekannten Formatierungen (B, I) darf sie fehlen. Aktives Werkzeug in Akzent |
| **Ablagefläche** `.dropzone` | `<label class="dropzone">` mit Icon `file-upload`, „PDF wählen“ und „oder hierher ziehen“ | einziges Muster zum Datei-Wählen; Tippen öffnet die Dateiauswahl, Ziehen funktioniert auf dem PC. Kamera/Aufnahme als zweiter Knopf darunter |
| **Leerzustand** `.empty` | Icon 44 px (gedämpft), ein Satz, optional Hauptaktion | statt freiem Text oder Emoji-Bild; Kinder-Apps dürfen eine Illustration nehmen |
| **Schritt** `.step` | `<h2><span class="step">1</span>Video wählen</h2>` | für feste Abläufe (Datei → Einstellung → Ergebnis), runder Zahlpunkt in Akzent |
| **Hinweis** `.notice` (`.info`, `.warn`, `.err`, `.ok`) | Icon aus dem Abschnitt „Status“ + Text | ersetzt Randbalken, Emoji-Status und graue Kästen; Fehler mit `role="alert"` |
| **Kennzahl** `.stat` | große Zahl + kleine Beschriftung | Punkte, Ergebnisse (`reaction-game`, `rock-paper-scissors`, `brew-calculator`) |
| **Gesperrt** | `.btn:disabled` grau statt blasser Akzent, dazu `.notice.info` mit Grund | Leitlinie 8 |

Die Bildtafel „Bausteine“ (siehe unten) zeigt Menü, Datei-App, Bühnen-App und Spiel als Entwurf.

---

## 5. Menü als einheitliche Werkzeugliste

Das Menü ist der Ort für alles, was selten gebraucht wird. Es soll in jeder App gleich aufgebaut sein und sich wie eine Liste mit Icons lesen lassen (wie die Einstellungen auf dem Handy):

```
┌ Menü                                   ✕ ┐
│ ┌──────────────────────────────────────┐ │  1. Aktionen der App (data-menu, Menüliste)
│ │ 📂  Andere PDF öffnen                │ │     Zeile 52 px: Icon 20 px · Text
│ │ ⬇  Herunterladen                     │ │
│ │ ✕  PDF schließen                (rot)│ │     Gefährliches am Ende, rot
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │  2. Bereiche der App (Meine Mindmaps, Feeds …)
│ │ ⚙  Einstellungen                   ⌄ │ │  3. Standardbereiche, immer in dieser Reihenfolge,
│ │ ⟲  Verlauf                         3 │ │     zugeklappt, Icon aus Abschnitt 3
│ │ ⛁  Daten sichern & übertragen      ⌄ │ │
│ │ ?  Anleitung & Hinweise            ⌄ │ │
│ │ 📱 Als App installieren            ⌄ │ │  4. Installieren: eine Zeile statt großer Karte
│ └──────────────────────────────────────┘ │
│        [ Deutsch | English ]             │  5. Sprache, Fußzeile
└──────────────────────────────────────────┘
```
(Die Zeichen stehen hier nur für die Tabler-Icons.)

**Regeln:**

- **Reihenfolge:** Aktionen → App-Bereiche → Einstellungen → Verlauf → Daten sichern → Anleitung → Installieren → Sprache/Fußzeile. Die Installations-Karte rückt also vom Anfang ans Ende und wird zu einer aufklappbaren Zeile (in der installierten App ist sie wie bisher ausgeblendet).
- **Abschnitte** sind `<details class="card" data-menu data-icon="settings">` mit `<summary>`. `common.js` setzt das Icon und den Pfeil (`chevron-down`) ein. Die Standardbereiche (Daten sichern, Anleitung, Installieren, Sprache) bekommen ihr Icon zentral – **das ändert alle Apps auf einmal**, ohne dass eine App angepasst werden muss.
- **Aktionen** im Menü stehen als `.menu-list` mit `<button data-icon="…">` untereinander, nicht als verstreute Text-Knöpfe. „Löschen/Schließen/Verwerfen“ stehen am Ende, in `--err`, mit `trash` bzw. `x`.
- **Überschriften** innerhalb eines Abschnitts sind einheitlich `h3` (16 px). Unterbereiche wie „Personenerkennung“ werden zu eigenen Abschnitten oder zu `h4`.
- **Nach einer Aktion, die zur App zurückführt:** `Tools.menu.close()` (wie bisher).

---

## 6. Technische Umsetzung

### Icon-Sprite statt kopierter SVGs

- **`assets/icons.svg`**: ein generiertes Sprite mit `<symbol id="…">` für genau die Icons, die irgendwo verwendet werden (geschätzt 80–100 Icons, etwa 25–35 KB, einmal im Cache für alle Apps).
- **Erzeugen:** `node scripts/build-icons.mjs --sprite` liest alle Namen aus `href="../assets/icons.svg#name"` und `Tools.icon('name')` (Namen immer **wörtlich**, wie bei den Vendor-Pfaden), holt die Tabler-Dateien in der Version aus `vendor.json` (wie heute schon für die App-Icons) und schreibt das Sprite. Die Datei wird wie die App-Icons eingecheckt und gilt als generiert.
- **Prüfen:** `node scripts/build.mjs --check` meldet ohne Netz einen Fehler, wenn ein verwendeter Name im Sprite fehlt oder nicht im Lexikon steht.
- **Offline:** `build.mjs` nimmt `../assets/icons.svg` in jedes `sw.js` auf (wie `base.css`).
- **CSP:** Das Sprite kommt vom eigenen Ursprung; `<use href>` auf eine gleich-originige Datei braucht keine neue Ausnahme. Safari, Firefox und Chrome unterstützen das.
- **`Tools.icon(name)`** in `common.js` gibt das `<svg class="ic" aria-hidden="true"><use …/></svg>` als Text zurück – für Knöpfe, die per Script entstehen (z. B. `treasure-hunt`, `calc-pad`).
- **Lexikon als Daten:** `scripts/icons.json` (Bedeutung → Tabler-Name, Text DE/EN). Daraus entstehen die Bildtafel und die Prüfung.

**Erwogen und verworfen:** Icons beim Build direkt ins HTML schreiben (wäre ohne zusätzlichen Abruf, bläht aber jede Seite auf und macht große Teile des handgeschriebenen HTML zu generierten Bereichen) und Icons per Script nachladen (kurzes Flackern, ohne Script keine Icons).

### Allgemeine Tests (neu, z. B. `tests/ui.spec.mjs`)

- Jeder `.head-btn`- und `.toolbar`-Knopf hat ein `svg.ic` und einen zugänglichen Namen.
- Kein Knopftext beginnt mit einem Emoji, außer in `.tiles` und in Bereichen mit `data-content` (Spielinhalt).
- Gleiche Aktionen haben gleiche Icons: Wenn ein `aria-label` einem Lexikon-Wort entspricht (z. B. „Rückgängig“), muss das passende Icon verwendet sein.
- Die Bausteine bestehen axe hell und dunkel (laufen über die vorhandenen a11y-Tests ohnehin mit).

### Pflege

- `AGENTS.md` bekommt nach der Abstimmung einen kurzen Abschnitt „Bedienelemente & Icons“ mit den Leitlinien aus Abschnitt 2 und einem Verweis auf das Lexikon.
- `template/` zeigt alle Bausteine (Knopf mit Icon, `.seg`, `.dropzone`, `.empty`, `.notice`, Menü-Abschnitt mit `data-icon`).

---

## 7. Umsetzung in Schritten

Jeder Schritt ist ein eigener PR mit Vorher/Nachher-Screenshots (hell und dunkel, 375 px) und `npm run test:app` für die betroffenen Apps.

1. **Grundlage (sichtbar nur in der Vorlage):** Sprite-Erzeugung, `Tools.icon`, Lexikon, Bausteine in `base.css`, `template/`, Tests, Abschnitt in `AGENTS.md`.
2. **Menü (wirkt auf alle Apps):** Icons für Standardbereiche, Installieren als Zeile ans Ende, `data-icon` für `data-menu`-Abschnitte, `.menu-list`.
3. **Datei-Apps:** `audio-studio`, `pdf2word`, `video-to-audio`, `voice-transcriber`, `pdf-edit`, `pdf-viewer`, `image-converter`, `doc-scanner`, `video-analysis`, `securpharm-scanner` → `.dropzone`, `.step`, Knöpfe mit Icons, gesperrte Knöpfe mit Grund.
4. **Bühnen-Apps mit Werkzeugen:** `paint`, `mind-map`, `markdown-editor`, `loop-station`, `code-runner`, `business-card`, `calc-pad`, `songbook`, `piano`, `function-plotter`, `playlist-player` → `.toolbar`, kopierte SVGs durch das Sprite ersetzen.
5. **Spiele & Spaß:** `card-games`, `quartet`, `sea-battle`, `tic-tac-toe`, `rock-paper-scissors`, `reaction-game`, `dice-coin`, `lucky-wheel`, `raffle`, `spin-the-bottle`, `scoreboard`, `move-play`, `laser-mirrors`, `plush-puzzle`, `treasure-hunt`, `whip`, `whoopee-cushion`, `talking-animal`, `camera-effects`, `image-swipe`, `wind-instruments` → Emoji aus den Bedienknöpfen (der Inhalt bleibt), `.seg`/`.tiles`, ein gemeinsamer Mehrspieler-Startbildschirm.
6. **Formular-Apps:** `api-check`, `brew-calculator`, `countdown`, `calendar-events`, `data-logger`, `reminders`, `rss-reader`, `qr-code`, `secret-santa`, `duty-roster`, `text-to-speech`, `marquee`, `ai-chat`, `sensors`, `cast-demo` → `.form-field` statt `.field`, `.seg`/`.chips`, `.notice`.

Gespeicherte Daten und Schlüssel bleiben dabei unverändert; es ändert sich nur die Darstellung.

---

## 8. Offene Fragen zur Abstimmung

1. **Emoji in Kinder- und Spaß-Apps:** Sollen die Kacheln von `whoopee-cushion`, `whip`, `talking-animal`, `camera-effects` ihre Emoji behalten (Vorschlag: ja, als Inhalt) oder einheitliche Illustrationen bekommen?
2. **Werkzeugleiste immer beschriftet?** Vorschlag: ja. Die Ausnahme sind Formatierungszeichen in `markdown-editor`, die zusätzlich einen Tooltip und `aria-label` haben.
3. **Menü flach oder mit Unterseiten?** Vorschlag: flach mit zugeklappten Abschnitten (wie heute, nur mit Icons). Unterseiten würden mehr Code in `common.js` bedeuten.
4. **Kopfleiste:** Bleibt es bei höchstens zwei Schnellaktionen in Bühnen-Apps (heute bis zu drei in `pdf-viewer`)?

---

## Anhang: Befunde je App (Kurzfassung)

| App | Auffälligkeiten | Maßnahmen |
|---|---|---|
| ai-chat | Warnung als Randbalken, Senden-Knopf blass | `.notice.warn`, `.btn.icon` mit `send` |
| api-check | dunkle eckige `.seg`, Hauptaktion schmal | `.seg`, `.btn.primary.block` |
| audio-studio | Ablagefläche ohne Icon, ▶ als Zeichen | `.dropzone`, `player-play` |
| brew-calculator | Tab-Pillen abgeschnitten, eigenes `.field` | `.chips`, `.form-field` |
| business-card | Werkzeuge Text/Bild/QR als Text-Knöpfe | `.toolbar` bzw. Knöpfe mit Icons |
| calc-pad | gut; Tastenfeld mit eigenen Zeichen | Sprite statt kopierter SVGs |
| calendar-events | nur Text-Knöpfe | Hauptaktion mit Icon `calendar` |
| camera-effects | Tabs mit Emoji, Effekt-Kacheln Emoji | `.seg` mit Tabler-Icon, `.tiles` (Emoji bleibt als Inhalt) |
| card-games, quartet, sea-battle | Startbildschirm ähnlich, aber nicht gleich | gemeinsamer Mehrspieler-Start mit `device-desktop` / `devices` / `scan` |
| cast-demo | ok | `.seg` |
| code-runner | Werkzeugleiste mit Textzeichen `⇥ ( ) [ ]` | `.toolbar` (Zeichen als Inhalt erlaubt, aber gleiche Größe) |
| countdown | Ergebnis-Einheiten als Pillen | `.chips` |
| data-logger | Hauptaktion schmal mit „+“ als Text | `plus`, `.block` |
| dice-coin | Emoji in Umschalter | `.seg` mit `dice-5` / `coin` |
| doc-scanner | großer Primärknopf statt Ablagefläche | `.dropzone` + Kamera-Knopf |
| duty-roster | Ansichten als Pillen, grauer Hinweis | `.chips`, `.notice.info` |
| function-plotter | +/− als Text, Emoji im Code | `zoom-in` / `zoom-out` |
| image-converter | Ablagefläche mit Knopf darin | `.dropzone` |
| image-swipe | ♥ als Zeichen | `heart` |
| laser-mirrors | ⚡ Laser-Knopf | `.btn` mit Tabler-Icon |
| loop-station | 🔴 Aufnehmen, ▶️ Start | `player-record`, `player-play`, `.toolbar` |
| lucky-wheel, raffle | gut | Sprite |
| markdown-editor | Formatierung ohne Beschriftung | `.toolbar` mit Tooltips |
| marquee | ok | `.seg` |
| mind-map | Werkzeugleiste schon vorbildlich | als Vorlage für `.toolbar` |
| move-play | 👤/👥 im Umschalter | `.seg` mit `user` / `users` |
| paint | Werkzeugleiste ohne Beschriftung, Teilen-Icon abweichend | `.toolbar`, `share` |
| pdf-edit, pdf2word, video-to-audio, voice-transcriber | blass gesperrte Hauptaktion ohne Grund | gesperrt + `.notice.info`, `.dropzone`, `.step` |
| pdf-viewer | drei Kopfleisten-Aktionen, Menü-Aktionen verstreut | `.menu-list` |
| piano, songbook | Player-Leiste eigen | gemeinsame Player-Leiste (`player-*`) |
| playlist-player | gut, nutzt schon `.form-field` | Sprite |
| plush-puzzle | ▶ als Zeichen | `player-play` |
| qr-code | zweizeiliges Segment „Link / Text“ | `.seg` mit Icons (`link`, `wifi`, `address-book`) |
| reaction-game | Emoji in Spielauswahl | `.seg` (Emoji als Inhalt ok) |
| reminders | 🔕-Status | `.notice.warn` mit `bell-off` |
| rock-paper-scissors | 🖥️/📱/🎲/🧠 in Umschaltern | `.seg` mit `device-desktop` / `users` |
| rss-reader | gut, nutzt schon `.form-field` | Knöpfe mit Icons |
| scoreboard | Sportarten mit Emoji | ok (Inhalt) |
| secret-santa | 🎁 Knopf | Hauptaktion mit `gift` |
| securpharm-scanner | Schritte, gut | `.seg`, `.step` |
| sensors | Kacheln mit Tabler-Icons – vorbildlich | als Vorlage für `.tiles` |
| spin-the-bottle | 🍾 Drehen | `rotate-clockwise` oder ohne Icon |
| talking-animal, whip, whoopee-cushion | 🎤 / 📳 / 🔁 in Bedienknöpfen | Tabler-Icons; Kacheln behalten Emoji |
| text-to-speech | ▶ als Zeichen | `player-play` |
| tic-tac-toe | 👥 / 🤖 | `users` / `device-desktop` |
| treasure-hunt | 221 Emoji, auch ➕ 📂 ✏️ in Knöpfen | Knöpfe auf Tabler, Spielinhalt bleibt |
| video-analysis | Primärknopf statt Ablagefläche | `.dropzone` + Aufnehmen |
| wind-instruments | Pillen-Tabs | `.chips` |
