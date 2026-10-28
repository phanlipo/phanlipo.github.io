# Test fixtures

- `tone.opus` – 2 s, 440 Hz sine, Ogg Opus mono (like a WhatsApp voice message, without speech).
  Created with: `ffmpeg -f lavfi -i "sine=frequency=440:duration=2" -c:a libopus -b:a 16k -ar 48000 -ac 1 tone.opus`

No real voice recordings in the repository (privacy). For an end-to-end transcription
test with a real recording use `tests/manual/whisper-e2e.mjs` (see tests/README.md).
