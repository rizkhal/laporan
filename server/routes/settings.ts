import { Router, Request, Response } from "express";
import { prisma } from "../config/db";

const router = Router();

interface SettingsBody {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const settings = await prisma.setting.findFirst();

    if (!settings) {
      return res.status(200).json({ message: "No settings found" });
    }

    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch settings" });
  }
});

/**
 * POST /api/settings
 * Creates or updates the repository configuration
 * If settings exist, updates them; otherwise creates new ones
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { owner, repo, branch, token } = req.body as SettingsBody;

    // Validate required fields
    if (!owner || !repo || !branch || !token) {
      return res.status(400).json({
        message: "Missing required fields: owner, repo, branch, token",
      });
    }

    // Check if settings already exist
    const existing = await prisma.setting.findFirst();

    let settings;
    if (existing) {
      // Update existing settings
      settings = await prisma.setting.update({
        where: { id: existing.id },
        data: { owner, repo, branch, token },
      });
    } else {
      // Create new settings
      settings = await prisma.setting.create({
        data: { owner, repo, branch, token },
      });
    }

    res.status(200).json(settings);
  } catch (error) {
    console.error("Failed to save settings:", error);
    res.status(500).json({ message: "Failed to save settings" });
  }
});

export default router;
