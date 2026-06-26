import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, "..", ".tmp");

function ensureTmpDir() {
  if (!existsSync(TMP_DIR)) {
    mkdirSync(TMP_DIR, { recursive: true });
  }
}

export function convertMarkdownToDocx(markdown: string, filename: string): Buffer {
  ensureTmpDir();

  const mdPath = path.join(TMP_DIR, `${filename}.md`);
  const docxPath = path.join(TMP_DIR, `${filename}.docx`);

  try {
    // Write markdown to temp file
    writeFileSync(mdPath, markdown, "utf-8");

    // Convert using Pandoc
    execSync(
      `pandoc "${mdPath}" -o "${docxPath}" --from markdown --to docx --toc`,
      { encoding: "utf-8", timeout: 30000 },
    );

    // Read the generated DOCX
    return readFileSync(docxPath);
  } finally {
    // Cleanup temp files
    try { unlinkSync(mdPath); } catch {}
    try { unlinkSync(docxPath); } catch {}
  }
}
