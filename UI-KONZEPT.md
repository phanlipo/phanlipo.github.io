# UI-Konzept: einheitliche Bedienelemente, Werkzeuglisten und Icons

**Status:** abgestimmt und umgesetzt (November 2026), die Entscheidungen stehen in Abschnitt 8. Die Regeln in Kurzform stehen in `AGENTS.md` unter „Bedienelemente & Icons“; die allgemeinen Prüfungen in `tests/ui.spec.mjs`.
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
3. **Beschriftung, wenn Platz ist.** Knöpfe, Umschalter, Kacheln und Menüzeilen haben immer Text (Icon davor bzw. darüber). In Kopfleiste und Werkzeugleiste entscheidet der Platz (Regeln in Abschnitt 4 und 4a). Ein Knopf ohne sichtbaren Text nimmt ein Icon aus dem Lexikon (Abschnitt 3) und hat immer `aria-label` und `title`.
4. **Ein Wort, ein Icon – und umgekehrt.** Das Lexikon ist verbindlich: Wer „Teilen“ anbietet, nimmt `share`; `share` bedeutet nie etwas anderes.
5. **Keine Emoji in der Oberfläche.** Weder als Funktionssymbol noch als Bild in Kacheln, Statusmeldungen, Überschriften oder Leerzuständen (auch nicht 📲 im Menü). Stattdessen gilt diese Reihenfolge: (a) ein passendes Tabler-Icon (es gibt z. B. `hand-two-fingers`, `hand-grab`, `hand-stop`, `file-text`, `cat`, `dog`, `pig`, `fish`, `horse`, `robot`, `alien`, `ghost`, `wind`, `droplet`, `cloud-storm`, `ball-football`, `ping-pong`, `target`, `gift`, `bottle`, `map-2`, `key`, `trophy`, `swords`), (b) eine vorhandene eigene SVG-Illustration der App (z. B. die Tiere in `plush-puzzle`, die Katze in `talking-animal`), (c) nur Text. Ausgenommen sind Inhalte, die Nutzer selbst eingeben, und Datensätze, deren Zweck Emoji sind (Emoji-Beispiel in `image-swipe`).
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
| Favorit / Favourite (gefüllt = gesetzt) | `star` | Startseite |
| Sperren / Entsperren / Lock, Unlock | `lock` / `lock-open` | `keepass-viewer`, `pdf-viewer` |
| Geheimes zeigen / verbergen / Show, hide | `eye` / `eye-off` | `keepass-viewer`, `mail-account-qr` |

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
| Darstellung: Hell / Dunkel / System | `sun` / `moon` / `sun-moon` |
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
| **Kacheln** `.tiles` | Raster mit Bild oben und Text darunter | Optionen mit Bild (Sensoren, Geräusche, Stimmen, Effekte). Bild = Tabler-Icon oder eigene SVG-Illustration, nie Emoji. Immer mit Text. 3 Spalten bei 375 px, Auswahl = Akzentfläche |
| **Werkzeugleiste** `.toolbar` | unten in Bühnen-Apps **und als Aktionsleiste unter einem Ergebnis** (Text, Bild, Tabelle, Code: ab 2 Nebenaktionen wie Kopieren, Vorlesen, Teilen, Speichern, Drucken, Öffnen, Leeren), Knöpfe mit Icon, darunter ein kurzes Wort | **Aktionen zu einem Ergebnis** stehen ab 2 Stück immer in einer `.toolbar` direkt unter dem Ergebnis, nicht als `.row` aus `.btn` (die würde auf dem Handy umbrechen). Wörter kurz (Kopieren, Teilen, Speichern, CSV, JSON), Genaueres im `aria-label`/`title`; die Hauptaktion bleibt `.btn.primary` außerhalb der Leiste. **Beschriftung, wenn Platz ist:** Jeder Eintrag braucht mit Wort mindestens 64 px Breite, also bis zu 5 Einträge bei 375 px. Passen mehr hinein, zeigt die Leiste nur Icons (44 px, `aria-label` und `title`). Das macht `base.css` automatisch per Container-Abfrage, die App setzt immer beide (Icon und Wort). Werkzeuge, die nicht passen, kommen hinter „Mehr“: letzter Knopf der Leiste mit `dots`, Wort „Mehr“, `aria-expanded`/`aria-controls`; er öffnet direkt neben der Leiste ein `.toolbar-more` (Raster, Icon mit Wort, schließt nach Gebrauch und mit Escape). In die Leiste kommen die meistgebrauchten Werkzeuge (Beispiel `markdown-editor`: Rückgängig · Fett · Überschrift · Liste · Mehr). Aktives Werkzeug in Akzent |
| **Mehrzeiliges Textfeld** `textarea` | `<label class="form-field"><span>Notiz</span><textarea id="x"></textarea></label>` oder unter einer Überschrift | Standard für **jedes** `textarea` direkt in `base.css`: volle Breite, Innenabstand 10/12 px, Zeilenhöhe 1,5, in der Höhe ziehbar, Fokusrahmen in Akzent, Platzhalter gedämpft, auf dem Handy 16 px Schrift. Apps setzen höchstens eine andere Mindesthöhe. `.mono` für Codes, JSON und Rohdaten (Monospace, lange Zeichenketten brechen um) |
| **Editorfläche** `.editor-area` | `<div class="editor-area"><textarea …></textarea></div>` | Vollbild-Editoren (Markdown, Code): eine umrandete Fläche, die den freien Platz füllt; das Textfeld darin ohne eigenen Rahmen, Fokus zeigt die Fläche. Sonderfall Rechenzettel (liniertes Papier mit Ergebnisspalte) behält seine eigene Fläche |
| **Ablagefläche** `.dropzone` | `<label class="dropzone">` mit Icon `file-upload`, „PDF wählen“ und „oder hierher ziehen“ | einziges Muster zum Datei-Wählen; Tippen öffnet die Dateiauswahl, Ziehen funktioniert auf dem PC. Kamera/Aufnahme als zweiter Knopf darunter |
| **Leerzustand** `.empty-state` | Icon 44 px (gedämpft), ein Satz, optional Hauptaktion | statt freiem Text oder Emoji-Bild; Kinder-Apps dürfen eine Illustration nehmen |
| **Schritt** `.step` | `<h2><span class="step">1</span>Video wählen</h2>` | für feste Abläufe (Datei → Einstellung → Ergebnis), runder Zahlpunkt in Akzent |
| **Hinweis** `.notice` (`.info`, `.warn`, `.err`, `.ok`) | Icon aus dem Abschnitt „Status“ + Text | ersetzt Randbalken, Emoji-Status und graue Kästen; Fehler mit `role="alert"` |
| **Kennzahl** `.stat-box` | große Zahl + kleine Beschriftung | Punkte, Spielstände (`reaction-game`, `rock-paper-scissors`); Rechenergebnisse als `.calc-result` (siehe 4b) |
| **Übersicht** `.tool-overview` + **Tab-Leiste** `.tabbar` | Kacheln `[data-open]` in Gruppen mit `h2`, im Werkzeug `‹ Übersicht` + Tabs `role="tab"` | Apps mit mehreren Werkzeugen oder Rechnern, siehe 4b „Werkzeugkasten“ |
| **Feld mit Einheit** `.input-unit` | `<span class="input-unit"><input type="text" inputmode="decimal"><span class="unit">cm</span></span>` in `.form-field` | Einheit grau rechts im Feld statt im Label; Felder eines Rechners in `.calc-fields` (Raster, ab ~400 px zwei Spalten) |
| **Ergebnis** `.calc-result` | `<div class="calc-results"><div class="calc-result main"><span class="k">Volumen</span><b class="v">25,45 <small>L</small></b></div></div>` | Frage oben klein, Antwort groß darunter, linksbündig wie die Felder; Hauptergebnis `.main` in Akzent getönt. Herleitung/Tabellen in `<details class="sub">` |
| **Gesperrt** | `.btn:disabled` grau statt blasser Akzent, dazu `.notice.info` mit Grund | Leitlinie 8 |
| **Ankreuzfeld** `.check` | `<label class="check"><input type="checkbox"><span>Töne an<small>Erklärung</small></span></label>` | Kasten (22 px) links, Text rechts, Zeile 44 px; Erklärung als `<small>` darunter. Mehrere untereinander in `.checks`. Gilt auch für Radios mit Erklärung (Format-, Modellwahl); 2–4 kurze Optionen ohne Erklärung bleiben `.seg`. Test: jedes Ankreuzfeld steckt in `label.check` (oder `.seg`/`.chips`/`.tiles`) |
| **Rückfrage** `Tools.confirm` / `Tools.prompt` | `if (!await Tools.confirm(t('delQ'), { action: 'delete' })) return;` | statt `confirm()`/`prompt()` des Browsers: Dialog im Stil der App (Blatt von unten auf dem Handy, kleines Fenster ab 641 px). `action` benennt den Knopf: `ok`, `delete`, `reset`, `leave` (rot), `replace`, `load`, `download`; `ok`/`cancel` für eigene Wörter. Kein `confirm()`/`prompt()` mehr im Code |
| **Rückgängig** `Tools.undo(text, fn)` | Hinweis unten mit Knopf „Rückgängig“ (6 s) | **Einen einzelnen Eintrag** (Zettel, Datei, Skript, Vorlage, Datenpunkt) sofort löschen und Rückgängig anbieten statt nachzufragen. Rückfrage bleibt für Löschen von vielem (Verlauf leeren, alles zurücksetzen), für Downloads und für Verlassen einer Mehrspieler-Runde. `Tools.toast(text, { action: { label, icon, run } })` für andere Aktionen |
| **Dialog** `dialog.dialog` | `.dialog-head` (Titel + ✕ mit `data-close`), `.dialog-body`, `.dialog-actions` | eigene Dialoge (Formular, Passwort, Bild, Anleitung) im selben Rahmen wie die Rückfrage: Blatt von unten auf dem Handy, Fenster ab 641 px, `.wide` bis 900 px, `.full` ganzer Bildschirm. `[data-close]` und Tippen auf den Hintergrund schließen (`data-keep` verhindert Letzteres). Hauptaktion rechts, Gefährliches `.danger` ganz links |
| **Liste zum Verwalten** `.list-rows` | `<ul class="list-rows"><li><button class="open"><span class="name">…</span><span class="meta">…</span></button><button class="btn icon">trash</button></li></ul>` | gespeicherte Dinge (Dateien, Skripte, Zettel, Verlauf, Personen): eine Zeile je Eintrag, getrennt durch Linien, `.open` öffnet, `.name` mit … gekürzt (`.wrap` bricht um), `.meta` als kleine zweite Zeile, `li.current` fett; `.boxed` für Zeilen mit eigenem Kasten (Personen, Dateien eines Auftrags); `li.muted` für „Noch keine …“ |
| **Schieberegler** `input[type=range]` | `<div class="form-field range"><label for="v">Lautstärke <output>80 %</output></label><input type="range" id="v"></div>` | jeder Regler volle Breite, 44 px zum Greifen, Akzentfarbe direkt aus `base.css`; Wert rechts neben der Beschriftung (Ziffern gleich breit). In einer `.row` nimmt der Regler den freien Platz |
| **Fortschritt** `<progress>` / **Pegel** `.meter` | `<progress value="40" max="100">` · `<div class="meter"><i style="width:40%"></i></div>` | `progress` für laufende Arbeit (Download, Export), 8 px in Akzent; `.meter` für Live-Pegel (Mikrofon, Sensor), Farbe mit `.ok`/`.warn`/`.err`, Höhe darf die App ändern (Spielanzeige). Was passiert, steht als Text daneben |

