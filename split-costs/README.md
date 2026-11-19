# Kosten teilen (`split-costs`)

Gemeinsame Ausgaben einer Gruppe eintragen und ausrechnen, wer wem wie viel zahlt.

## Aufbau

- `split.js` (`window.SplitCosts`): Datenformat, Prüfung beim Laden (`normalize`), Anteile je Ausgabe (`shares`), Salden (`accounts`) und Ausgleichsvorschlag (`settle`) – ohne DOM, alle Beträge in ganzen Cent.
- `index.html`: Oberfläche, Dialog für Ausgaben/Zahlungen, CSV, Kopieren, WebMCP-Werkzeuge.

## Entscheidungen

- **Eine Abrechnung je Gerät.** „Neue Abrechnung“ löscht die Einträge und behält die Namen. Mehrere Gruppen nebeneinander wären eine Erweiterung (`…groups.v2`, `v1` beim Laden übernehmen).
- **Zahlung = Ausgabe mit genauen Anteilen:** „Geld gegeben“ wird als `kind: 'transfer'` mit einem Empfänger in `parts` gespeichert; so gilt für alles `Saldo = bezahlt + gegeben − Anteil − erhalten`. „Ausgaben zusammen“ zählt nur echte Ausgaben.
- **Cent-Reste** bei gleicher Aufteilung bekommen die ersten Beteiligten in der Reihenfolge der Personenliste (fest, damit Anzeige, CSV und Agent dasselbe zeigen).
- **Ausgleich:** größte Schuld an größtes Guthaben, bis beides aufgebraucht ist – höchstens Personen − 1 Zahlungen. Das ist nicht in jedem Fall die kleinstmögliche Zahl (das Problem ist NP-schwer), im Alltag aber nahe dran und nachvollziehbar.
- **Personen entfernen** geht nur, solange sie in keiner Ausgabe vorkommen – sonst würden Salden still falsch.
- **Eine Währung** (frei wählbares Zeichen), keine Umrechnung: Kurse bräuchten einen Server.
