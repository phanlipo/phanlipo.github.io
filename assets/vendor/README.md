# Fremdbibliotheken (vendor)

Automatisch erzeugt von `scripts/vendor.mjs` aus `scripts/vendor.json` – nicht von Hand ändern.

Die Bibliotheken liegen lokal im Repository, damit die Seiten ohne CDN und offline (PWA) funktionieren.
Jeder Ordner enthält die Original-Lizenz (`LICENSE`) und die Herkunft (`SOURCE.md`).

| Name | npm-Paket | Version | Lizenz | Zweck |
|---|---|---|---|---|
| [katex](katex/SOURCE.md) | `katex` | 0.19.1 | [MIT](katex/LICENSE) | Formelsatz (LaTeX) im Brau-Rechner |
| [zxing-wasm](zxing-wasm/SOURCE.md) | `zxing-wasm` | 3.1.6 | [MIT](zxing-wasm/LICENSE) | DataMatrix-Decoder (WebAssembly) im SecurPharm-Scanner |
| [zxing-library](zxing-library/SOURCE.md) | `@zxing/library` | 0.23.0 | [Apache-2.0](zxing-library/LICENSE) | Ersatz-Decoder (JavaScript) im SecurPharm-Scanner |
| [tabler-icons](tabler-icons/SOURCE.md) | `@tabler/icons` | 3.50.0 | [MIT](tabler-icons/LICENSE) | Favicons – die Icons werden von scripts/build-icons.mjs in icon.svg eingebettet |
| [transformers](transformers/SOURCE.md) | `@huggingface/transformers` | 4.3.2 | [Apache-2.0](transformers/LICENSE) | Whisper-Spracherkennung im Browser (Sprache zu Text) |
| [onnxruntime-web](onnxruntime-web/SOURCE.md) | `onnxruntime-web` | 1.31.0-dev.20260914-8d85527a0 | [MIT](onnxruntime-web/LICENSE) | Rechen-Engine (WebAssembly/WebGPU) für transformers.js – Version muss zu transformers passen |
| [ogg-opus-decoder](ogg-opus-decoder/SOURCE.md) | `ogg-opus-decoder` | 1.7.5 | [MIT](ogg-opus-decoder/LICENSE) | Ersatz-Decoder für Ogg-Opus-Sprachnachrichten (z. B. ältere iPhones) |

## Aktualisieren

- Prüfen: `node scripts/vendor.mjs --check` (läuft monatlich als GitHub Action und öffnet bei Bedarf ein Issue)
- Aktualisieren: `node scripts/vendor.mjs --update <name>`, danach die betroffenen Seiten testen