Die Bildtafel „Bausteine“ (siehe unten) zeigt Menü, Datei-App, Bühnen-App und Spiel als Entwurf.

---

## 4b. Werkzeugkasten: Apps mit mehreren Werkzeugen oder Rechnern

**Standard** für jede App, die mehrere eigenständige Werkzeuge bündelt (`sensors`, `brew-calculator`, `medical-calculator`, `finance-calculator`, `unit-converter`). Aus dem Vergleich der drei bisherigen Varianten (Kacheln + Tabs in `sensors`, Sprung-Pillen in `brew-calculator`, umbrechende Pillen im ersten Finanzrechner) ist das die am besten erkennbare: alles auf einen Blick, Icon und Wort, große Ziele, nichts abgeschnitten.

1. **Start = Übersicht:** Kacheln (`.tiles` in `.tool-overview`, Tabler-Icon über dem Namen), ab etwa 6 Werkzeugen in Gruppen mit kleiner Überschrift (`h2`). Keine Nummern („1 ·“), keine Sammelseite „Mehr“ – jedes Werkzeug bekommt eine Kachel.
2. **Im Werkzeug = Tab-Leiste oben** (`.tabbar`, klebt beim Scrollen): links `‹ Übersicht`, daneben ein Tab je Werkzeug (Icon über kurzem Wort, offenes Werkzeug in Akzent unterstrichen), waagrecht wischbar; das offene Tab rückt in die Mitte. Pfeiltasten/Pos1/Ende wechseln. Bei vielen Werkzeugen (etwa ab 15) tragen die Tabs `data-group`: die Leiste zeigt dann nur die Gruppe des offenen Werkzeugs (Beispiel `unit-converter`); eine Suche über der Übersicht hilft beim Finden.
3. **Zurück-Taste** des Handys führt vom Werkzeug zur Übersicht (ein History-Eintrag), nicht aus der App.
4. **Das zuletzt offene Werkzeug** öffnet nach dem Neuladen wieder (Zustand `{ view, tab }` im Speicher der App).
5. **Ein Werkzeug = eine Karte** (`section.card.panel`, `role="tabpanel"`), Überschrift ohne Nummer.
6. **Rechner** darin: Felder mit Einheit (`.input-unit`) in `.calc-fields`, Ergebnisse als `.calc-result` (Hauptergebnis `.main`), Meldungen als `.notice`, „Formeln & Erklärung“ und Tabellen in `details.sub`.
7. **KI-Agenten:** Ein WebMCP-Werkzeug öffnet „sein“ Werkzeug (`box.open(name)`), damit das Ergebnis sichtbar ist.

