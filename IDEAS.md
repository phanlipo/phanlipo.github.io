# Ideen: geplant & verworfen

Ideen für neue Seiten oder Funktionen, die (noch) nicht umgesetzt sind – mit Begründung, damit dieselbe Frage nicht neu geklärt werden muss. Wird nicht veröffentlicht (`.md`).

Status: **geplant** (soll kommen), **zurückgestellt** (passt gerade nicht, später neu prüfen), **verworfen** (passt grundsätzlich nicht).

Neue Einträge oben; bei Umsetzung den Eintrag entfernen oder auf die App verweisen.

## Code ausführen – umgesetzt (Python, JavaScript); Bash verworfen, Pakete zurückgestellt (2026-11)

**Stand:** App `code-runner`: Python (Pyodide = CPython als WebAssembly, `assets/vendor/pyodide`, ca. 13 MB, `precache: false`) und JavaScript, jeweils in einem Worker im App-Ordner (`py-worker.mjs` bleibt zwischen den Läufen, `js-worker.mjs` je Lauf neu; *Stopp* beendet den Worker). `guard.mjs` entfernt dort vor dem ersten Nutzer-Code Netzwerk (`fetch` nur noch für die eigenen Pyodide-Dateien, `XMLHttpRequest`, `WebSocket` …) und den gemeinsamen Speicher der Domain (`caches`, `indexedDB`).

- **`eval` nur im Worker:** Die CSP der Seite bleibt streng (kein `'unsafe-eval'`); Worker haben eine eigene CSP (auf GitHub Pages keine), deshalb läuft der Nutzer-Code dort. Bekannte Lücke: `import('https://…')` lässt sich im Worker nicht abschalten – der Code kommt damit aber an keine Daten der Seite. Steht in der Hilfe („keine vollständige Sandbox“).
- **Sandbox per `<iframe sandbox>` mit eigener CSP – verworfen:** wäre dichter (`connect-src 'none'`), aber ein Frame ohne eigene Herkunft wird nicht vom Service Worker bedient (offline kaputt), und Code im Frame läuft im Thread der Seite (Endlosschleife friert die App ein, kein *Stopp*).
- **`input()` mittendrin – zurückgestellt:** Synchrones Warten im Worker braucht `SharedArrayBuffer`, also die Header COOP/COEP, die GitHub Pages nicht setzen kann. Deshalb Eingaben vorab im Menü (eine Zeile je Aufruf). Ebenso kein `KeyboardInterrupt` – *Stopp* beendet den Worker, Python lädt beim nächsten Lauf neu (aus dem Cache).
- **Python-Pakete (numpy, pandas, matplotlib) – zurückgestellt:** Pyodide lädt sie von `cdn.jsdelivr.net`; das npm-Paket enthält sie nicht. Möglich wäre, einzelne Wheels als eigene Vendor-Einträge auszuliefern (numpy allein ca. 3 MB) – erst bei Bedarf.
- **Bash/Shell – verworfen:** Ein echtes Bash gibt es im Browser nur mit einem ganzen Linux (v86, WebVM/CheerpX: zig MB Disk-Image, teils von fremden Servern, CheerpX nicht frei lizenziert) oder WASI-Laufzeiten mit eigenem Paket-Server. Eine nachgebaute Shell mit ein paar Befehlen wäre kein Bash und ohne Dateien wenig wert.
- **Weitere Sprachen – möglich:** Lua (`wasmoon`, MIT, klein), SQL (`sql.js`), Ruby (`ruby.wasm`, groß). Je Sprache ein Worker mit demselben Nachrichten-Vertrag (`run` → `out`/`done`, siehe Kopf von `js-worker.mjs`) und ein Eintrag in `LANGS` in `code-runner/app.js`.

## MovePlay – Bewegungsspiele per Kamera – umgesetzt, Erweiterungen offen (2026-11)

**Stand:** App `move-play` (Aufbau in `move-play/README.md`) mit 6 Spielen (Simon sagt, Hampelmann-Challenge, Ducken & Springen, Blasen fangen, Stopptanz, Posen nachmachen), allein oder zu zweit nebeneinander (je Spieler eine Bildhälfte), „Leichter erkennen“ für kleine Kinder, GPU mit automatischer Wahl der schnelleren Rechenart. Mit echtem Modell geprüft (`tests/manual/move-play-e2e.mjs`, auch `TWO=1`): Testfoto erkannt und kalibriert, ca. 20–50 ms je Bild am Computer (CPU; die dort nur simulierte GPU ist langsamer und wird automatisch abgewählt).

