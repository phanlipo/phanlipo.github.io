# Code-Scanner

Liest QR-Codes, Barcodes, DataMatrix, Aztec, PDF417 und weitere Codes mit der Kamera, aus einem Foto oder als eingefügten Text und zeigt den Inhalt auf drei Arten: aufbereitet, im Original und als QR-Code.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Oberfläche: Kamera, Foto, Text, Ergebnis (drei Ansichten), Verlauf, Einstellungen, WebMCP |
| `parse.js` | `CodeParse.analyze(text, { format, contentType })` – erkennt die Inhaltsart und zerlegt sie in Felder. Ohne DOM und ohne Seitentexte (Beschriftungen sind Schlüssel `f.<k>`, Warnungen `w.<code>`). Beschreibung des Ergebnisses am Dateianfang |
| `heic-worker.js` | HEIC-Decoder (siehe `assets/shared/heic.js`) |

## Bibliothek

`zxing-wasm-full` (`scripts/vendor.json`): der „full“-Build von zxing-wasm (zxing-cpp als WebAssembly) liest **und** schreibt. Er ist ein eigener Eintrag neben `zxing-wasm` (nur Reader, SecurPharm-Scanner), damit jede App nur ihren Build in den Offline-Cache lädt – beide IIFE-Builds belegen dieselbe globale Variable `ZXingWASM` und lassen sich nicht zusammen laden.

- **Lesen** mit `textMode: 'Plain'`: der Text genau so, wie er im Code steht (Steuerzeichen wie `<GS>` bleiben erhalten). Die HRI-Form `(01)…` für GS1 baut `CodeParse.gs1Hri`.
- **Schreiben**: nur Formate, die zxing-wasm erzeugen kann (Tabelle `WRITE` in `index.html`); andere (Micro-QR, rMQR, MaxiCode, DataBar …) zeigen einen Hinweis und den QR-Code. GS1-Inhalte werden mit der Option `gs1` geschrieben, damit die Datenbezeichner erhalten bleiben.

## Inhaltsarten (`parse.js`)

Link (mit Warnungen, GS1 Digital Link), WLAN, vCard, MeCard, Termin (vEvent), geo, tel, SMS, E-Mail (mailto, MATMSG), GiroCode (EPC), Schweizer QR-Rechnung, GS1-Elementketten (Klammerform und roh mit `<GS>`), IFA/PPN (securPharm), Produktnummern (GTIN-Prüfziffer, GS1-Präfix, ISBN/ISSN, UPC-E → UPC-A), PZN, otpauth, Kryptowährungs-Links, IATA-Bordkarte (BCBP), JSON, sonstige URIs, Text, Binärdaten. Reihenfolge der Erkennung in `detect()`.

Links bietet die Seite nur für `http(s)`, `tel`, `sms`, `mailto` und `geo` an, immer erst nach einem Tipp und mit `rel="noopener noreferrer"`.

## Speicher

- `code-scanner.settings.v1`: `{ history, beep, src, view, cam }`
- `code-scanner.history.v1`: bis 200 Einträge `{ id, text, format, contentType, …, src, ts, bytes? }` (`bytes` = Base64, nur bei Binärdaten ≤ 4 KB). Gleicher Text und gleiches Format rücken nach oben statt doppelt.

## KI-Agenten

`analyze_code_text`, `get_current_code`, `get_scan_history`. Passwörter (WLAN) und Zwei-Faktor-Schlüssel gehen nie an Agenten: Felder mit `secret` fehlen in `agent`, der Rohtext dieser Arten wird zurückgehalten.

## Tests

`tests/code-scanner.spec.mjs` (Bilder mit bwip-js, Kamera als Canvas-Stream, Rücklesen der erzeugten Bilder), `tests/webmcp.spec.mjs` („code-scanner tools“).