Verhalten aus **`assets/shared/toolbox.js`** (`Toolbox.init({ state, onChange, onSelect, onOverview })`); Markup im Kommentar am Anfang der Datei und in `base.css`. Apps mit nur einem Rechner brauchen keine Übersicht, nutzen aber dieselben Felder und Ergebnisse.

---

## 4a. Kopfleiste: Schnellaktionen nach Bedarf

Es gibt keine feste Höchstzahl. Die Zahl richtet sich nach dem Bedarf der App und dem Platz:

- **In die Kopfleiste** gehört, was während der Hauptaufgabe immer wieder gebraucht wird und keinen Platz auf der Seite hat (Rückgängig, Speichern/Teilen des Ergebnisses, Vollbild, Kamera wechseln, Ton). Einmalige oder seltene Aktionen kommen ins Menü, Hauptaktionen auf die Seite.
- **Platzregel (wird getestet):** Bei 375 px Breite mit sichtbarem ↻-Knopf für Updates muss der Titel mindestens 96 px breit bleiben und darf nicht abgeschnitten werden. Bei einem kurzen Titel sind so bis zu 4 Schnellaktionen möglich, bei einem langen weniger. Was nicht passt, kommt als erste Zeile ins Menü.
- **Beschriftung:** In der Kopfleiste stehen nur Icons, denn für Text ist kein Platz. Deshalb nur Icons aus dem Lexikon.
- **Reihenfolge** von links nach rechts: Bearbeiten (Rückgängig/Wiederholen) → Ansicht (Vollbild, Alles zeigen) → Ergebnis (Speichern, Teilen) → ↻ → ☰.
- Knöpfe, die gerade nichts bewirken, werden ausgeblendet (`hidden`), nicht nur gesperrt. Ausnahme: Rückgängig/Wiederholen, deren Platz stabil bleiben soll.

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
│ │ ⚙  Einstellungen                   › │ │  3. Standardbereiche, immer in dieser Reihenfolge,
│ │ ⟲  Verlauf                       3 › │ │     Icon aus Abschnitt 3; › = Unterseite,
│ │ ⛁  Daten sichern & übertragen      › │ │     ⌄ = klappt an Ort und Stelle auf
│ │ ?  Anleitung & Hinweise            ⌄ │ │
│ │ 📱 Als App installieren            ⌄ │ │  4. Installieren: eine Zeile statt großer Karte
│ └──────────────────────────────────────┘ │
│        Alle Tools · Lizenzen             │  5. Fußzeile
└──────────────────────────────────────────┘
```
(Die Zeichen stehen hier nur für die Tabler-Icons.)

**Regeln:**

- **Reihenfolge:** Aktionen → App-Bereiche → Einstellungen → Verlauf → Daten sichern → Anleitung → Installieren → Fußzeile. Die Installations-Karte rückt also vom Anfang ans Ende und wird zu einer aufklappbaren Zeile (in der installierten App ist sie wie bisher ausgeblendet).
- **Einstellungen – ein Ort je App:** Sprache (`Deutsch | English`) und Darstellung (`Hell | Dunkel | System`) gelten für alle Apps gemeinsam (`tools.lang.v1`, `tools.theme.v1`) und sehen überall gleich aus: zwei `.seg` unter der Überschrift „Allgemein“. Hat die App einen eigenen Bereich mit `data-icon="settings"`, hängt `common.js` den Block an dessen Ende; sonst gibt es die Unterseite „Einstellungen“ als erste Zeile der Standardliste. Apps bauen keine eigenen Sprach- oder Farbumschalter. Die Startseite hat dasselbe Menü (`<body data-app-menu>`: Einstellungen, Installieren, Fußzeile).
- **Abschnitte** sind `<details class="card" data-menu data-icon="settings">` mit `<summary>`. `common.js` setzt das Icon und den Pfeil (`chevron-down`) ein. Die Standardbereiche (Einstellungen, Daten sichern, Anleitung, Installieren) bekommen ihr Icon zentral – **das ändert alle Apps auf einmal**, ohne dass eine App angepasst werden muss.
- **Aktionen** im Menü stehen als `.menu-list` mit `<button data-icon="…">` untereinander, nicht als verstreute Text-Knöpfe. „Löschen/Schließen/Verwerfen“ stehen am Ende, in `--err`, mit `trash` bzw. `x`.
- **Überschriften** innerhalb eines Abschnitts sind einheitlich `h3` (16 px). Unterbereiche wie „Personenerkennung“ werden zu eigenen Abschnitten oder zu `h4`.
- **Nach einer Aktion, die zur App zurückführt:** `Tools.menu.close()` (wie bisher).

### Unterseiten

Kleine Abschnitte klappen an Ort und Stelle auf. Ein Abschnitt wird zur **Unterseite**, wenn er
- aufgeklappt höher als etwa eine halbe Bildschirmhöhe wird (z. B. viele Einstellungen wie in `move-play`, `camera-effects`, `pdf-viewer`), oder
- eine eigene Liste zum Verwalten enthält (Meine Mindmaps, Feeds, Playlists, Profile, Lose & Preise, Datenquellen), oder
- selbst wieder Unterteilungen hat (Daten sichern & übertragen: Sichern / Laden / Alles löschen).

Markup: `<section data-menu data-menu-page data-icon="settings" aria-labelledby="…">`. Im Menü erscheint dann eine Zeile mit Icon, Titel, optional einem Wert oder einer Zahl und `chevron-right`. Ein Tippen schiebt die Unterseite im selben Sheet herein. Ihre Kopfzeile hat `chevron-left` (zurück) und den Titel, ✕ schließt das ganze Menü. Die Zurück-Geste des Handys führt erst zur Menü-Übersicht zurück (eigener History-Eintrag wie heute beim Menü). Eine Ebene reicht, Unterseiten von Unterseiten gibt es nicht. `Tools.menu.open('<id>')` öffnet direkt eine Unterseite (z. B. aus einem Leerzustand: „Datenquelle eintragen“).

---

## 6. Technische Umsetzung

### Icon-Sprite statt kopierter SVGs

- **`assets/icons.svg`**: generiertes Sprite mit `<symbol id="…">` für genau die verwendeten Icons (derzeit rund 175), einmal im Cache für alle Apps. Die Symbole tragen keine eigenen Strich-/Füll-Attribute; das macht `.ic` in `base.css` (`.ic.filled` für gefüllte Icons).
- **Erzeugen:** `node scripts/build-icons.mjs --sprite` sucht die Namen wörtlich in allen veröffentlichten HTML-, JS- und JSON-Dateien und in `template/`: `icons.svg#name`, `icon('name')` (`Tools.icon`), `data-icon="name"`, `icon: 'name'` (Datenlisten) und `"icon": "name"` (JSON, z. B. `move-play/games`). Version aus `scripts/vendor.json` (`tabler-icons`). Die Datei ist eingecheckt und generiert.
- **Prüfen:** `node scripts/build.mjs --check` schlägt ohne Netz fehl, wenn ein verwendeter Name im Sprite fehlt oder ein Symbol nicht mehr gebraucht wird.
- **Offline:** `build.mjs` nimmt `assets/icons.svg` in jedes `sw.js` auf (wie `base.css`).
- **CSP:** Das Sprite kommt vom eigenen Ursprung; `<use href>` braucht keine Ausnahme.
- **`Tools.icon(name, cls)`** in `common.js` gibt `<svg class="ic" aria-hidden="true"><use …/></svg>` als Text zurück – für Knöpfe und Inhalte, die per Script entstehen.
- **Lexikon:** Abschnitt 3 dieses Dokuments; die für Icon-Knöpfe ohne Text prüfbaren Regeln stehen als `LEXICON` in `tests/ui.spec.mjs`.