- Zwei Spieler über MediaPipes `numPoses: 2` gingen nicht: Mit echtem Modell wurde nur eine oder gar keine Person gefunden, auch bei zwei verschiedenen Bildern. Deshalb je Bildhälfte ein eigener Detektor.
- **Noch offen:** Test auf echten Handys (Bilder/s mit GPU und CPU, Sprungerkennung bei schräg stehendem Handy, Schwellen für Stopptanz), eigene Spiele laden (JSON) und `add_game` für KI-Agenten, Fernseher (`cast.js`), Duell auf zwei Geräten (`p2p.js`). Schritte zur Seite (`stepLeft/Right`) und `lean` fehlen noch in der Bewegungs-Engine.

Ursprünglicher Plan:


Ziel: Kinder und Familien spielen vor der Kamera (Handy, Tablet, Laptop) mit dem ganzen Körper – springen, ducken, Arme heben, tanzen. Eine Bewegungs-Engine erkennt die Bewegungen, die Spiele selbst sind JSON-Beschreibungen. Ordner `move-play`, Titel „MovePlay“, `tool:tags` `Freizeit, Spiele, Kinder`, `tool:features` `Kamera, Vollbild, KI-Agent, Download nötig`, Speicher `move-play.`, Bühnen-Layout (Querformat bevorzugt).

**Passt zum Projekt:** läuft komplett im Gerät; MediaPipe (`@mediapipe/tasks-vision` 1.2.0) ist schon als Vendor-Bibliothek da (`precache: false`, `wasm`), das Muster für Worker mit Netzsperre, Modell-Download nach Rückfrage und Offline-Cache steht in `camera-effects/vision-worker.mjs`. Einzige fremde Anfrage: einmalig das Modell *Pose Landmarker lite* (ca. 5–6 MB, `storage.googleapis.com`), danach offline. Kamerabild wird nie verschickt oder aufgenommen.

**Architektur (vier Schichten, nur die unterste kennt MediaPipe):**

1. `pose-worker.mjs` (Worker im App-Ordner, Netzsperre wie `camera-effects`): Kamerabild als `ImageBitmap` rein, je Person 33 Körperpunkte (x, y, z, Sichtbarkeit) raus; `numPoses` 1–4. Wahl lite/full nach Gerät; GPU-Delegate versuchen, sonst CPU. Option: die Netzsperre nach `assets/shared/` auslagern und von beiden Apps nutzen.
2. `motion.js` – Bewegungs-Engine ohne DOM:
   - **Normalisieren:** Koordinaten relativ zu Hüftmitte und Rumpflänge → unabhängig von Abstand und Körpergröße (Kind/Erwachsener). Glätten mit One-Euro-Filter.
   - **Kalibrieren:** 2 s still stehen, ganzer Körper im Bild → Grundhöhe von Hüfte/Kopf je Spieler. Hinweise „weiter zurück“, „mehr Licht“.
   - **Spieler zuordnen:** Personen bleiben über ihre Position (links/rechts) mit Hysterese derselbe Spieler.
   - **Ereignisse** (feste, getestete Liste): `jump`, `duck`, `armsUp`, `armLeft/Right`, `clap`, `stepLeft/Right`, `lean`, `runInPlace`, `jumpingJack`, `freeze` (kaum Bewegung) – je mit Zeitstempel und Stärke. **Zustände** laufend: Handpositionen (für Ziele antippen), Bewegungsenergie, Winkel der Gelenke.
   - **Posen vergleichen:** Ziel-Pose als Winkelvektor (Ellbogen, Schultern, Knie, Hüfte) mit Toleranz → 0–100 %.
3. `engine.js` – Spiel-Engine: liest eine Spiel-Beschreibung (JSON), führt Runden, Zeit, Punkte, Leben und Schwierigkeit, hört nur auf Ereignisse/Zustände aus `motion.js`. Spielmechaniken als erweiterbare Liste mit festem Vertrag (wie `treasure-hunt/puzzles.js`, `card-games/`), z. B. `mechanics/command.js`:
   - `command` – Befehle ansagen und im Zeitfenster prüfen („Simon sagt“, mit Fallen ohne „Simon sagt“)
   - `count` – so viele Wiederholungen wie möglich in N Sekunden (Hampelmann, Kniebeugen)
   - `dodge` – Hindernisse kommen oben/unten → ducken oder springen
   - `targets` – Blasen/Sterne erscheinen, mit Hand oder Fuß treffen
   - `pose` – Posen im Takt nachmachen (Tanz)
   - `freeze` – tanzen, bei Musik-Stopp einfrieren (Stopptanz)
   Neue Spiele = neues JSON (ohne Code); neue Mechanik = eine Datei mit Vertrag, Engine und Bewegungserkennung bleiben unverändert. „Beliebige Spiele“ also im Rahmen der Mechaniken – ganz ohne Code geht nicht jedes Spiel.
