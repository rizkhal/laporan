import { db } from "../../db/index";
import * as schema from "../../db/schema";
import { and, eq } from "drizzle-orm";

// ── Template Functions ──

export function getDefaultTemplate(): string {
  return `# **LAPORAN KEMAJUAN PEKERJAAN**

**Periode:** {{period}}
**Tanggal:** {{generatedDate}}

---

## KATA PENGANTAR

{{kataPengantar}}

---

## DAFTAR ISI

{{daftarIsi}}

---

{{sections}}

---

## KESIMPULAN

{{kesimpulan}}

---

## LAMPIRAN

{{lampiran}}

---

*Laporan ini dibuat secara otomatis berdasarkan data commit dan analisis AI dari repositori yang terkonfigurasi.*
`;
}

export function getTemplate(workspaceId: number): string {
  const template = db
    .select()
    .from(schema.reportTemplates)
    .where(and(eq(schema.reportTemplates.workspaceId, workspaceId), eq(schema.reportTemplates.isDefault, true)))
    .get();
  return template?.content || getDefaultTemplate();
}

export function getIndonesianMonth(month: number): string {
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return months[month - 1] || "Unknown";
}

export function getCategoryLabel(kategori: string): string {
  const labels: Record<string, string> = {
    feature: "Fitur Baru",
    bugfix: "Perbaikan Bug",
    refactor: "Perbaikan & Penyempurnaan",
    performance: "Optimasi Kinerja",
    dependency: "Dependency & Infrastruktur",
    infrastructure: "Infrastruktur & Deployment",
    documentation: "Dokumentasi",
    testing: "Pengujian",
    other: "Lainnya",
  };
  return labels[kategori] || kategori;
}

export function getWeekNumber(dateStr: string): number {
  const date = new Date(dateStr);
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function getDirectory(filePath: string): string {
  const parts = filePath.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";
}