**Erwogen und verworfen:** Icons beim Build direkt ins HTML schreiben (bläht jede Seite auf, macht handgeschriebenes HTML zu generierten Bereichen) und Icons per Script nachladen (Flackern, ohne Script keine Icons).

### Menü (`common.js`)

- App-Bereiche mit `data-menu` zuerst, dann eine Liste der Standardbereiche (Einstellungen – falls die App keinen eigenen Einstellungsbereich hat –, Daten sichern, Anleitung, Als App installieren) als Unterseiten, dann die Fußzeile. Sprache und Darstellung stehen in den Einstellungen.
- `data-icon` setzt ein Icon vor Überschrift bzw. Zeile; der Text kommt dabei in ein eigenes `<span class="menu-label">`, damit Übersetzungen die Icons nicht überschreiben.
- Unterseiten sind `<details>` mit `data-menu-page`: geöffnet füllen sie das Sheet, die `summary` wird zur Zurück-Zeile; je Unterseite ein eigener History-Eintrag (Zurück-Taste, Escape und CloseWatcher führen erst zur Liste). `Tools.menu.open('id')` öffnet direkt eine Unterseite.

### Allgemeine Tests (`tests/ui.spec.mjs`, `tests/menu.spec.mjs`)

- Kein Emoji in Texten und Beschriftungen (Deutsch, Englisch, geöffnetes Menü), außer in Nutzereingaben und markierten Datensätzen (`data-emoji-content`).
- Alle `<use>` verweisen auf vorhandene Symbole im Sprite.
- Kopfleiste bei 375 px mit sichtbarem ↻: Titel nicht abgeschnitten, nichts überlappt oder läuft über.
- Icon-Knöpfe (`.head-btn`, `.toolbar`, `.btn.icon`): zugänglicher Name, Icon aus dem Sprite, 44 px, Icon passend zum Lexikon.
- Werkzeugleiste: Wörter sichtbar ab 64 px je Eintrag, sonst nur Icons (Wort bleibt zugänglicher Name).
- Aktionen zu einem Ergebnis: Kein Behälter außer `.toolbar` hat 2 oder mehr Nebenknöpfe mit Text (`.btn` ohne `.primary` und `.icon`; Icon-Knöpfe je Listeneintrag bleiben `.btn.icon`) mit Ergebnis-Icons (`copy`, `share`, `download`, `printer`, `volume`, `external-link`, `file-export`, `eraser`, `trash`) – geprüft in `tests/ui.spec.mjs` für jede App im Zustand nach dem Laden.
- Ankreuzfelder und Radios stecken in `label.check` (oder `.seg`/`.chips`/`.tiles`).
- Rückfragen: `tests/dialog.spec.mjs` prüft `Tools.confirm`/`Tools.prompt` (Knöpfe, Escape, Handy und Breitbild) und `Tools.undo`; die fachlichen Tests beantworten Rückfragen mit `onDialog(page, d => d.accept())` aus `tests/helpers.mjs` (wie `page.on('dialog')`).
- Menü: Standardbereiche mit Icons; Unterseiten (öffnen, Zurück-Zeile, Zurück-Taste, Escape, ✕, `Tools.menu.open(id)`).
- Die Bausteine laufen über die vorhandenen axe-Prüfungen (hell, dunkel, Englisch).

