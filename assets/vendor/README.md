# Fremdbibliotheken (vendor)

Automatisch erzeugt von `scripts/vendor.mjs` aus `scripts/vendor.json` – nicht von Hand ändern.

Die Bibliotheken liegen lokal im Repository, damit die Seiten ohne CDN und offline (PWA) funktionieren.
Jeder Ordner enthält die Original-Lizenz (`LICENSE`) und die Herkunft (`SOURCE.md`).

| Name | npm-Paket | Version | Lizenz | Zweck |
|---|---|---|---|---|
| [katex](katex/SOURCE.md) | `katex` | 0.19.1 | [MIT](katex/LICENSE) | Formelsatz (LaTeX) im Brau-Rechner |
| [zxing-wasm](zxing-wasm/SOURCE.md) | `zxing-wasm` | 3.1.6 | [MIT](zxing-wasm/LICENSE) | DataMatrix-Decoder (WebAssembly) im SecurPharm-Scanner |
| [zxing-library](zxing-library/SOURCE.md) | `@zxing/library` | 0.23.0 | [Apache-2.0](zxing-library/LICENSE) | Ersatz-Decoder (JavaScript) im SecurPharm-Scanner |
| [tabler-icons](tabler-icons/SOURCE.md) | `@tabler/icons` | 3.50.0 | [MIT](tabler-icons/LICENSE) | App-Icons (icon.svg und PNG, eingebettet von scripts/build-icons.mjs) und Navigations-Icons der Sensoren-App (Inline-SVG) |
| [transformers](transformers/SOURCE.md) | `@huggingface/transformers` | 4.3.2 | [Apache-2.0](transformers/LICENSE) | Whisper-Spracherkennung im Browser (Sprache zu Text) |
| [onnxruntime-web](onnxruntime-web/SOURCE.md) | `onnxruntime-web` | 1.31.0-dev.20260914-8d85527a0 | [MIT](onnxruntime-web/LICENSE) | Rechen-Engine (WebAssembly/WebGPU) für transformers.js – Version muss zu transformers passen |
| [ogg-opus-decoder](ogg-opus-decoder/SOURCE.md) | `ogg-opus-decoder` | 1.7.5 | [MIT](ogg-opus-decoder/LICENSE) | Ersatz-Decoder für Ogg-Opus-Sprachnachrichten (z. B. ältere iPhones) |
| [pdfjs](pdfjs/SOURCE.md) | `pdfjs-dist` | 6.4.299 | [Apache-2.0](pdfjs/LICENSE) | PDF lesen (Text mit Position und Schrift, Bilder, Seiten für die Texterkennung) in PDF zu Word – Legacy-Build für ältere Handys; wasm/ dekodiert JBIG2-, JPEG-2000- und CMYK-Bilder |
| [docx](docx/SOURCE.md) | `docx` | 9.15.0 | [MIT](docx/LICENSE) | Word-Datei (.docx) erzeugen in PDF zu Word |
| [tesseract](tesseract/SOURCE.md) | `tesseract.js` | 7.0.0 | [Apache-2.0](tesseract/LICENSE) | Texterkennung (OCR) für gescannte PDFs in PDF zu Word |
| [tesseract-core](tesseract-core/SOURCE.md) | `tesseract.js-core` | 7.0.0 | [Apache-2.0](tesseract-core/LICENSE) | Tesseract-Erkennung als WebAssembly für tesseract.js – nur die LSTM-Varianten; der Browser lädt eine davon |
| [tesseract-deu](tesseract-deu/SOURCE.md) | `@tesseract.js-data/deu` | 1.0.0 | [MIT](tesseract-deu/LICENSE) | Sprachdaten Deutsch (tessdata_best, ganzzahlig) für die Texterkennung |
| [tesseract-eng](tesseract-eng/SOURCE.md) | `@tesseract.js-data/eng` | 1.0.0 | [MIT](tesseract-eng/LICENSE) | Sprachdaten Englisch (tessdata_best, ganzzahlig) für die Texterkennung |
| [qrcode-generator](qrcode-generator/SOURCE.md) | `qrcode-generator` | 2.0.4 | [MIT](qrcode-generator/LICENSE) | QR-Codes erzeugen im QR-Code-Generator |

## Aktualisieren

- Prüfen: `node scripts/vendor.mjs --check` (läuft monatlich als GitHub Action und öffnet bei Bedarf ein Issue)
- Aktualisieren: `node scripts/vendor.mjs --update <name>`, danach die betroffenen Seiten testen
