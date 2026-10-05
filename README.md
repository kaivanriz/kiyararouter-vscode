# KiyaraRouter for VS Code

Satu API key untuk semua model AI — pakai model dari [KiyaraRouter](https://kiyararouter.web.id) langsung di dalam VS Code.

Ekstensi ini mendaftarkan KiyaraRouter sebagai **provider model bahasa** untuk VS Code. Setelah API key diatur, semua model KiyaraRouter (OpenAI, Anthropic, Google, DeepSeek, xAI, Mistral, dan lainnya) akan muncul di **pemilih model** VS Code Chat / GitHub Copilot — lalu Copilot bisa memakai model tersebut untuk chat, edit, dan agent.

> Ekstensi ini memerlukan **VS Code 1.104+** dan **GitHub Copilot Chat** untuk pengalaman chat lengkap.

## Fitur

- **Model KiyaraRouter di pemilih model** — semua model yang tersedia di akun Anda muncul otomatis.
- **Context window, harga & kapabilitas asli** — setiap model menampilkan ukuran konteks, harga per 1M token, status vision, dan tool calling yang benar (diambil dari katalog KiyaraRouter).
- **Tool calling** — mendukung mode Agent di VS Code Chat (akses file, `read_codebase`, dll). Tool dari VS Code diteruskan ke model, dan hasil tool dikembalikan dengan benar.
- **Streaming** — balasan mengalir real-time.
- **Satu endpoint** — cukup masukkan API key, endpoint (`kiyararouter.web.id`) sudah tetap.
- **API key aman** — disimpan di SecretStorage VS Code (bukan di settings/teks biasa).
- **Filter model** — batasi model yang dimunculkan bila perlu.

## Instalasi

### Dari VSIX

```powershell
code --install-extension kiyara-ai-0.1.0.vsix
```

### Dari source

```powershell
npm install
npm run esbuild
```

Lalu tekan **F5** di VS Code untuk menjalankan Extension Development Host.

## Cara pakai

1. Jalankan perintah **Kiyara: Kelola Provider** dari Command Palette (`Ctrl+Shift+P`).
2. Pilih **Atur API Key**, tempel API key Kiyara Anda (`sk-kiyara-...`).
3. Buka chat (ikon chat di title bar atau `Ctrl+Alt+I`).
4. Klik **pemilih model** di chat, pilih salah satu model **Kiyara**.
5. Mulai chat / coding.

Status koneksi Kiyara tampil di **status bar** (kanan bawah). Klik untuk membuka menu kelola provider.

### Alternatif: atur API key dari status bar

Klik indikator **Kiyara** di status bar → **Atur API Key**.

## Perintah

| Perintah | Fungsi |
|----------|--------|
| `Kiyara: Kelola Provider` | Menu utama: atur/hapus API key, muat ulang model, buka chat |
| `Kiyara: Atur API Key` | Simpan API key Kiyara |
| `Kiyara: Hapus API Key` | Hapus API key tersimpan |
| `Kiyara: Pilih Model` | Lihat daftar model & salin kode model |
| `Kiyara: Muat Ulang Daftar Model` | Refresh daftar model dari server |
| `Kiyara: Buka Chat` | Buka panel chat VS Code |
| `Kiyara: Tampilkan Status Koneksi` | Ringkasan konfigurasi aktif |

## Pengaturan

Endpoint sudah tetap (`https://kiyararouter.web.id/v1`) — Anda tidak perlu mengaturnya, cukup masukkan API key.

| Setting | Default | Keterangan |
|---------|---------|------------|
| `kiyara.temperature` | `0.3` | Kreativitas model (0–2) |
| `kiyara.maxTokens` | `0` | Batas token output, `0` = biarkan server |
| `kiyara.systemPrompt` | *(lihat settings)* | System prompt default |
| `kiyara.defaultMaxInputTokens` | `128000` | *Fallback* context window bila metadata katalog tak tersedia |
| `kiyara.defaultMaxOutputTokens` | `8192` | *Fallback* batas output bila context window tak diketahui |
| `kiyara.modelAllowList` | `[]` | Bila diisi, hanya model ini yang dimunculkan |
| `kiyara.visionModels` | `[]` | Override deteksi vision. Isi kode model untuk memaksa vision, beri awalan `-` untuk memaksa non-vision |
| `kiyara.debug` | `false` | Log debug (tool dikirim/diminta) di panel Output "KiyaraRouter" |

> **Context window, harga, dan kapabilitas** diambil otomatis dari katalog KiyaraRouter (`/api/public/models`). Batas output dihitung sebagai ~¼ dari context window (maksimum 64K token). Model kategori `decision` dan model yang ditandai tidak tersedia disembunyikan dari pemilih.
>
> Harga ditampilkan per 1M token (input/output) beserta persentase diskon terhadap harga resmi, contoh: `$0.0084/1M in · $0.025/1M out (-94%)`.

## Pengujian

| Perintah | Cakupan | Butuh GUI? |
|----------|---------|------------|
| `npm run test:unit` | Logika murni (konversi, family, error handling) | Tidak |
| `npm run test:smoke` | Koneksi nyata ke Kiyara (models, streaming, non-streaming) | Tidak |
| `npm run test:integration` | Aktivasi extension di dalam VS Code | **Ya** |

### Smoke test (butuh API key)

Set API key lewat environment, atau taruh di file `.env` sebagai `KIYARA_API_KEY=` / `API_KEY=`:

```powershell
$env:KIYARA_API_KEY = "sk-kiyara-..."
# opsional: pilih model murah untuk test
$env:KIYARA_TEST_MODEL = "deepseek-ai/deepseek-v4.1-flash"
npm run test:smoke
```

### Integration test

```powershell
npm run test:integration
```

> Integration test **membuka jendela VS Code**, jadi butuh sesi desktop. Bila Anda di server headless/lingkungan otomatis, jalankan pengujian manual:
>
> 1. Buka folder ini di VS Code → tekan **F5** (membuka Extension Development Host).
> 2. Di jendela baru: `Ctrl+Shift+P` → **Kiyara: Kelola Provider** → atur API key.
> 3. Buka chat → pemilih model → pilih model Kiyara → kirim pesan.

## Catatan

- Anda perlu **saldo/langganan aktif** di Kiyara. Bila saldo tidak cukup, API mengembalikan error 402 dan pesannya akan tampil di VS Code.
- Bila provider Kiyara dinonaktifkan oleh kebijakan organisasi (Copilot Business/Enterprise — policy *Bring Your Own Language Model Key*), model tidak akan muncul.

## Lisensi

MIT © 2026 Kiyara