### Pflege

- `AGENTS.md`, Abschnitt „Bedienelemente & Icons“: die Regeln in Kurzform.
- `template/` zeigt die Bausteine (Knopf mit Icon, `.seg`, `.empty-state`, `.notice`, `.step`, `.menu-list`, Menü-Bereich mit `data-icon`).

### Bewusste Ausnahmen

- **Nutzerinhalte bleiben, wie sie sind:** Emoji, die jemand in der Schatzsuche (Figuren, Stationen, Quiz-Antworten) oder in eigenen Datenquellen (`image-swipe`) eingibt; diese Stellen tragen `data-emoji-content`.
- **Daten ohne Anzeige:** die Farbzuordnung von Emoji in `treasure-hunt/puzzles.js` (färbt Quiz-Kacheln nach dem Emoji des Nutzers) und das Feld `emoji` in `quartet/decks.js` (bleibt für ältere Spielraum-Codes; angezeigt wird ein Tabler-Icon je Kartensatz).
- **Text zum Teilen:** Der Termin-Text von `calendar-events` für Messenger und Zwischenablage behält seine Symbole, weil er keine Oberfläche dieser App ist.
- **Typografische Zeichen** wie ✕/◯ (Spielsteine in `tic-tac-toe`), ✓ und ♥ in Zähltexten sind keine Emoji und bleiben.