4. Seite `index.html` + `render.js`: Canvas mit gespiegeltem Kamerabild (oder nur Strichfigur/Avatar), Spielobjekte, große Anzeigen, Ton per Web Audio (Ansagen per `speechSynthesis` optional, eigene erzeugte Beats – keine geschützte Musik; Melodien aus `assets/shared/songs.js` möglich). Bildschirm bleibt an (Wake Lock), Vollbild.

**JSON-Format (Entwurf, `move-play/games/*.json`, mitgecacht):**

```json
{ "format": "moveplay-game", "version": 1, "id": "duck-jump",
  "title": { "de": "Ducken & Springen", "en": "Duck & Jump" },
  "players": { "min": 1, "max": 2 }, "ages": "4+", "space": "medium",
  "mechanic": "dodge", "duration": 60,
  "params": { "speed": [1, 2.5], "obstacles": ["high", "low"], "lives": 3 },
  "scoring": { "hit": 10, "streakBonus": 5 } }
```

Geprüft gegen ein Schema (Teilmenge wie `Tools.mcp.checkSchema`), Texte zweisprachig im JSON. Eigene Spiele: JSON-Datei laden oder einfügen, gespeichert unter `move-play.games.v1` (damit in der Sicherung); später ein kleiner Editor.

**Erste Spiele (MVP, 1 Spieler):** Simon sagt · Hampelmann-Challenge · Ducken & Springen · Blasen fangen. **Danach:** Stopptanz, Posen nachmachen, 2 Spieler nebeneinander vor einer Kamera (gegeneinander/miteinander), Bestwerte je Spieler.

**Später:** Fernseher als Bildschirm über `assets/shared/cast.js` (App zeichnet ohnehin ins Canvas – ideal für „Handy filmt, Fernseher zeigt“); Duell auf zwei Geräten über `assets/shared/p2p.js` (nur Ereignisse/Punkte übertragen, nie Bilder).

**WebMCP:** `list_games`, `get_scores` (readOnly), `add_game` (prüft und speichert eine JSON-Beschreibung – ein Agent kann so neue Spiele schreiben). Kamera starten nie per Agent.

**Sicherheit & Kinder:** Hinweis „Platz freiräumen, nichts Zerbrechliches in der Nähe“ vor jedem Spiel mit Springen, `space` im JSON, Pausen-Hinweis nach längerer Zeit, kein Konto, keine Bestenliste online.

**Fehlersuche:** `Tools.diag` meldet Modell, Ladezeit, Delegate (GPU/CPU), Bilder/s, Rechenzeit je Bild, Kameraauflösung, erkannte Personen, Kalibrierung – keine Bilder oder Körperpunkte.

**Tests:** `motion.js` mit aufgezeichneten bzw. erzeugten Körperpunkt-Folgen (`tests/fixtures/`, kein Video) – Sprung, Ducken, Hampelmann je mit Grenzfällen; `engine.js` mit künstlichen Ereignissen (Punkte unabhängig nachrechnen); Seite mit Fake-Kamera von Chromium und ersetztem Worker; Modell-Download blockiert (Fehlermeldung prüfen), Offline-Test nach erstem Laden; echter Download nur in `tests/manual/`.

**Offen / Risiken:** Bildrate auf älteren Android-Handys (Ziel ≥ 15 Bilder/s mit lite-Modell) – vor dem Bau messen; Sprungerkennung, wenn das Handy schräg steht (Kalibrierung); mehrere Kinder dicht nebeneinander (Zuordnung); Safari/iPhone mit WebAssembly im Worker (in `camera-effects` schon erprobt).

## Auf Fernseher streamen (Chromecast / Android TV) – im Test (2026-11)

Ziel: Bild einer App live mit Musik auf Chromecast oder Android TV. `cast-demo` bietet zwei Wege zum Vergleich; danach entscheiden, was in andere Apps kommt.

**1. Bildschirm übertragen (für jede App):** eingebaute Übertragung des Handys (Android *Bildschirm übertragen* / *Smart View* / Google-Home-App; Chrome am Computer *Tab streamen*; iPhone nur AirPlay). Die App bereitet nur das Bild vor: Vollbild, Querformat (`screen.orientation.lock`), Bildschirm bleibt an, Leiste blendet sich aus – Baustein `cast-demo/tv.js` (`TvMode`). Ein Link `intent:#Intent;action=android.settings.CAST_SETTINGS;end` versucht, die Einstellung direkt zu öffnen, sonst Hinweis. Grenzen: Seite kann die Übertragung nicht selbst starten, spiegelt alles (auch Benachrichtigungen), Ton erst ab Android 10. Offen: ob Chrome den `intent:`-Link öffnet.

