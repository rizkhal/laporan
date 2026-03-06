import { Router, Request, Response } from "express";

import { prisma } from "../config/db";
import { fetchAllCommits } from "../services/commits";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const settings = await prisma.setting.findFirst();
    if (!settings) {
      return res
        .status(400)
        .json({ message: "Repository settings not configured." });
    }

    const { owner, repo, branch, token } = settings;

    const commits = await fetchAllCommits(owner, repo, branch, token);

    await prisma.setting.update({
      where: { id: settings.id },
      data: { lastSync: new Date() },
    });

    res.json(commits);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch commits" });
  }
});

router.post("/ai/summary", async (req, res) => {
  const { commits } = req.body;

  if (!Array.isArray(commits) || commits.length === 0) {
    return res.status(400).json({ message: "commits array is required" });
  }

  const commitMessages: string[] = commits.filter((m) => typeof m === "string");

  const lines = commitMessages.map((m) => `- ${m}`).join("\n");

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          max_tokens: 512,
          messages: [
            {
              role: "system",
              content: `Kamu adalah tech lead di tim pengembang aplikasi SIP (Sistem Informasi Pengawasan) milik Ditjen PSDKP, Kementerian Kelautan dan Perikanan Republik Indonesia. Tugasmu menulis ringkasan sprint mingguan berdasarkan pesan git commit untuk dilaporkan kepada atasan non-teknis \n
                            Gunakan kamus istilah berikut dan JANGAN ubah kepanjangannya:
                            - SIP = Sistem Informasi Pengawasan
                            - PSDKP = Pengawasan Sumber Daya Kelautan dan Perikanan
                            - KKPRL = Kesesuaian Kegiatan Pemanfaatan Ruang Laut
                            - MOMI = Minerba One Map Indonesia
                            - Ditjen = Direktorat Jenderal
                            - KKP = Kementerian Kelautan dan Perikanan
                            - WASRISK = Pengawasan Berbasis Risiko
                            - PPBBR = Pengawasan Berbasis Risiko

                            Konteks sistem: SIP digunakan untuk pengawasan sumber daya kelautan dan perikanan Indonesia, mencakup perizinan kapal, pengawasan KKPRL, integrasi data MOMI, dan kepatuhan pelaku usaha perikanan.

                            Aturan penulisan:
                            - Bahasa Indonesia formal, mudah dipahami pejabat non-teknis
                            - Jangan terjemahkan istilah teknis seperti nama modul, endpoint, atau singkatan di atas
                            - Jangan mengarang kepanjangan singkatan di luar daftar kamus`,
            },
            {
              role: "user",
              content: `Berikut daftar commit pada sistem SIP minggu ini:
${lines}

Buatkan ringkasan 2-3 kalimat yang menjelaskan progres pengembangan minggu ini kepada atasan non-teknis. Sebutkan modul atau fitur spesifik yang dikerjakan (contoh: **KKPRL**, **MOMI**, **master data**). Gunakan **bold** untuk nama modul. Bahasa formal, tanpa bullet points, cukup paragraf.`,
            },
          ],
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Groq API error");
    }

    const summary: string =
      data.choices?.[0]?.message?.content ?? "Could not generate summary.";
    return res.json({ summary });
  } catch (err: any) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to generate summary" });
  }
});

export default router;