---

## 7. Umsetzung in Schritten

Umgesetzt in dieser Reihenfolge, je Schritt eigene Commits; jede geänderte App mit `npm run test:app` geprüft und per Screenshot (375 px, hell/dunkel) angesehen.

1. **Grundlage (sichtbar nur in der Vorlage):** Sprite-Erzeugung, `Tools.icon`, Lexikon, Bausteine in `base.css`, `template/`, Tests, Abschnitt in `AGENTS.md`.
2. **Menü (wirkt auf alle Apps):** Icons für Standardbereiche, Installieren als Zeile ans Ende, `data-icon` für `data-menu`-Abschnitte, `.menu-list`, Unterseiten (`data-menu-page`). „Daten sichern & übertragen“ wird gleich zur Unterseite.
3. **Datei-Apps:** `audio-studio`, `pdf2word`, `video-to-audio`, `voice-transcriber`, `pdf-edit`, `pdf-viewer`, `image-converter`, `doc-scanner`, `video-analysis`, `securpharm-scanner` → `.dropzone`, `.step`, Knöpfe mit Icons, gesperrte Knöpfe mit Grund.
4. **Bühnen-Apps mit Werkzeugen:** `paint`, `mind-map`, `markdown-editor`, `loop-station`, `code-runner`, `business-card`, `calc-pad`, `songbook`, `piano`, `function-plotter`, `playlist-player` → `.toolbar`, kopierte SVGs durch das Sprite ersetzen.
5. **Spiele & Spaß:** `card-games`, `quartet`, `sea-battle`, `tic-tac-toe`, `rock-paper-scissors`, `reaction-game`, `dice-coin`, `lucky-wheel`, `raffle`, `spin-the-bottle`, `scoreboard`, `move-play`, `laser-mirrors`, `plush-puzzle`, `treasure-hunt`, `whip`, `whoopee-cushion`, `talking-animal`, `camera-effects`, `image-swipe`, `wind-instruments` → alle Emoji durch Tabler-Icons, eigene Illustrationen oder Text ersetzen (Leitlinie 5), `.seg`/`.tiles`, ein gemeinsamer Mehrspieler-Startbildschirm. `treasure-hunt` (221 Emoji, auch in Figuren und Stationen) bekommt dafür einen eigenen PR.
6. **Formular-Apps:** `api-check`, `brew-calculator`, `countdown`, `calendar-events`, `data-logger`, `reminders`, `rss-reader`, `qr-code`, `secret-santa`, `duty-roster`, `text-to-speech`, `marquee`, `ai-chat`, `sensors`, `cast-demo` → `.form-field` statt `.field`, `.seg`/`.chips`, `.notice`.

