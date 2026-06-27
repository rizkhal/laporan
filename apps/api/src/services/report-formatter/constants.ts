import type { ReportMode } from "./types";

// ── Configurable Section Mapping ──

export const SECTION_MAP: Record<string, string> = {
  feature: "PENGEMBANGAN SISTEM",
  bugfix: "PERBAIKAN DAN PENYEMPURNAAN",
  refactor: "PERBAIKAN DAN PENYEMPURNAAN",
  performance: "PERBAIKAN DAN PENYEMPURNAAN",
  dependency: "INFRASTRUKTUR DAN DEPLOYMENT",
  infrastructure: "INFRASTRUKTUR DAN DEPLOYMENT",
  documentation: "PERBAIKAN DAN PENYEMPURNAAN",
  testing: "PERBAIKAN DAN PENYEMPURNAAN",
  other: "PENGEMBANGAN SISTEM",
};

export const SECTION_ORDER = [
  "PENGEMBANGAN SISTEM",
  "PERBAIKAN DAN PENYEMPURNAAN",
  "INFRASTRUKTUR DAN DEPLOYMENT",
];

export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

// ── Mode → Appendix mapping ──

export const APPENDIX_MODES: Record<ReportMode, string[]> = {
  ringkas:  ["A"],
  standar:  ["A", "B", "F"],
  lengkap:  ["A", "B", "C", "D", "F", "G"],
  audit:    ["A", "B", "C", "D", "E", "F", "G"],
};
