# Reihengeschäft (`chain-transaction`)

Umsatzsteuerliche Beurteilung von Reihengeschäften mit 3 oder 4 Unternehmen: bewegte Lieferung, Ort und Behandlung jeder Lieferung, innergemeinschaftlicher Erwerb, Dreiecksgeschäft, Ausfuhr, Einfuhr (Ortsverlagerung, Einfuhrumsatzsteuer) und nötige Registrierungen – jeder Schritt mit ausführlicher Begründung und Paragrafen (UStG und MwStSystRL).

## Aufbau

- `chain.js` – Logik ohne DOM (`window.Chain`): Länderdaten (EU-Staaten mit USt-IdNr.-Präfix und Normalsatz, ausgewählte Drittländer), `normalize()`, `evaluate()`, `alternatives()`. `evaluate` liefert nur Fakten (Indizes, Ländercodes, Codes wie `ic`, `triangle`, `midVat`), keine Texte.
- `index.html` – Eingabe (Unternehmen, Warenweg, Transport, ggf. Anmelder bei der Einfuhr), Ergebnis als Kette (bewegte Lieferung dick in Akzentfarbe), „Begründung Schritt für Schritt“ (7 Schritte), „Was jedes Unternehmen tun muss“ (Registrierung, Einkauf, Verkauf, Einfuhr; deutsche Kennzahlen, wenn die Meldung in Deutschland abzugeben ist) und „Was wäre, wenn …?“ (Antippen übernimmt die Variante). Alle Texte entstehen aus den Fakten über `Tools.t`.
- Gespeichert wird nur der aktuelle Fall unter `chain-transaction.case.v1` (`{ parties: [{ country, vat }], from, to, transport, importer, eug }`; `''` = wie Sitz von U1/letztem Unternehmen, `importer: null` = wie Transport).

## Entscheidungen

- **Rechtsstand:** deutsches UStG/UStAE nach den Quick Fixes 2020, so angewendet, als gälte es in allen Ländern (bei Ausfuhr/Einfuhr § 3 Abs. 6a Satz 6/7 und § 3 Abs. 8 UStG). Abweichungen anderer Staaten werden in der Hilfe erwähnt, nicht abgebildet.
- **Zwischenhändler:** „als Lieferer“ wird aus den Eingaben abgeleitet statt über einen eigenen Schalter: USt-IdNr. des Abgangslands (innergemeinschaftlich, Ausfuhr) bzw. eigene Zollanmeldung (Einfuhr). Ein Unternehmen verwendet eine USt-IdNr. für Ein- und Verkauf.
- **Erster Lieferer im Dreieck:** gilt als im Abgangsland erfasst (er liefert innergemeinschaftlich von dort); seine Registrierung dort wird als Pflicht ausgewiesen, nicht als Voraussetzung geprüft.
- **Dreieck in 4er-Ketten:** standardmäßig nur am Ende der Kette (Abschnitt 25b.1 Abs. 2 UStAE); per Ankreuzfeld nach EuG T-646/24 (3. 12. 2025) auch am Anfang (`eug`).
- **Einfuhr:** Vorsteuerabzug der EUSt hat, wer bei der Einfuhr die Verfügungsmacht hat – bei Ortsverlagerung der Lieferer der bewegten Lieferung, sonst ihr Abnehmer.
- **Ausfuhr:** holt der Abnehmer der bewegten Lieferung selbst ab und ist er im Abgangsland ansässig, keine Steuerbefreiung (§ 6 Abs. 1 Nr. 2 UStG).
- **Registrierungen:** Gründe `sale`, `icSupply`, `export`, `acquisition`, `import`, `triangleReport`, `triangleTax`; „vorhanden“, wenn das Unternehmen die USt-IdNr. dieses Lands verwendet. Für den Vorsteuerabzug als Abnehmer allein wird keine Registrierung verlangt (Vergütungsverfahren).
- Icons: `truck` (transportiert), `file-certificate` (meldet Einfuhr an), `arrow-down` (Lieferung), `circle-check`/`circle-x` (Voraussetzungen), `book` (Beispiele im Menü).

## Offene Erweiterungen

- Privatperson als letzter Abnehmer (Fernverkauf, OSS/IOSS, keine Dreiecksvereinfachung).
- Gebrochener Transport, Konsignationslager, Lohnveredelung.
- Zusammenfassende Meldung und Intrastat mit Feldern im Detail, Kennzahlen anderer Länder.