7. **Weitere Bausteine (zweiter Durchgang):** `.check` (41 Apps hatten ein eigenes), `Tools.confirm`/`Tools.prompt` statt der 80 Browser-Rückfragen, `Tools.undo` beim Löschen einzelner Einträge (`calc-pad`, `markdown-editor`, `code-runner`, `dice-coin`, `data-logger`), `dialog.dialog` für die eigenen Dialoge, `.list-rows` für Listen zum Verwalten, Schieberegler, `progress` und `.meter` zentral.

Gespeicherte Daten und Schlüssel bleiben dabei unverändert; es ändert sich nur die Darstellung.

---

## 8. Entscheidungen

| Frage | Entscheidung | Umsetzung |
|---|---|---|
| Emoji in Kinder- und Spaß-Apps? | **Emoji werden nicht gebraucht** und fallen überall weg, auch in Kacheln und als Spielinhalt. | Leitlinie 5: Tabler-Icon → eigene Illustration → Text; Test „kein Emoji im sichtbaren Text“ |
| Werkzeugleiste immer beschriftet? | **Beschriftung nur, wenn Platz ist.** | `.toolbar` mit Wort ab 64 px je Eintrag, sonst nur Icon mit `aria-label` und `title` (Abschnitt 4); Knöpfe, Kacheln und Menüzeilen haben immer Text |
| Menü flach oder mit Unterseiten? | **Unterseiten, wo nötig.** | Kriterien und Verhalten in Abschnitt 5 „Unterseiten“; eine Ebene |
| Anzahl der Schnellaktionen? | **Je nach Bedarf**, begrenzt durch den Platz. | Abschnitt 4a: Bedarfs- und Platzregel (Titel ≥ 96 px bei 375 px mit ↻), getestet |

---

## Anhang: Befunde je App (Kurzfassung)

