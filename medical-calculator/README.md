# Medizin-Rechner – festgelegte Formeln

Formelhilfe für die Praxis (BMI und weitere Größen), aufgebaut wie `brew-calculator`: je Rechner eine Karte
mit Eingaben, Ergebnisfeldern und „Formeln & Erklärung“ (KaTeX). Dieses Dokument ist die **Festlegung**:
Seite (`index.html`) und Test (`tests/medical-calculator.spec.mjs`, eigene Nachrechnung) folgen genau diesen
Formeln und Konstanten. Änderungen hier zuerst, dann in Seite und Test.

**Abgrenzung:** nur Formeln zur Information und Gegenkontrolle, keine Dosierungen, keine Diagnose,
keine Therapieempfehlung. Das steht sichtbar auf der Seite und in der Hilfe.

**Datenschutz:** Messwerte (Größe, Gewicht, Kreatinin, Daten der Periode …) werden **nicht gespeichert**
(Patientendaten). Gespeichert werden nur Einstellungen (`medical-calculator.settings.v1`: Einheit des Kreatinins,
gewählter Laborwert). Diagnose-Protokoll ohne Werte.

**Rundung:** Einteilungen (WHO-Klasse, KDIGO-Stadium) werden auf den **angezeigten, gerundeten** Wert
angewandt, damit Anzeige und Klasse nie widersprechen.

## 1 · Körpermaße

Eingaben: Größe *h* in cm (50–250), Gewicht *m* in kg (2–400), optional Taillenumfang *u* in cm (30–250).

| Größe | Formel | Anzeige |
|---|---|---|
| BMI | `m / (h/100)²` in kg/m² | 1 Nachkommastelle |
| Körperoberfläche Mosteller (1987) | `√(h · m / 3600)` in m² | 2 |
| Körperoberfläche Du Bois & Du Bois (1916) | `0,007184 · m^0,425 · h^0,725` in m² | 2 |
| Taille-zu-Größe-Verhältnis (WHtR) | `u / h` | 2 |

WHO-Einteilung des BMI (Erwachsene):

| BMI | Klasse |
|---|---|
| < 18,5 | Untergewicht |
| 18,5 – < 25 | Normalgewicht |
| 25 – < 30 | Präadipositas (Übergewicht) |
| 30 – < 35 | Adipositas Grad I |
| 35 – < 40 | Adipositas Grad II |
| ≥ 40 | Adipositas Grad III |

WHtR: ab 0,5 erhöhtes Risiko (Ashwell; gilt ab 18 Jahren, für Jüngere ebenfalls 0,5 als Faustregel).
Hinweis: WHO-Klassen gelten nicht für Kinder und Jugendliche (dort BMI-Perzentilen); Hinweis bei *h* < 140 cm.

## 2 · Nierenfunktion

Eingaben: Alter *A* in Jahren (18–120), Geschlecht (weiblich/männlich – die Formeln verlangen es),
Serum-Kreatinin *S* in mg/dl (0,1–20) oder µmol/l (9–1768), optional Gewicht *m* in kg (für Cockcroft-Gault).

Umrechnung: `S[mg/dl] = S[µmol/l] / 88,4`.

**eGFR nach CKD-EPI 2021** (ohne Ethnie-Faktor; Inker et al., NEJM 2021), in ml/min/1,73 m²:

```
eGFR = 142 · min(S/κ, 1)^α · max(S/κ, 1)^(−1,200) · 0,9938^A · (1,012 bei Frauen)
κ = 0,7 (w) / 0,9 (m),   α = −0,241 (w) / −0,302 (m)
```

Anzeige ganzzahlig. Stadium nach KDIGO 2012 (G-Kategorie):

| eGFR | Stadium |
|---|---|
| ≥ 90 | G1 normal oder hoch |
| 60 – 89 | G2 leicht vermindert |
| 45 – 59 | G3a leicht bis mäßig vermindert |
| 30 – 44 | G3b mäßig bis stark vermindert |
| 15 – 29 | G4 stark vermindert |
| < 15 | G5 Nierenversagen |

Hinweis: G1/G2 bedeuten nur mit weiteren Befunden (z. B. Albuminurie) eine Nierenkrankheit; Einstufung erst bei
Werten über ≥ 3 Monate; eGFR ungenau bei sehr viel oder wenig Muskelmasse und bei rasch wechselnder Nierenfunktion.

**Kreatinin-Clearance nach Cockcroft-Gault (1976)** – nur mit Gewicht, in ml/min (nicht auf 1,73 m² bezogen):

```
CrCl = (140 − A) · m / (72 · S[mg/dl]) · (0,85 bei Frauen)
```

Anzeige ganzzahlig. Nur als Formel, ohne Dosierungsbezug.

## 3 · Schwangerschaft

Eingaben: erster Tag der letzten Periode *L* (Datum), Zykluslänge *z* in Tagen (21–45, Standard 28).
Gerechnet wird in ganzen Kalendertagen (UTC-Datum, keine Zeitzonen-/Sommerzeitfehler). Stichtag = heute.

| Größe | Formel |
|---|---|
| Errechneter Termin (erweiterte Naegele-Regel) | `ET = L + 280 Tage + (z − 28)` |
| Ungefährer Empfängnistag | `L + (z − 14)` Tage |
| Schwangerschaftsalter heute (p. m., korrigiert) | `t = heute − L − (z − 28)` Tage → SSW `⌊t/7⌋ + (t mod 7)` (z. B. „12+3“) |
| Trimester | 1.: bis 13+6, 2.: 14+0 bis 27+6, 3.: ab 28+0 |
| Tage bis zum Termin | `ET − heute` |

Fehler, wenn *L* in der Zukunft liegt; Hinweis, wenn *t* > 44 Wochen (Datum prüfen) oder *t* < 0.
Hinweis: Eine Ultraschall-Datierung im ersten Trimester ist genauer und hat Vorrang.

## 4 · Laborwerte umrechnen

Konventionelle Einheit ↔ SI-Einheit, Richtung wählbar. Faktor aus der molaren Masse *M*:
`mmol/l = mg/dl · 10 / M`.

| Wert | Einheiten | Umrechnung | Grundlage |
|---|---|---|---|
| Glukose | mg/dl ↔ mmol/l | `mmol/l = mg/dl / 18,016` | M = 180,16 g/mol |
| Cholesterin (gesamt, HDL, LDL) | mg/dl ↔ mmol/l | `mmol/l = mg/dl / 38,665` | M = 386,65 g/mol |
| Triglyceride | mg/dl ↔ mmol/l | `mmol/l = mg/dl / 88,57` | M = 885,7 g/mol (Triolein) |
| Kreatinin | mg/dl ↔ µmol/l | `µmol/l = mg/dl · 88,4` | M = 113,12 g/mol |
| HbA1c | % (NGSP/DCCT) ↔ mmol/mol (IFCC) | `IFCC = (NGSP − 2,15) · 10,929` | IFCC-Masterequation |

Anzeige: mmol/l mit 2, mg/dl mit 0 (Kreatinin 2), µmol/l mit 0, mmol/mol mit 0, % mit 1 Nachkommastelle.

## WebMCP

`body_measures`, `kidney_function`, `pregnancy_dates`, `convert_lab_value`: Werte werden in die Felder der App
übernommen (sichtbar), das Ergebnis kommt zurück. Nichts davon wird gespeichert.
