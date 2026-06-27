import type { CommitInput } from "./types";

function sanitize(str: string): string {
  return str
    .replace(/[\u0000-\u001F]/g, "") // strip control chars
    .replace(/`/g, "'")                // backticks → single quote
    .replace(/\${/g, "$" + "{");         // prevent template literal injection
}

export function buildPrompt(commits: CommitInput[], repoName: string): string {
  return `Anda adalah analis software engineering yang sedang menyusun laporan bulanan untuk repositori "${sanitize(repoName)}".

## PENTING: BAHASA INDONESIA WAJIB

Seluruh output HARUS dalam Bahasa Indonesia. Ini adalah persyaratan WAJIB, bukan preferensi.
Bahasa Inggris HANYA diizinkan untuk:
- Nama teknologi, framework, library, produk
- Identifier kode sumber (nama kelas, fungsi, variabel)
- Nama berkas
- Hash commit

## BATASAN ANALISIS
- HANYA identifikasi item pekerjaan yang didukung oleh commit messages dan file changes
- JANGAN membuat item pekerjaan yang tidak memiliki bukti
- JANGAN menganalisis lockfiles atau build artifacts
- JANGAN membuat asumsi tentang dampak bisnis tanpa bukti

## STRUKTUR OUTPUT

Untuk SETIAP item pekerjaan yang bermakna, berikan:
- judul: Nama pekerjaan yang jelas
- deskripsi: Penjelasan detail dalam Bahasa Indonesia
- kategori: feature | bugfix | refactor | documentation | testing | infrastructure | performance | dependency | other
- dampak: "tinggi" | "sedang" | "rendah"
- bukti: Array dari {hashCommit, berkas} yang merujuk ke commit dan file terkait
- keyakinan: "tinggi" | "sedang" | "rendah"

Juga berikan:
- ringkasan: Ringkasan eksekutif 2-3 paragraf dalam Bahasa Indonesia
- dampak: Penilaian dampak teknis/bisnis secara keseluruhan dalam Bahasa Indonesia
- risiko: Risiko yang teridentifikasi dari perubahan ini dalam Bahasa Indonesia
- rekomendasi: Langkah selanjutnya yang direkomendasikan dalam Bahasa Indonesia

## VALIDASI BAHASA

Sebelum mengembalikan output akhir, VERIFIKASI bahwa:
1. Semua konten naratif ditulis dalam Bahasa Indonesia baku
2. Tidak ada kalimat Bahasa Inggris yang tersisa kecuali nama teknis yang diizinkan
3. Terjemahkan kalimat Bahasa Inggris apa pun ke Bahasa Indonesia yang alami
4. Hanya proper noun teknis (teknologi, framework, library, produk, identifier kode) yang boleh dalam Bahasa Inggris

Berikut adalah data commit:

${commits.map(c => `
Commit: ${c.hash}
Author: ${sanitize(c.authorName)}
Date: ${c.date}
Message: ${sanitize(c.message)}
Files: ${c.filesChanged} (+${c.insertions}/-${c.deletions})
Changed Files: ${c.changedFiles.join(", ")}

Diff Stats:
${c.diffStat.map(d => `  ${d.file}: +${d.insertions}/-${d.deletions}`).join("\n")}

Patch Snippets:
${c.patchSnippets.map(p => `  File: ${p.file}\n  ${p.patch.slice(0, 500)}`).join("\n")}
`).join("\n---\n")}

RESPON DENGAN JSON VALID dengan struktur ini (field names dan values HARUS Bahasa Indonesia):
{
  "workItems": [
    {
      "judul": "",
      "deskripsi": "",
      "kategori": "",
      "dampak": "tinggi|sedang|rendah",
      "bukti": [{"hashCommit": "", "berkas": ""}],
      "keyakinan": "tinggi|sedang|rendah"
    }
  ],
  "ringkasan": "",
  "dampak": "",
  "risiko": "",
  "rekomendasi": ""
}`;
}