| App | Auffälligkeiten | Maßnahmen |
|---|---|---|
| ai-chat | Warnung als Randbalken, Senden-Knopf blass | `.notice.warn`, `.btn.icon` mit `send` |
| api-check | dunkle eckige `.seg`, Hauptaktion schmal | `.seg`, `.btn.primary.block` |
| audio-studio | Ablagefläche ohne Icon, ▶ als Zeichen | `.dropzone`, `player-play` |
| brew-calculator | Tab-Pillen abgeschnitten, eigenes `.field` | umgesetzt: Werkzeugkasten (4b), `.input-unit`, `.calc-result` |
| business-card | Werkzeuge Text/Bild/QR als Text-Knöpfe | `.toolbar` bzw. Knöpfe mit Icons |
| calc-pad | gut; Tastenfeld mit eigenen Zeichen | Sprite statt kopierter SVGs |
| calendar-events | nur Text-Knöpfe | Hauptaktion mit Icon `calendar` |
| camera-effects | Tabs mit Emoji, Effekt-Kacheln Emoji | `.seg` mit `palette` / `mood-smile` / `user-scan`, `.tiles` mit Tabler-Icons |
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
| image-swipe | ♥ als Zeichen | `heart`; das Emoji-Beispiel bleibt (Datensatz, `data-emoji-content`) |
| laser-mirrors | ⚡ Laser-Knopf | `.btn` mit Tabler-Icon |
| loop-station | 🔴 Aufnehmen, ▶️ Start, Emoji im Leerzustand | `player-record`, `player-play`, `.toolbar`, `.empty-state` mit `vinyl` |
| lucky-wheel, raffle | gut | Sprite |
| markdown-editor | Formatierung ohne Beschriftung | erledigt: `.toolbar` mit 4 Werkzeugen + „Mehr“ (`.toolbar-more`) |
| marquee | ok | `.seg` |
| mind-map | Werkzeugleiste schon vorbildlich | als Vorlage für `.toolbar` |
| move-play | 👤/👥 im Umschalter, Emoji in Spielkarten | `.seg` mit `user` / `users`, Spielkarten mit Tabler-Icons |
| paint | Werkzeugleiste ohne Beschriftung, Teilen-Icon abweichend | `.toolbar`, `share` |
| pdf-edit, pdf2word, video-to-audio, voice-transcriber | blass gesperrte Hauptaktion ohne Grund | gesperrt + `.notice.info`, `.dropzone`, `.step` |
| pdf-viewer | drei Kopfleisten-Aktionen, Menü-Aktionen verstreut, lange Einstellungen | `.menu-list`, Einstellungen als Unterseite; Kopfleiste bleibt bei drei (passt laut Platzregel) |
| piano, songbook | Player-Leiste eigen | gemeinsame Player-Leiste (`player-*`) |
| playlist-player | gut, nutzt schon `.form-field` | Sprite |
| plush-puzzle | ▶ als Zeichen | `player-play` |
| qr-code | zweizeiliges Segment „Link / Text“ | `.seg` mit Icons (`link`, `wifi`, `address-book`) |
| reaction-game | Emoji in Spielauswahl (🔨 💡 🦟) | `.seg` mit `hammer` / `bulb` / `bug` |
| reminders | 🔕-Status | `.notice.warn` mit `bell-off` |
| rock-paper-scissors | 🖥️/📱/🎲/🧠 in Umschaltern, Emoji-Handzeichen | `.seg` mit `device-desktop` / `users` / `dice-5` / `brain`; Handzeichen als Tabler-Icons `hand-two-fingers` (Schere), `hand-grab` (Stein), `hand-stop` (Papier); Echse und Spock als eigene Illustrationen (Tabler hat dafür keine Handzeichen) |
| rss-reader | gut, nutzt schon `.form-field` | Knöpfe mit Icons |
| scoreboard | Sportarten mit Emoji | `ball-football`, `ping-pong`, `ball-tennis`, `target`; ohne passendes Icon nur Text |
| secret-santa | 🎁 Knopf | Hauptaktion mit `gift` |
| securpharm-scanner | Schritte, gut | `.seg`, `.step` |
| sensors | Kacheln mit Tabler-Icons – vorbildlich | Vorlage des Werkzeugkastens (4b), nutzt jetzt `base.css` und `toolbox.js` |
| spin-the-bottle | 🍾 Drehen | `rotate-clockwise` |
| talking-animal, whip, whoopee-cushion | 🎤 / 📳 / 🔁 in Bedienknöpfen, Emoji-Kacheln für Stimmen/Geräusche | `microphone`, `device-mobile-vibration`, `repeat`; Kacheln mit Tabler-Icons (z. B. `mouse`, `robot`, `alien`, `wind`, `droplet`, `cloud-storm`, `dice-5`) |
| text-to-speech | ▶ als Zeichen | `player-play` |
| tic-tac-toe | 👥 / 🤖 | `users` / `device-desktop` |
| treasure-hunt | 221 Emoji, auch ➕ 📂 ✏️ in Knöpfen | Knöpfe und Inhalt auf Tabler-Icons (`map-2`, `map-pin`, `compass`, `key`, `trophy`, `swords`, `bolt`, `confetti`) bzw. Illustrationen, eigener PR |
| video-analysis | Primärknopf statt Ablagefläche | `.dropzone` + Aufnehmen |
| wind-instruments | Pillen-Tabs | `.chips` |
