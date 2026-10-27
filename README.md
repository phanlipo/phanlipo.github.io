# Scan-Copy-SecurPharm

Web-App zum Auslesen von securPharm-DataMatrix-Codes auf Arzneimittel-/Impfstoffpackungen.
Einzelne Werte (PZN, GTIN/NTIN, PPN, Charge, Verfalldatum, Seriennummer) per Klick kopieren, Verlauf lokal im Browser.

## Funktionen
- **Hand-Barcode-Scanner** (Tastatur-Emulation): Eingabe im Feld oder überall auf der Seite, Enter wertet aus
- **Webcam**: Live-Scan mit Kameraauswahl (HTTPS erforderlich – GitHub Pages erfüllt das)
- **Bild**: Drag & Drop, Dateiauswahl oder Einfügen mit Strg+V
- Unterstützt **GS1-Format** (AI 01/21/10/17, optional 710) und **IFA-Format** (`[)>`, 9N/1T/D/S)
- Trennzeichen-Erkennung (ASCII 29, `<GS>`, `{GS}`, `^]`, Strg+], eigenes Ersatzzeichen); fehlende Trennzeichen werden heuristisch zerlegt
- Prüfziffernprüfung für PZN, GTIN und PPN, Hinweis bei abgelaufenem Verfall
- Klick auf einen Wert = Kopieren; Tastenkürzel Alt+1 … Alt+9; „Alle (Tab-getrennt)“ und JSON
- **Verlauf im localStorage** (max. 1000 Einträge), Suche, Duplikat-Hinweis bei gleicher Seriennummer, Export als CSV (Excel-tauglich, Semikolon) und JSON

## Veröffentlichung über GitHub Pages
1. Neues Repository **Scan-Copy-SecurPharm** auf GitHub anlegen (öffentlich, bzw. intern bei GitHub Enterprise).
2. `index.html` (und diese `README.md`) in den Branch `main` hochladen (Root-Verzeichnis).
3. *Settings → Pages → Build and deployment → Source: „Deploy from a branch“*, Branch `main`, Ordner `/ (root)` → **Save**.
4. Nach ca. 1 Minute erreichbar unter `https://<github-benutzer>.github.io/Scan-Copy-SecurPharm/`.

## Hinweise
- Alle Daten werden ausschließlich im Browser verarbeitet. Externe Ressourcen: nur die Decoder-Bibliotheken von cdn.jsdelivr.net – primär `zxing-wasm@3.1.4` (zxing-cpp als WebAssembly, sehr zuverlässig bei DataMatrix), Fallback `@zxing/library@0.21.3`. Wo der Browser einen eingebauten `BarcodeDetector` mit DataMatrix-Unterstützung hat (z. B. Android, macOS), wird dieser zuerst genutzt.
- Webcam: Unter dem Kamerabild zeigt eine Diagnosezeile den aktiven Decoder und die Zahl analysierter Bilder. Zoom und Licht erscheinen, wenn die Kamera das unterstützt. „Standbild gründlich analysieren“ prüft das aktuelle Bild mit mehreren Ausschnitten und Skalierungen.
- Hand-Scanner: Am besten mit deutschem Tastaturlayout im Scanner konfigurieren (sonst Y/Z- und Sonderzeichen-Vertauschungen) und die GS-Übertragung aktivieren (z. B. als Strg+] oder als Ersatzzeichen, das in den Scanner-Einstellungen der App eingetragen wird).
- Der localStorage ist pro Browser, Gerät und Domain getrennt; Löschen der Browserdaten löscht den Verlauf.
- Die App liest den Code nur aus – sie ist **keine Verifikation/Ausbuchung** im securPharm-System (NGS/ACS-Apothekenserver).
