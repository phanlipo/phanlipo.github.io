# Test fixtures

- `tone.opus` – 2 s, 440 Hz sine, Ogg Opus mono (like a WhatsApp voice message, without speech).
  Created with: `ffmpeg -f lavfi -i "sine=frequency=440:duration=2" -c:a libopus -b:a 16k -ar 48000 -ac 1 tone.opus`

No real voice recordings in the repository (privacy). For an end-to-end transcription
test with a real recording use `tests/manual/whisper-e2e.mjs` (see tests/README.md).

Video zu Audio (`video-to-audio.spec.mjs`, read by `audio-files.mjs`):

- `clip-aac.mp4` – 2 s, 64×48 test picture (H.264) + 440 Hz sine, AAC mono 44.1 kHz.
  `ffmpeg -f lavfi -i "testsrc=size=64x48:rate=10:duration=2" -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=2" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 64k -ac 1 -shortest clip-aac.mp4`
- `clip-opus.webm` – 2 s, test picture (VP8) + 880 Hz sine, Opus mono 48 kHz.
  `ffmpeg -f lavfi -i "testsrc=size=64x48:rate=10:duration=2" -f lavfi -i "sine=frequency=880:sample_rate=48000:duration=2" -c:v libvpx -b:v 50k -c:a libopus -b:a 32k -ac 1 -shortest clip-opus.webm`
- `clip-tagged.mp4` – `clip-aac.mp4` with tags (title, artist, album) and recording time (`mvhd`).
  `ffmpeg -i clip-aac.mp4 -c copy -metadata title="Konzert im Park" -metadata artist="Die Band" -metadata album="Live 2024" -metadata creation_time=2024-05-01T12:34:56Z clip-tagged.mp4`
- `silent.mp4` – 1 s test picture without sound track.
  `ffmpeg -f lavfi -i "testsrc=size=64x48:rate=10:duration=1" -c:v libx264 -pix_fmt yuv420p silent.mp4`

Text zu Sprache (`text-to-speech.spec.mjs`):

- `tiny-piper.onnx` – winziges Stand-in für eine Piper-Stimme (gleiche Ein- und Ausgänge: `input`, `input_lengths`,
  `scales` → `output`), das statt Sprache die Phonem-IDs / 1000 × Längenfaktor ausgibt. So prüft der Test die echte
  Pipeline (eSpeak NG → Phonem-IDs → onnxruntime) ohne 60-MB-Download. Erzeugt mit `tiny-piper.py`
  (`pip install onnx`, dann `python tiny-piper.py tiny-piper.onnx`).
- `tiny-kokoro.onnx` – dasselbe für die deutsche Kokoro-Stimme (`input_ids`, `style`, `speed` → `waveform`):
  gibt die Token-IDs / 1000 × Tempo aus. Erzeugt mit `tiny-kokoro.py`.

Kamera-Effekte (`camera-effects.spec.mjs`):

- `selfie_segmenter.tflite` – MediaPipe Selfie Segmenter (float16, 250 KB, Apache-2.0), unverändert von
  `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite`.
  Der Test liefert es statt des Downloads aus und prüft damit die echte Engine (MediaPipe-WebAssembly im Worker).
  Das Personen-Modell (4,6 MB) liegt bewusst nicht im Repository – Test mit echten Fotos: `tests/manual/camera-e2e.mjs`.

Bildkonverter und Dokumentenscanner (`image-converter.spec.mjs`, `doc-scanner.spec.mjs`):

- `photo.heic` – 64×48 HEIC (HEVC) mit vier Farbfeldern (rot | grün / blau | weiß), Stand-in für ein iPhone-Foto.
  Erzeugt mit `photo-heic.py` (`pip install pillow pillow-heif`, dann `python photo-heic.py photo.heic`).

SecurPharm-Scanner (`securpharm-scanner.spec.mjs`):

- `code.heic` – securPharm-DataMatrix (derselbe Code wie im Test) als HEIC, Stand-in für ein iPhone-Foto einer Packung.
  Erzeugt mit `node tests/fixtures/code-heic.mjs` (braucht Python mit `pillow-heif`).

Videoanalyse (`video-analysis.spec.mjs`, `webmcp.spec.mjs`):

- `fall.webm` – 320×240, 30 fps, 1,5 s, VP8, jedes Bild ein Keyframe (genaues Springen). Ein rotes 16×16-Quadrat
  bewegt sich gleichförmig nach rechts und fällt beschleunigt: linke obere Ecke x = 52 + 40·t, y = 22 + 60·t² (Pixel);
  VP8 legt es auf gerade Pixel. Ein schwarzer Balken von x = 0 bis 200 (y = 220…223) ist der Maßstab (200 px = 1 m).
  `ffmpeg -f lavfi -i "color=c=0xe8e8e8:s=320x240:r=30:d=1.5" -f lavfi -i "color=c=red:s=16x16:r=30:d=1.5" -filter_complex "[0]drawbox=x=0:y=220:w=200:h=4:color=black:t=fill[bg];[bg][1]overlay=x='52+40*t':y='22+60*t*t'" -c:v libvpx -b:v 300k -g 1 -auto-alt-ref 0 fall.webm`
