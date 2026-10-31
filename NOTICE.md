# Hinweise zu Fremdsoftware (Third-Party Notices)

Automatisch erzeugt von `scripts/build.mjs` aus `scripts/vendor.json` und den Lizenzdateien – nicht von Hand ändern.

Die Web-Tools selbst stehen unter der [MIT-Lizenz](LICENSE). Sie enthalten die folgenden Open-Source-Bibliotheken
(aus den npm-Paketen übernommen, Herkunft je Ordner in `SOURCE.md`). Der vollständige Lizenztext liegt
neben jeder Bibliothek in `assets/vendor/<name>/LICENSE` und wird mit ihr ausgeliefert.

| Bibliothek | Version | Lizenz | Copyright | Verwendet für |
|---|---|---|---|---|
| [katex](https://katex.org) (`katex`) | 0.19.1 | [MIT](assets/vendor/katex/LICENSE) | Copyright (c) 2013-2020 Khan Academy and other contributors | Formelsatz (LaTeX) im Brau-Rechner |
| [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (`zxing-wasm`) | 3.1.6 | [MIT](assets/vendor/zxing-wasm/LICENSE) | Copyright (c) 2023 Ze-Zheng Wu | DataMatrix-Decoder (WebAssembly) im SecurPharm-Scanner |
| [zxing-library](https://github.com/zxing-js/library) (`@zxing/library`) | 0.23.0 | [Apache-2.0](assets/vendor/zxing-library/LICENSE) | Copyright (c) 2005 Sun Microsystems, Inc.; Copyright © 2010-2014 University of Manchester; Copyright © 2010-2015 Stian Soiland-Reyes; Copyright © 2015 Peter Hull | Ersatz-Decoder (JavaScript) im SecurPharm-Scanner |
| [tabler-icons](https://tabler.io/icons) (`@tabler/icons`) | 3.50.0 | [MIT](assets/vendor/tabler-icons/LICENSE) | Copyright (c) 2020-2026 Paweł Kuna | App-Icons (icon.svg und PNG, eingebettet von scripts/build-icons.mjs) und Navigations-Icons der Sensoren-App (Inline-SVG) |
| [transformers](https://huggingface.co/docs/transformers.js) (`@huggingface/transformers`) | 4.3.2 | [Apache-2.0](assets/vendor/transformers/LICENSE) | siehe Lizenztext | Whisper-Spracherkennung im Browser (Sprache zu Text) |
| [onnxruntime-web](https://onnxruntime.ai) (`onnxruntime-web`) | 1.31.0-dev.20260914-8d85527a0 | [MIT](assets/vendor/onnxruntime-web/LICENSE) | Copyright (c) Microsoft Corporation | Rechen-Engine (WebAssembly/WebGPU) für transformers.js – Version muss zu transformers passen |
| [ogg-opus-decoder](https://github.com/eshaz/wasm-audio-decoders) (`ogg-opus-decoder`) | 1.7.5 | [MIT](assets/vendor/ogg-opus-decoder/LICENSE) | Copyright (c) 2021-2026 Ethan Halsall | Ersatz-Decoder für Ogg-Opus-Sprachnachrichten (z. B. ältere iPhones) |
| [pdfjs](https://mozilla.github.io/pdf.js/) (`pdfjs-dist`) | 6.4.299 | [Apache-2.0](assets/vendor/pdfjs/LICENSE) | siehe Lizenztext | PDF lesen (Text mit Position und Schrift, Bilder, Seiten für die Texterkennung) in PDF zu Word – Legacy-Build für ältere Handys; wasm/ dekodiert JBIG2-, JPEG-2000- und CMYK-Bilder |
| [docx](https://docx.js.org) (`docx`) | 9.15.0 | [MIT](assets/vendor/docx/LICENSE) | Copyright (c) 2016 Dolan | Word-Datei (.docx) erzeugen in PDF zu Word |
| [tesseract](https://tesseract.projectnaptha.com) (`tesseract.js`) | 7.0.0 | [Apache-2.0](assets/vendor/tesseract/LICENSE) | siehe Lizenztext | Texterkennung (OCR) für gescannte PDFs in PDF zu Word |
| [tesseract-core](https://github.com/naptha/tesseract.js-core) (`tesseract.js-core`) | 7.0.0 | [Apache-2.0](assets/vendor/tesseract-core/LICENSE) | siehe Lizenztext | Tesseract-Erkennung als WebAssembly für tesseract.js – nur die LSTM-Varianten; der Browser lädt eine davon |
| [tesseract-deu](https://github.com/naptha/tessdata) (`@tesseract.js-data/deu`) | 1.0.0 | [MIT](assets/vendor/tesseract-deu/LICENSE) | Copyright (c) 2015 Jerome Wu (tesseract.js-data); trained data: Copyright Google LLC, tesseract-ocr/tessdata_best (Apache-2.0) | Sprachdaten Deutsch (tessdata_best, ganzzahlig) für die Texterkennung |
| [tesseract-eng](https://github.com/naptha/tessdata) (`@tesseract.js-data/eng`) | 1.0.0 | [MIT](assets/vendor/tesseract-eng/LICENSE) | Copyright (c) 2015 Jerome Wu (tesseract.js-data); trained data: Copyright Google LLC, tesseract-ocr/tessdata_best (Apache-2.0) | Sprachdaten Englisch (tessdata_best, ganzzahlig) für die Texterkennung |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (`qrcode-generator`) | 2.0.4 | [MIT](assets/vendor/qrcode-generator/LICENSE) | Copyright (c) 2009 Kazuhiko Arase | QR-Codes erzeugen im QR-Code-Generator |
| [mediabunny](https://mediabunny.dev) (`mediabunny`) | 1.65.0 | [MPL-2.0](assets/vendor/mediabunny/LICENSE) | siehe Lizenztext | Video-Container lesen (MP4, MOV, WebM, MKV …) und die Tonspur ohne Neukodierung bzw. als WAV speichern in Video zu Audio |

## Weitere Lizenzdateien

Teile einzelner Pakete stehen unter eigenen Lizenzen:

- **pdfjs:** [iccs/LICENSE](assets/vendor/pdfjs/iccs/LICENSE), [standard_fonts/LICENSE_FOXIT](assets/vendor/pdfjs/standard_fonts/LICENSE_FOXIT), [standard_fonts/LICENSE_LIBERATION](assets/vendor/pdfjs/standard_fonts/LICENSE_LIBERATION), [wasm/LICENSE_JBIG2](assets/vendor/pdfjs/wasm/LICENSE_JBIG2), [wasm/LICENSE_OPENJPEG](assets/vendor/pdfjs/wasm/LICENSE_OPENJPEG), [wasm/LICENSE_PDFJS_JBIG2](assets/vendor/pdfjs/wasm/LICENSE_PDFJS_JBIG2), [wasm/LICENSE_PDFJS_OPENJPEG](assets/vendor/pdfjs/wasm/LICENSE_PDFJS_OPENJPEG), [wasm/LICENSE_PDFJS_QCMS](assets/vendor/pdfjs/wasm/LICENSE_PDFJS_QCMS), [wasm/LICENSE_QCMS](assets/vendor/pdfjs/wasm/LICENSE_QCMS)
