# Fremdbibliotheken (vendor)

Automatisch erzeugt von `scripts/vendor.mjs` – nicht von Hand ändern.

Die Bibliotheken liegen lokal im Repository, damit die Seiten ohne CDN und offline (PWA) funktionieren.
Jeder Ordner enthält die Original-Lizenz (`LICENSE`) und die Herkunft (`SOURCE.md`).
**Übersicht mit Version, Lizenz, Copyright und Zweck: [`NOTICE.md`](../../NOTICE.md).**

## Aktualisieren

- Prüfen: `node scripts/vendor.mjs --check` (läuft monatlich als GitHub Action und öffnet bei Bedarf ein Issue)
- Aktualisieren: `node scripts/vendor.mjs --update <name>`, danach die betroffenen Seiten testen
