import { Router, Request, Response } from "express";

import { prisma } from "../config/db";
import { syncCommitsToDatabase } from "../services/commits";

const router = Router();

// GET /api/commits - Load commits from database (Database First)
router.get("/", async (req: Request, res: Response) => {
  try {
    const settings = await prisma.setting.findFirst();
    if (!settings) {
      return res
        .status(400)
        .json({ message: "Repository settings not configured." });
    }

    // Load commits from database
    const commits = await prisma.commit.findMany({
      where: { settingId: settings.id },
      orderBy: { date: "desc" },
    });

    // If no commits in DB, return empty array with message
    if (commits.length === 0) {
      return res.json({
        commits: [],
        lastSync: settings.lastSync,
        message: "No commits synced yet. Click sync to fetch commits.",
      });
    }

    res.json({
      commits,
      lastSync: settings.lastSync,
      count: commits.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load commits" });
  }
});

// POST /api/commits/sync - Sync commits from GitHub to database
router.post("/sync", async (req: Request, res: Response) => {
  try {
    const settings = await prisma.setting.findFirst();
    if (!settings) {
      return res
        .status(400)
        .json({ message: "Repository settings not configured." });
    }

    const { owner, repo, branch, token } = settings;

    // Sync from GitHub and save to database
    const syncedCount = await syncCommitsToDatabase(
      owner,
      repo,
      branch,
      token,
      settings.id,
    );

    // Update lastSync timestamp
    await prisma.setting.update({
      where: { id: settings.id },
      data: { lastSync: new Date() },
    });

    // Return synced commits from database
    const commits = await prisma.commit.findMany({
      where: { settingId: settings.id },
      orderBy: { date: "desc" },
    });

    res.json({
      message: `Successfully synced ${syncedCount} commits`,
      commits,
      lastSync: new Date(),
      count: commits.length,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({
      message: err.message || "Failed to sync commits",
    });
  }
});

router.post("/ai/summary", async (req, res) => {
  const { commit, type } = req.body;

  try {
    const summary = await generateAISummary(commit, type);

    return res.json({ summary });
  } catch (err: any) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to generate summary" });
  }
});

async function generateAISummary(commitText: string, type: "weekly" | "daily") {
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
            content: `
              Kamu adalah tech lead di tim pengembangan perangkat lunak. Tugasmu adalah menulis ringkasan progres ${type} berdasarkan pesan git commit untuk dilaporkan kepada atasan non-teknis.
              Aturan penulisan:
              - Gunakan bahasa formal, jelas, dan mudah dipahami non-teknisi.
              - Sebutkan modul atau fitur spesifik yang dikerjakan (jika ada) dan beri **bold** pada nama modul/fitur.
              - Jangan menambahkan istilah yang tidak ada di commit.
              - Hanya tulis ringkasan dalam paragraf, 2-3 kalimat, tanpa bullet points atau daftar.
            `,
          },
          {
            role: "user",
            content: `
              Berikut daftar commit ${type} untuk repo: 
              ${commitText}
              Buat ringkasan progres ${type} berdasarkan commit di atas.
            `,
          },
        ],
      }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Groq API error");
  }

  return (
    data.choices?.[0]?.message?.content?.trim() ?? "Could not generate summary."
  );
}

export default router;
