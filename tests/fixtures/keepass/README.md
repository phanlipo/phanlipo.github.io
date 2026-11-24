# KeePass-Testdatenbanken

Alle mit dem Passwort `test-passwort` (außer `kdbx4-keyfile-only.kdbx`). Inhalt: Gruppe „Testtresor“ mit Eintrag „Mail“ (Benutzername, Passwort, Adresse, zweizeilige Notiz, geschütztes Feld `PIN`, `otp` mit Geheimnis `JBSWY3DPEHPK3PXP`), Untergruppe „Bank“ mit „Girokonto“ (Passwort `Bank-Pässwört€`, ein älteres Passwort im Verlauf) und Papierkorb mit „Geloescht“.

| Datei | Format | Schlüssel |
|---|---|---|
| `kdbx3-aeskdf-salsa20.kdbx` | KDBX 3.1, AES-256, AES-KDF 30 000 Runden, Salsa20 | Passwort |
| `kdbx4-aeskdf-aes.kdbx` | KDBX 4.0, AES-256, AES-KDF 20 000 Runden, ChaCha20 | Passwort |
| `kdbx4-argon2d-chacha20.kdbx` | KDBX 4.0, ChaCha20, Argon2d (1 MiB, 2 Durchläufe, 2 parallel) | Passwort |
| `kdbx4-argon2id-keyfile.kdbx` | KDBX 4.0, AES-256, Argon2id | Passwort + `test.keyx` (XML v2) |
| `kdbx4-keyfile-only.kdbx` | KDBX 4.0, AES-256, Argon2id | nur `test-binary.key` (32 Byte) |

Entstehung (unabhängig vom Code der App): Die Einträge als KeePass-XML mit `keepassxc-cli import` (KeePassXC 2.7.6) in eine KDBX-3.1-Datei, die Schlüsseldatei mit `keepassxc-cli db-create --set-key-file`. Daraus mit pykeepass 4.2: Runden verringert (KDBX 3.1) bzw. der XML-Baum in eine KDBX-4-Datei übernommen und Verschlüsselung/Schlüsselableitung im Kopf gesetzt. Jede Datei wurde danach mit `keepassxc-cli show` geöffnet und die Passwörter verglichen.
