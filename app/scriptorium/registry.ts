/**
 * app/scriptorium/registry.ts — the Scriptorium's own constants.
 *
 * OCR model registry per DATA-CAVEATS.md addendum 2 §10 (live-verified
 * 2026-08-30 against the HF Inference Providers router). Swapping models is a
 * per-request string (SPEC §4) — this list is what the picker shows; a
 * free-text override is always available underneath it because "the catalog
 * churns" (addendum 2 §10).
 */

export type OcrModelOption = {
  id: string;
  label: string;
  note: string;
};

export const OCR_MODEL_REGISTRY: readonly OcrModelOption[] = [
  {
    id: "Qwen/Qwen3-VL-30B-A3B-Instruct",
    label: "Qwen3-VL-30B",
    note: "Default · quality (~36s on a dense page)",
  },
  {
    id: "google/gemma-3-27b-it",
    label: "Gemma-3-27B",
    note: "Fast draft (~4s, noticeably lossier)",
  },
  {
    id: "Qwen/Qwen2.5-VL-72B-Instruct",
    label: "Qwen2.5-VL-72B",
    note: "Second opinion",
  },
  {
    id: "CohereLabs/aya-vision-32b",
    label: "Aya-Vision-32B",
    note: "Multilingual alt",
  },
] as const;

export const DEFAULT_OCR_MODEL: string = OCR_MODEL_REGISTRY[0].id;

export const SCRIPT_OPTIONS = [
  { value: "print", label: "Print" },
  { value: "handwriting", label: "Handwriting" },
] as const;
export type ScriptOption = (typeof SCRIPT_OPTIONS)[number]["value"];

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "de", label: "German" },
] as const;
export type LanguageOption = (typeof LANGUAGE_OPTIONS)[number]["value"];

/** SPEC §5 / DATA-CAVEATS addendum 2 §10: client-side downscale ceiling. */
export const MAX_LONGEST_EDGE = 1600;

/**
 * The real corpus fixtures Lane D harvested (live HF-router OCR, eyeballed
 * against the source scans) — `fixtures/ocr/<slug>.json`. POST /api/ocr's
 * `fixture` param (added #19, 2026-08-30) selects one of these when the
 * ladder falls to its floor; Scriptorium offers them as an explicit "demo
 * page" choice so a keyless build can still show a real transcription end
 * to end instead of only ever reaching LACUNA. Selecting "" (the default)
 * sends no `fixture` override — live/cached behavior is unaffected either
 * way, and the ladder's own floor now falls to `fixtures/ocr/default.json`
 * (added #22) rather than a guaranteed LACUNA when no slug is given.
 */
export const DEMO_FIXTURES = [
  { slug: "", label: "None — use the uploaded image (or the ladder's default)" },
  { slug: "eb1911-rationalism-2", label: "EB1911 Vol. 22 — Rationalism (EN print)" },
  { slug: "die-kunst-1899-buchgewerbe", label: "Die Kunst, 1899 (DE Antiqua)" },
  { slug: "gartenlaube-1899-nervenschutz", label: "Die Gartenlaube, 1899 (DE Fraktur)" },
  { slug: "wright-diary-1903", label: "Wright diary, 1903 (EN handwriting)" },
] as const;
