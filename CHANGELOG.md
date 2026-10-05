# Changelog

Semua perubahan penting pada ekstensi "KiyaraRouter for VS Code" didokumentasikan di sini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
dan proyek ini memakai [Semantic Versioning](https://semver.org/lang/id/).

## [0.2.0] - 2026-10-05

### Added

- **Dukungan tool calling penuh** — extension kini meneruskan daftar tool dari
  VS Code ke API KiyaraRouter, membaca `tool_calls` dari respons (termasuk yang
  datang bertahap lewat stream), mengembalikannya ke VS Code, dan meneruskan
  hasil tool kembali ke model. Ini mengaktifkan mode **Agent** dan fitur seperti
  `read_codebase` / akses file.

### Fixed

- Sebelumnya daftar tool tidak diteruskan ke API, sehingga model tertentu
  mengeluarkan pemanggilan tool sebagai teks mentah (mis. `<invoke ...>`).

## [0.1.2] - 2026-10-05

### Changed

- Menambahkan tag `language-models`, `copilot`, `byok`, dan tag relevan lain
  agar extension mudah ditemukan di Marketplace.

## [0.1.1] - 2026-10-05

### Changed

- Menambahkan tautan repositori & issue tracker GitHub
  ([kaivanriz/kiyararouter-vscode](https://github.com/kaivanriz/kiyararouter-vscode)).

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
