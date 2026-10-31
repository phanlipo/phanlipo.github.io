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
- `silent.mp4` – 1 s test picture without sound track.
  `ffmpeg -f lavfi -i "testsrc=size=64x48:rate=10:duration=1" -c:v libx264 -pix_fmt yuv420p silent.mp4`
