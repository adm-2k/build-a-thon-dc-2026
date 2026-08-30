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