**2. Direkt streamen (nur Apps mit Canvas-Bild):** `assets/shared/cast.js` (`CastStream`). Die App zeichnet in ein `<canvas>`, Musik per Web Audio; beides als WebRTC-Stream direkt im WLAN an die Empfänger-Seite `assets/shared/cast-receiver.html` auf dem Fernseher. Die Empfänger-App ist in der Google Cast SDK Developer Console registriert („phanlipo.github.io“, App-ID `B72055BC`, Custom Receiver mit dieser Adresse); solange sie nicht veröffentlicht ist, nur auf dort eingetragenen Geräten. Der Cast-Nachrichtenkanal trägt nur Angebot/Antwort (ohne Trickle-ICE) und Status. Opus-Stereo mit Musik-Bitrate per SDP. Vorteile: ein Tippen, Fernseher zeigt nur das App-Bild, Handy frei für Bedienung.
- Ausnahme von den Regeln: Sender- und Empfänger-SDK nur von `www.gstatic.com` (nicht als Vendor-Bibliothek). Die App lädt es erst beim Tippen auf *Direkt streamen*; `<meta name="tool:cast" content="true">` erlaubt es in der CSP (`build.mjs`). Optional STUN-Server von Google (Schalter, aus).
- Chrome auf Android kann den Bildschirm nicht aufnehmen (`getDisplayMedia` fehlt) – DOM-Apps lassen sich so nicht streamen, nur was ins Canvas gezeichnet wird.
- Offen bis zum Gerätetest: WebRTC im WLAN mit mDNS-Kandidaten auf dem Chromecast, Tonqualität, Verzögerung.
- Lohnt sich besonders, wenn der Fernseher ein **anderes** Bild zeigen soll als das Handy (Spiel mit Fernseher als Spielbrett, Handy als Controller).

**Weitere geprüfte Wege:** *Remote Playback API* (`video.remote.prompt()`, Chrome Android, ohne Anmeldung) spielt nur eine Datei-URL auf dem Fernseher ab – kein Live-Bild. *Presentation API* mit `https:`-Adresse rendert nur Chrome am Computer selbst und spiegelt sie; auf Android nur mit Cast-App-ID.

## Link-Kürzer – zurückgestellt (2026-11)

Kurze Links wie `phanlipo.github.io/go/abc`, die auf eine lange Adresse weiterleiten.

**Warum nicht jetzt:** GitHub Pages liefert nur statische Dateien aus und kann nichts speichern. Ein Kurzlink lässt sich deshalb nicht im Browser anlegen, jeder neue Link braucht einen Commit. Für eine Seite, die man auf dem Handy bedient, ist das zu umständlich.

**Geprüfte Wege:**

- **Feste Unterseiten (bester Weg):** Liste `go/links.json`, `build.mjs` erzeugt je Code `go/<code>/index.html` mit `<meta http-equiv="refresh" content="0; url=…">`, `noindex` und Link zum Antippen. Kommt ohne JavaScript aus und hat damit kein CSP-Problem. Meta-Refresh ist kein echtes HTTP 301, wegen `noindex` aber egal. Haken: neuer Link = Commit/PR.
- **URL-Parameter (`/go/?u=https://…`):** geht ohne Commit, macht den Link aber länger statt kürzer. Dazu ein offener Redirect: Fremde könnten Phishing hinter der eigenen Domain verstecken. Wenn überhaupt, dann nur mit Zwischenseite (Ziel anzeigen, Knopf *Weiter*, nur `http`/`https`). → verworfen.
- **Schreiben über die GitHub-API aus der Seite:** braucht einen Token mit Schreibrecht auf dem Gerät, eine `tool:connect`-Ausnahme und wegen des geschützten `main` einen PR. → verworfen.
- **Issue + GitHub Action:** Die App öffnet `github.com/…/issues/new?title=…&body=…`, eine Action prüft das Issue (nur vom Repo-Besitzer, nur `https`, Code frei), trägt den Link ein, mergt per PR und schließt das Issue. Kein Token auf dem Gerät, aber eine eigene Action mit Schreibrecht, und jeder Link braucht 2–3 Minuten.

**Neu prüfen, wenn:** Kurzlinks oft gebraucht werden (dann feste Unterseiten, ggf. mit Issue + Action) oder die Seite einen Speicher/Server bekommt.
