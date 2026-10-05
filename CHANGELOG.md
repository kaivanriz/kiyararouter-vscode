# Changelog

Semua perubahan penting pada ekstensi "KiyaraRouter for VS Code" didokumentasikan di sini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
dan proyek ini memakai [Semantic Versioning](https://semver.org/lang/id/).

## [0.1.0] - 2026-10-05

### Added

- Registrasi KiyaraRouter sebagai **Language Model Provider** untuk VS Code —
  model KiyaraRouter muncul di pemilih model VS Code Chat / GitHub Copilot.
- **Context window** dan **kapabilitas** (vision, tool calling) asli dari
  katalog KiyaraRouter (`/api/public/models`).
- **Streaming** balasan via endpoint OpenAI-compatible
  `/v1/chat/completions`.
- Penyimpanan **API key** yang aman di SecretStorage VS Code.
- Perintah:
  - `Kiyara: Kelola Provider` — menu utama (API key, model, chat)
  - `Kiyara: Atur API Key` / `Kiyara: Hapus API Key`
  - `Kiyara: Pilih Model` — daftar model + harga
  - `Kiyara: Muat Ulang Daftar Model`
  - `Kiyara: Buka Chat`
  - `Kiyara: Tampilkan Status Koneksi`
- Status bar menampilkan status koneksi KiyaraRouter.
- Pengaturan: `baseUrl` tetap, `temperature`, `maxTokens`, `systemPrompt`,
  `modelAllowList`, `visionModels`, dan batas token fallback.
- Model kategori `decision` dan model yang tidak tersedia disembunyikan
  otomatis dari pemilih.

### Notes

- Memerlukan VS Code 1.104+ dan GitHub Copilot Chat.
- Endpoint sudah tetap (`https://kiyararouter.web.id/v1`) — cukup masukkan API key.
