# Finanzrechner (`finance-calculator`)

Rechner für Zinseszins und Geld über die Zeit, angelehnt an einen Finanztaschenrechner (TVM-Tasten, CF/NPV/IRR, AMORT, ICONV, Δ%, PROFIT, BRKEVN, DEPR, DATE) und ergänzt um einen Sparplan- und einen Kreditrechner mit Diagramm und Jahrestabelle.

## Aufbau

- `finance.js` – reine Rechenlogik ohne DOM (`window.Finance`). Zinssätze kommen als Prozent, Ergebnisse ungerundet; unmögliche Eingaben liefern `{ error: 'code' }`, die Seite übersetzt den Code (`m.<code>`), WebMCP liefert englische Texte.
- `index.html` – Oberfläche: fünf Ansichten (`.chips` oben, gemerkt in `S.view`): Sparplan, Kredit, Zeitwert, Cashflow, Mehr.
- Eingaben stehen als getippte Zeichenketten in einem Objekt `S` (Schlüssel `<rechner>.<feld>`, gespeichert unter `finance-calculator.inputs.v1`, Cashflow-Zeilen als `rows`). Jede Eingabe ruft `update()`, das alle Rechner neu rechnet – die Rechnungen sind klein.
- Zahlen: `parse()` nimmt Komma/Punkt und Tausendertrennzeichen der Sprache („200.000“ / „200,000“). Bei Sprachwechsel werden Dezimaltrennzeichen in den Feldern umgeschrieben (`decimals()`).

## Entscheidungen

- **Sparplan:** monatlich mit konformem Monatszins `(1 + r)^(1/12) − 1`, r = Rendite − Kosten. Keine Steuern (Abgeltungsteuer, Vorabpauschale, Freibetrag) – zu viele Sonderfälle; in der Hilfe erwähnt.
- **Kredit:** Monatszins = Sollzins / 12 (übliche Annuitätenrechnung), ungerundet; Sondertilgung am Ende jedes Jahres. Effektivzins ohne Gebühren.
- **Zeitwert:** Vorzeichenregel wie am Taschenrechner. Der zuletzt berechnete Wert (`t.last`) rechnet bei jeder Änderung mit; Tippen in dieses Feld macht es wieder zur Eingabe. Felder zeigen gerundete Werte, gerechnet wird mit dem genauen Wert (`tvmExact`), solange das Feld unverändert ist. I/Y und IRR per Vorzeichenwechsel-Suche + Bisektion (`Finance.roots`); bei mehreren IRR wird der nächste an 0 % gezeigt mit Hinweis.
- **Abschreibung degressiv:** fester Prozentsatz vom Restbuchwert mit Wechsel zu linear, sobald das mehr ergibt (deutsche Praxis), nicht das „DB %“ des Taschenrechners.
- **Zinstage:** tatsächliche Tage und 30E/360 (deutsche Zinsmethode).

## Offene Erweiterungen

- Anleihen (Kurs ↔ Rendite mit Stückzinsen, Tageszählung) – braucht Kupontermine und Tageskonventionen.
- Entnahmeplan als eigener Rechner (heute über das Beispiel im Zeitwert-Rechner).
- Steuern im Sparplan (Kapitalertragsteuer mit Freibetrag).
