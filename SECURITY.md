# Sicherheit / Security

## Sicherheitslücke melden

Bitte Sicherheitslücken **nicht** als öffentliches Issue melden, sondern vertraulich über GitHub:
**Security → Report a vulnerability** in diesem Repository
(https://github.com/phanlipo/phanlipo.github.io/security/advisories/new).

Hilfreich sind: betroffene App bzw. Datei, Schritte zum Nachstellen, Browser und Gerät.

## Reporting a vulnerability

Please do **not** open a public issue. Report it privately via GitHub:
**Security → Report a vulnerability** in this repository
(https://github.com/phanlipo/phanlipo.github.io/security/advisories/new).

Please include the affected app or file, steps to reproduce, browser and device.

## Umfang / Scope

Statische Seiten auf GitHub Pages (https://phanlipo.github.io/), ohne Server und ohne Nutzerkonten.
Es gilt immer der aktuelle Stand von `main`; ältere Versionen werden nicht gepflegt.
Fremdbibliotheken in `assets/vendor/` werden über `scripts/vendor.json` gepflegt und monatlich auf
bekannte Schwachstellen geprüft – Lücken in einer Bibliothek selbst bitte beim jeweiligen Projekt melden.

Static pages on GitHub Pages without a server or user accounts. Only the current `main` is supported.
Third-party libraries in `assets/vendor/` are tracked in `scripts/vendor.json` and checked for known
vulnerabilities; please report issues in a library itself to its own project.
