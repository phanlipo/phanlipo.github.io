# KeePass-Betrachter – Aufbau

Liest KeePass-Datenbanken (KDBX 3.1 und 4) **nur lesend** im Browser. Nichts verlässt das Gerät, geschrieben wird nie.

| Datei | Aufgabe |
|---|---|
| `kdbx.js` | Format und Kryptografie, ohne DOM außer `DOMParser`: Kopf lesen, Schlüssel bilden, entschlüsseln, XML → Gruppen/Einträge. `KDBX.open(bytes, { password, keyFile, argon2 })`, `KDBX.info(bytes)` (Kopfdaten ohne Schlüssel, für Diagnose). Fehler als `Error` mit `.code`, übersetzt auf der Seite. |
| `argon2-worker.js` | Argon2d/Argon2id mit `hash-wasm` (`scripts/vendor.json`) im Worker – eine starke Schlüsselableitung blockiert sonst die Seite. Bekommt nur den zusammengesetzten Schlüssel und die Parameter, nie die Datenbank. |
| `totp.js` | Einmalcodes (RFC 6238) aus `otp` (otpauth-URI), `TimeOtp-*` (KeePass 2.47+) und `TOTP Seed`/`TOTP Settings`. |
| `index.html` | Oberfläche: Datei/Passwort/Schlüsseldatei, Liste mit Suche, Eintrag mit Kopieren, Sperren, Einstellungen, WebMCP. |

## Kryptografie

Bewusst so wenig eigener Code wie möglich:

- **WebCrypto** für SHA-256/512, HMAC-SHA-256, AES-256-CBC. Auch die AES-KDF: WebCrypto kennt kein ECB, aber CBC mit IV = x und Null-Klartext liefert c₁ = E(x), c₂ = E(c₁) … – n Nullblöcke ergeben n verkettete Runden in einem Aufruf (in Stücken von 1 MiB; 6 Mio. Runden ≈ 0,5 s).
- **hash-wasm** für Argon2 (gepflegt, MIT). `kdbxweb` wurde nicht genommen: letztes Release 2021, fällt durch `assessHealth`, außerdem braucht es ebenfalls eine Argon2-Implementierung von außen.
- **Selbst geschrieben** sind nur ChaCha20 (RFC 8439) und Salsa20 – für sie gibt es kein WebCrypto. Die Tests prüfen sie gegen PyCryptodome und über echte Datenbanken.
- Falsches Passwort: KDBX 4 erkennt es an der Header-HMAC, KDBX 3 an Padding bzw. den `StreamStartBytes`. Blöcke werden per HMAC (4) bzw. SHA-256 (3) geprüft; Fehler dort = beschädigte Datei.
- Geschützte Werte (`Protected="True"`) teilen sich **einen** Schlüsselstrom in Dokumentreihenfolge – auch die in `History`, deshalb wird das ganze XML in Reihenfolge durchlaufen, bevor Einträge gelesen werden.

Nicht unterstützt (Fehlercode, Text in der Hilfe): KeePass 1, Twofish, Argon2 1.0 bzw. mit Secret/AssocData, YubiKey. Anhänge, Verlauf und Papierkorb werden gelesen, aber nicht gezeigt.

## Sicherheit

- Nur lesen: kein Schreibcode, also kein Risiko, eine Datenbank zu beschädigen.
- Gemerkt wird höchstens die **verschlüsselte** Datei (`Tools.keep`, Schlüssel `db`); Passwort und Schlüsseldatei nie. Einstellungen in `keepass-viewer.settings.v1`.
- Sperren (Knopf, Leerlauf, optional Hintergrund) verwirft die entschlüsselten Objekte und leert die Listen. JS kann Strings nicht überschreiben – das steht ehrlich in der Hilfe.
- Zwischenablage: nach 30 s `writeText('')`, nur wenn die Seite dann den Fokus hat (Browser-Regel).
- Diagnose: nur Kopfdaten (Version, Verfahren, Speicher), Zählungen und Schritte – keine Titel, Namen, Dateinamen.
- WebMCP: Suchen (Titel, Gruppe, Adresse), Eintrag anzeigen (Feldnamen), Sperren. Nie Werte, nie Entsperren.
- Grenze, die sich hier nicht lösen lässt: alle Tools teilen sich den Ursprung `phanlipo.github.io` (siehe Hilfe).

## Testdateien

`tests/fixtures/keepass/` – siehe README dort.
