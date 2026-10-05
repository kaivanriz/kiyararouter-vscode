# PROMPT RISET: Cek Tool Calling Model KiyaraRouter

> Tempel prompt ini ke agent / Copilot / model lain. Jangan ubah kode apa pun.
> Tugasnya HANYA menyelidiki lalu melaporkan hasilnya.

---

## Konteks

Saya sedang membangun ekstensi VS Code bernama **"KiyaraRouter for VS Code"**.
Ekstensi ini mendaftarkan [KiyaraRouter](https://kiyararouter.web.id) sebagai
**Language Model Provider**, sehingga model-modelnya bisa dipakai di VS Code Chat /
GitHub Copilot (chat, edit, agent mode).

- Base URL: `https://kiyararouter.web.id/v1`
- Format: OpenAI-compatible (`/v1/chat/completions`, `/v1/models`)
- Katalog publik (tanpa API key): `https://kiyararouter.web.id/api/public/models`
- API key dipakai sebagai header: `Authorization: Bearer sk-kiyara-...`

## Masalah yang sedang diselidiki

Saat saya minta **agent membaca codebase** (`read_codebase`, atau minta model memakai
tool/file), model **DeepSeek** (`deepseek-ai/deepseek-v4-pro-0813`) **tidak memanggil
tool dengan benar**. Yang muncul di chat adalah **teks XML mentah** seperti ini:

```
<invoke name="read_file">
  <parameter name="path">d:\Projecty\kiyarav3\kiyaracore\README.md</parameter>
</invoke>
<invoke name="read_file">
  <parameter name="path">d:\Projecty\kiyarav3\kiyaracore\plan.md</parameter>
</invoke>
```

Format `<invoke>` / `<parameter>` itu adalah **gaya tool-call Anthropic/Claude**,
bukan gaya OpenAI. VS Code hanya mengenali format OpenAI `tool_calls`, jadi teks
itu ditampilkan mentah dan tool tidak pernah dieksekusi.

Hipotesis: **beberapa model di KiyaraRouter mengembalikan tool call sebagai teks
di `content`, bukan sebagai array `tool_calls` sesuai spesifikasi OpenAI Chat
Completions API.**

## TUGAS ANDA (HANYA RISET — JANGAN UBAH KODE)

### 1. Uji tool calling ke beberapa model

Kirim request ke `POST https://kiyararouter.web.id/v1/chat/completions` dengan
parameter `tools` (format OpenAI function calling) untuk beberapa model, lalu
periksa bentuk responsnya.

Contoh request (ganti `MODEL` dan `API_KEY`):

```bash
curl -sS https://kiyararouter.web.id/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "MODEL",
    "messages": [
      { "role": "user", "content": "Baca file README.md di folder saat ini lalu ringkas isinya. Gunakan tool read_file." }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "read_file",
          "description": "Baca isi sebuah file dari disk",
          "parameters": {
            "type": "object",
            "properties": {
              "path": { "type": "string", "description": "Path file yang akan dibaca" }
            },
            "required": ["path"]
          }
        }
      }
    ],
    "tool_choice": "auto",
    "max_tokens": 512
  }'
```

Uji minimal model berikut:
- `deepseek-ai/deepseek-v4-pro-0813`
- `deepseek-ai/deepseek-v4.1-flash`
- `openai/gpt-6-luna`
- `openai/gpt-6.1-sol`
- `anthropic/claude-opus-5.5`
- `google/gemini-3.8-flash`
- `qwen/qwen3.8-flash`
- `x-ai/grok-4.7`
- `z-ai/glm-5.3`

### 2. Analisis bentuk respons tiap model

Untuk setiap model, tentukan **termasuk kategori mana**:

- **A. NATIVE OK** — respons berisi `choices[0].message.tool_calls[]` dengan
  `function.name` dan `function.arguments` yang valid (JSON string), dan
  `finish_reason` = `tool_calls`. → tool calling bekerja.

- **B. TEKS XML** — tidak ada `tool_calls`, tapi `content` berisi teks
  `<invoke name="...">` / `<parameter name="...">` (gaya Anthropic).
  → VS Code tidak bisa memakainya, tool tidak dieksekusi.

- **C. TEKS JSON** — tidak ada `tool_calls`, tapi `content` berisi JSON tool call
  mentah (mis. `{"name":"read_file","arguments":{...}}`). → tidak dipakai.

- **D. TIDAK MENDUKUNG** — model mengabaikan `tools` sepenuhnya dan hanya menjawab teks biasa.

Catat juga: apakah parameter `tools` **ditolak** (error 400) atau `finish_reason`-nya apa.

### 3. Periksa katalog publik

Ambil `https://kiyararouter.web.id/api/public/models` dan laporkan:

- Apakah ada field yang menunjukkan dukungan tool calling
  (mis. `supports_tools`, `capabilities`, `tools`, `supported_parameters`)?
- Field apa saja yang tersedia di tiap item? (daftar lengkap kunci)

### 4. Uji request TANPA `tools`

Ulangi request ke satu model bermasalah **tanpa** parameter `tools` untuk
memastikan perilaku normal (menjawab teks) tidak terganggu.

## FORMAT LAPORAN YANG DIMINTA

Kembalikan laporan berupa tabel:

| Model | Kategori (A/B/C/D) | Ada `tool_calls`? | `finish_reason` | Catatan |
|-------|--------------------|-------------------|-----------------|---------|
| deepseek-ai/deepseek-v4-pro-0813 | ? | ? | ? | ? |
| ... | ... | ... | ... | ... |

Lalu tambahkan:

1. **Kesimpulan** — model mana saja yang tool calling-nya benar (kategori A),
   dan mana yang bermasalah (B/C/D)?
2. **Bukti mentah** — tempel potongan respons JSON asli (dimask/truncate seperlunya,
   jangan bocorkan API key) untuk minimal satu model kategori B dan satu kategori A.
3. **Rekomendasi** — model mana yang sebaiknya dipakai untuk agent mode /
   `read_codebase`, dan apa yang perlu diperbaiki (di sisi gateway atau extension).
4. **Daftar field katalog publik** hasil langkah 3.

## ATURAN PENTING

- **JANGAN mengubah kode apa pun.** Ini tugas riset/laporan saja.
- **JANGAN menampilkan API key** di laporan (masking: `sk-kiyara-***`).
- Kalau tidak punya API key, **berhenti** dan minta API key dulu.
- Kalau sebuah model mengembalikan error (401/402/404/429/503), catat errornya,
  jangan hentikan seluruh penyelidikan.
- Sertakan **bukti mentah** (potongan JSON), bukan hanya kesimpulan.
