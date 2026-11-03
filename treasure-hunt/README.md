# Schatzsuche – Architektur

Interaktive Schatzsuche für Kindergeburtstage: Eltern bauen Stationen mit Story, Rätseln und Figuren, Kinder spielen sie auf dem Handy. Statisch, ohne Server, offline nutzbar. (Diese Datei wird nicht veröffentlicht.)

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche: Übersicht, Editor, Spiel (Ziel wählen, Kompass/Karte, Szene, Kampf, Ergebnis, Schatz), Eltern-Bereich, Beispiel „Der Schattendrache“, WebMCP, Diagnose |
| `engine.js` | `HuntEngine` – Datenmodell, Bereinigung importierter Daten, Story-Engine (Bedingungen, Effekte, Szenenwahl), Kampf, Wiederaufnahme-Code, Geo-Rechnung. Kein DOM. |
| `puzzles.js` | `HuntPuzzles` – Rätseltypen (Editor-Felder, Bereinigung, Spielablauf) und Formular-Helfer |
| `map.js` | `HuntMap` – kleine Karte ohne Bibliothek: OSM-Kacheln auf einem Canvas, Radar-Ersatz, Verschieben/Zoomen/Tippen |

Alle Dateien liegen im App-Ordner und werden vom Service Worker offline gecacht. Keine Fremdbibliothek.

## Entscheidungen

- **Konfiguration und Spielstand getrennt.** Schatzsuche: `treasure-hunt.hunt.<id>.v1` (portabel als Datei `*.schatzsuche.json`, Format `phanlipo-treasure-hunt`, Version 1). Spielstand je Schatzsuche: `treasure-hunt.game.<id>.v1`. Einstellungen: `treasure-hunt.settings.v1`. Eine Schatzsuche je Schlüssel, damit ein voller Speicher nur diese betrifft.
- **Story-Engine ohne festen Ablauf.** Jede Station hat eine geordnete Liste von *Szenen*. Beim Ankommen läuft die erste Szene, deren Bedingungen (`when`: Merker gesetzt/nicht gesetzt, Teamgröße, Energie, frühere Besuche) gelten und die noch nicht gewonnen wurde (`repeat` = bleibt verfügbar). Ergebnisse (`win`/`lose`) setzen/löschen Merker, holen Verbündete, ändern Energie, öffnen den Schatz. Stationen haben selbst Bedingungen (verschlossen 🔒). Damit lassen sich wiederholte Besuche, ersetzte Gegner und verzweigte Geschichten ohne Programmierung bauen.
- **Figuren sind wiederverwendbar** (Verbündete, Gegner, Erzähler) und werden in Szenen per ID referenziert.
- **Kampf bewusst einfach und vorhersagbar:** Schaden = Kinder (1) + Stärke der Verbündeten + Bonus der gelösten Szenen-Aufgabe, mal 2 mit der Mega-Entwicklung (kostet Energie). Sieg, wenn der Schaden die Lebenskraft erreicht. So können Eltern im Editor ausrechnen, was die Kinder vorher sammeln müssen.
- **Rätseltypen als Registry** (`HuntPuzzles.TYPES`): ein neuer Typ ist ein Eintrag mit `defaults`, `clean`, `edit`, `play` plus Texten. Die Engine kennt nur `type`.
- **Unzuverlässige Sensoren:** Jede Sensor-Aufgabe (Mikrofon, GPS) hat „Eltern: als geschafft werten“; im Eltern-Bereich lässt sich jede Aufgabe werten und jede Station öffnen. GPS-Ungenauigkeit (bis 30 m) zählt zugunsten der Kinder. Stationen ohne Koordinaten öffnet man per Knopf (auch für drinnen).
- **Karte nur auf Wunsch:** Ohne Einstellung keine einzige Anfrage nach außen; dann gibt es Kompass und Radar. Eingeschaltet lädt `map.js` Kacheln von `tile.openstreetmap.org` (eigene Ausnahme in `tool:connect`) und speichert sie im Cache `treasure-hunt:tiles`, damit einmal angesehene Gegenden offline gehen. Kein Vorab-Massendownload (OSM-Nutzungsregeln).
- **Wiederaufnahme-Code statt Server:** Der Spielstand wird kompakt als Bits in einen Crockford-Base32-Code gepackt (Merker, Team, gewonnene Szenen, Besuche, Energie, Ziel) – mit Prüfsumme und Hash der Struktur der Schatzsuche. Auf dem anderen Gerät muss dieselbe Schatzsuche (Datei) vorhanden sein.
- **Bilder** werden beim Auswählen auf höchstens 640 px (JPEG) verkleinert und als `data:`-URL eingebettet; beim Import werden nur `data:image/…`-URLs angenommen (keine Links zu fremden Servern).
- **Vorlesen** über die Sprachausgabe des Geräts (`speechSynthesis`), kein Download.

## Einschränkungen

- Browser-Speicher ist begrenzt (meist 5–10 MB je Domain): viele Bilder füllen ihn. Die App meldet, wenn Speichern scheitert.
- Die Eltern-PIN ist nur Kindersicherung, kein Schutz – sie steht in der exportierten Datei, ebenso alle Antworten.
- Kompass: iPhone braucht eine Erlaubnis per Tipp; manche Android-Geräte liefern keine absolute Richtung – dann zeigt der Pfeil relativ zu Norden plus Text-Richtung.
- Mikrofon-Erkennung (Brüllen, Klatschen) ist eine einfache Lautstärke-Schwelle, keine Rhythmus-Erkennung; laute Umgebung kann sie auslösen.
- Rennen per GPS braucht gutes Signal im Freien (Genauigkeit ≤ 35 m beim Start).
- Kartenkacheln gibt es offline nur für vorher angesehene Gegenden. Die Karte kann verschieben und zoomen (Knöpfe, Mausrad), aber kein Pinch-Zoom.
- Der Wiederaufnahme-Code gilt nur für dieselbe, unveränderte Schatzsuche; die Reihenfolge, in der Verbündete dazukamen, geht dabei verloren.
- Benachrichtigungen im Hintergrund gibt es nicht: Die App muss offen sein (Bildschirm bleibt während des Spiels an, wo `wakeLock` geht).
