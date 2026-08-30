"use client";

import Link from "next/link";
import { useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent } from "react";
import {
  ApparatusMargin,
  MarginSection,
} from "@/components/ui/ApparatusMargin";
import { Compartment } from "@/components/ui/Compartment";
import { CollatingState, LacunaState } from "@/components/ui/LacunaState";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { downscaleToJpeg, type DownscaledImage } from "./downscale";
import { requestTranscription, saveToRecord, type OcrResult } from "./ocr-client";
import {
  DEFAULT_OCR_MODEL,
  LANGUAGE_OPTIONS,
  OCR_MODEL_REGISTRY,
  SCRIPT_OPTIONS,
  type LanguageOption,
  type ScriptOption,
} from "./registry";

type Phase = "idle" | "collating" | "drafted" | "saving" | "saved";

const inputStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-mono)",
  color: "var(--ink)",
  background: "var(--stock)",
  border: "1px solid var(--hairline)",
  borderRadius: "var(--radius-input)",
  padding: "calc(var(--space-unit) * 0.75) var(--space-unit)",
};

const primaryButton: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontWeight: 500,
  fontSize: "var(--text-mono)",
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: "var(--on-rubric)",
  background: "var(--rubric)",
  border: "none",
  borderRadius: "var(--radius-input)",
  padding: "calc(var(--space-unit) * 1.25) calc(var(--space-unit) * 2.5)",
  cursor: "pointer",
};

const secondaryButton: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontWeight: 500,
  fontSize: "var(--text-mono)",
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: "var(--ink)",
  background: "transparent",
  border: "1px solid var(--ink)",
  borderRadius: "var(--radius-input)",
  padding: "calc(var(--space-unit) * 1.25) calc(var(--space-unit) * 2.5)",
  cursor: "pointer",
};

const disabledButton: CSSProperties = {
  ...secondaryButton,
  color: "var(--ink-2)",
  border: "1px solid var(--hairline)",
  cursor: "not-allowed",
  opacity: 0.6,
};

const tertiaryLink: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-mono)",
  color: "var(--blue)",
  textDecoration: "underline",
};

const errorLine: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-mono)",
  color: "var(--err)",
  margin: 0,
};

function toggleButtonStyle(selected: boolean): CSSProperties {
  return {
    fontFamily: "var(--font-mono)",
    fontWeight: 500,
    fontSize: "var(--text-label)",
    letterSpacing: "0.06em",
    color: selected ? "var(--blue)" : "var(--ink-2)",
    background: selected ? "var(--wash-blue)" : "transparent",
    border: `1px solid ${selected ? "var(--blue)" : "var(--hairline)"}`,
    borderRadius: "var(--radius-input)",
    padding: "calc(var(--space-unit) * 0.6) calc(var(--space-unit) * 1.25)",
    cursor: "pointer",
  };
}

const transcriptionTextarea: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: "var(--space-unit)",
  fontFamily: "var(--font-serif)",
  fontSize: "var(--text-read)",
  lineHeight: 1.65,
  color: "var(--ink)",
  background: "var(--stock)",
  border: "1px solid var(--hairline)",
  borderRadius: "var(--radius-input)",
  padding: "calc(var(--space-unit) * 1.5)",
  resize: "vertical",
};

export function ScriptoriumClient() {
  const [image, setImage] = useState<DownscaledImage | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [script, setScript] = useState<ScriptOption>("print");
  const [language, setLanguage] = useState<LanguageOption>("en");
  const [model, setModel] = useState<string>(DEFAULT_OCR_MODEL);
  const [customModel, setCustomModel] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [ocrMode, setOcrMode] = useState<"live" | "cached" | "fixture">("fixture");
  const [ocrFetchedAt, setOcrFetchedAt] = useState<string | undefined>(undefined);
  const [editedText, setEditedText] = useState("");
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedDocumentId, setSavedDocumentId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeModel = customModel.trim() || model;

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    setOcrError(null);
    setOcrResult(null);
    setSavedDocumentId(null);
    setPhase("idle");
    if (!file.type.startsWith("image/")) {
      setFileError("That file is not an image. Choose a JPEG or PNG page scan.");
      return;
    }
    try {
      const downscaled = await downscaleToJpeg(file);
      setImage(downscaled);
    } catch {
      setFileError("Could not read that image in this browser.");
    }
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    void loadFile(e.target.files?.[0]);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    void loadFile(e.dataTransfer.files?.[0]);
  }

  async function onTranscribe() {
    if (!image) return;
    setOcrError(null);
    setPhase("collating");
    const outcome = await requestTranscription({
      imageDataUrl: image.dataUrl,
      model: activeModel,
      script,
      language,
    });
    if (!outcome.ok) {
      setOcrError(outcome.reason);
      setPhase("idle");
      return;
    }
    setOcrResult(outcome.data);
    setOcrMode(outcome.mode);
    setOcrFetchedAt(outcome.fetchedAt);
    setEditedText(outcome.data.text);
    setSavedDocumentId(null);
    setPhase("drafted");
  }

  async function onFixInRecord() {
    if (!ocrResult || !image) return;
    setSaveError(null);
    setPhase("saving");
    const outcome = await saveToRecord({
      documentId: ocrResult.documentId,
      text: editedText,
      sourceUrl: `scriptorium:${image.sha256}`,
      model: ocrResult.model,
      script: ocrResult.script === "handwriting" ? "handwriting" : "print",
      language: ocrResult.language === "de" ? "de" : "en",
    });
    if (!outcome.ok) {
      setSaveError(outcome.reason);
      setPhase("drafted");
      return;
    }
    setSavedDocumentId(outcome.documentId);
    setPhase("saved");
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "calc(var(--space-unit) * 4)",
        paddingTop: "calc(var(--space-unit) * 4)",
      }}
    >
    <main
      style={{
        flex: "1 1 480px",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: "calc(var(--space-unit) * 4)",
      }}
    >
      {/* -- Page image ------------------------------------------------- */}
      <section aria-label="Page image">
        <MicroLabel tone="dim" as="h2" style={{ display: "block", marginBottom: "var(--space-unit)" }}>
          Page image
        </MicroLabel>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          style={{
            border: `1px solid ${image ? "var(--hairline)" : "var(--hairline)"}`,
            borderRadius: "var(--radius)",
            padding: image ? 0 : "calc(var(--space-unit) * 6) var(--space-unit)",
            textAlign: image ? undefined : "center",
            background: "var(--stock-2)",
          }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.dataUrl}
              alt="Uploaded page scan"
              style={{ display: "block", width: "100%", height: "auto" }}
            />
          ) : (
            <label style={{ cursor: "pointer", display: "block" }}>
              <MicroLabel tone="dim">
                Drop a page image here, or choose a file
              </MicroLabel>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFileInputChange}
                style={{ display: "none" }}
              />
            </label>
          )}
        </div>
        {image ? (
          <div style={{ marginTop: "var(--space-unit)", display: "flex", gap: "var(--space-unit)", alignItems: "center" }}>
            <button type="button" style={secondaryButton} onClick={() => fileInputRef.current?.click()}>
              Replace image
            </button>
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={onFileInputChange}
              style={{ display: "none" }}
            />
            <MicroLabel tone="dim">
              {image.width}×{image.height}px
            </MicroLabel>
          </div>
        ) : null}
        {fileError ? <p style={{ ...errorLine, marginTop: "var(--space-unit)" }}>{fileError}</p> : null}
      </section>

      {/* -- Reading conditions ------------------------------------------ */}
      {image ? (
        <section aria-label="Reading conditions">
          <MicroLabel tone="dim" as="h2" style={{ display: "block", marginBottom: "var(--space-unit)" }}>
            Reading conditions
          </MicroLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "calc(var(--space-unit) * 3)" }}>
            <div>
              <MicroLabel tone="dim" style={{ display: "block", marginBottom: "calc(var(--space-unit) * 0.5)" }}>
                Script
              </MicroLabel>
              <div style={{ display: "flex", gap: "calc(var(--space-unit) * 0.5)" }}>
                {SCRIPT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    style={toggleButtonStyle(script === opt.value)}
                    aria-pressed={script === opt.value}
                    onClick={() => setScript(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <MicroLabel tone="dim" style={{ display: "block", marginBottom: "calc(var(--space-unit) * 0.5)" }}>
                Language
              </MicroLabel>
              <div style={{ display: "flex", gap: "calc(var(--space-unit) * 0.5)" }}>
                {LANGUAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    style={toggleButtonStyle(language === opt.value)}
                    aria-pressed={language === opt.value}
                    onClick={() => setLanguage(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <MicroLabel as="label" htmlFor="model-select" tone="dim" style={{ display: "block", marginBottom: "calc(var(--space-unit) * 0.5)" }}>
                Model
              </MicroLabel>
              <select
                id="model-select"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
              >
                {OCR_MODEL_REGISTRY.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} — {m.note}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Or override with a model id"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                style={{ ...inputStyle, width: "100%", marginTop: "calc(var(--space-unit) * 0.75)" }}
              />
            </div>
          </div>
        </section>
      ) : null}

      {/* -- Actions ------------------------------------------------------
           Only rendered before a transcription exists — DESIGN-BRIEF rule 4
           caps the view at one rubricated primary action. Once ocrResult
           exists, "Fix in the record" (in the Transcription section below)
           takes over as the sole primary; "Re-transcribe" there covers redo. */}
      {image && !ocrResult ? (
        <section aria-label="Transcribe">
          <div style={{ display: "flex", alignItems: "center", gap: "calc(var(--space-unit) * 2)" }}>
            {phase === "collating" ? (
              <CollatingState />
            ) : (
              <button type="button" style={primaryButton} onClick={() => void onTranscribe()}>
                Transcribe
              </button>
            )}
          </div>
          {ocrError ? <p style={{ ...errorLine, marginTop: "var(--space-unit)" }}>{ocrError}</p> : null}
        </section>
      ) : null}

      {/* -- Transcription -------------------------------------------------- */}
      <section aria-label="Transcription">
        <MicroLabel tone="dim" as="h2" style={{ display: "block", marginBottom: "calc(var(--space-unit) * 2)" }}>
          Transcription
        </MicroLabel>
        <Compartment>
          {!ocrResult ? (
            <LacunaState note="Transcribe a page image to open the record." />
          ) : (
            <div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-unit)" }}>
                <ProvenanceChip mode={ocrMode} collatedAt={ocrFetchedAt ? formatHHMM(ocrFetchedAt) : undefined} />
                <MicroLabel tone="dim">{ocrResult.model}</MicroLabel>
                <MicroLabel tone="dim">{ocrResult.script} · {ocrResult.language}</MicroLabel>
              </div>
              {ocrResult.pageNote ? (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono)", color: "var(--ink-2)", marginTop: "var(--space-unit)" }}>
                  Model&apos;s note: {ocrResult.pageNote}
                </p>
              ) : null}
              <MicroLabel as="label" htmlFor="transcription-text" tone="dim" style={{ display: "block", marginTop: "calc(var(--space-unit) * 2)" }}>
                Edit before fixing in the record
              </MicroLabel>
              <textarea
                id="transcription-text"
                rows={12}
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                style={transcriptionTextarea}
              />
              <div style={{ display: "flex", alignItems: "center", gap: "calc(var(--space-unit) * 2)", marginTop: "calc(var(--space-unit) * 2)" }}>
                <button
                  type="button"
                  style={phase === "collating" ? disabledButton : secondaryButton}
                  disabled={phase === "collating"}
                  onClick={() => void onTranscribe()}
                >
                  Re-transcribe
                </button>
                {phase !== "saved" ? (
                  <button
                    type="button"
                    style={phase === "saving" || phase === "collating" ? disabledButton : primaryButton}
                    disabled={phase === "saving" || phase === "collating"}
                    onClick={() => void onFixInRecord()}
                  >
                    Fix in the record
                  </button>
                ) : null}
              </div>
              {phase === "collating" || phase === "saving" ? (
                <div style={{ marginTop: "var(--space-unit)" }}>
                  <CollatingState />
                </div>
              ) : null}
              {ocrError ? <p style={{ ...errorLine, marginTop: "var(--space-unit)" }}>{ocrError}</p> : null}
              {saveError ? <p style={{ ...errorLine, marginTop: "var(--space-unit)" }}>{saveError}</p> : null}
              {phase === "saved" ? (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono)", color: "var(--ink-2)", marginTop: "var(--space-unit)" }}>
                  Fixed in the record.
                </p>
              ) : null}
            </div>
          )}
        </Compartment>
      </section>
    </main>

      <ApparatusMargin>
        <MarginSection label="Model">
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono)", color: "var(--ink)", margin: 0, wordBreak: "break-all" }}>
            {activeModel}
          </p>
        </MarginSection>

        <MarginSection label="Image discipline">
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono)", color: "var(--ink-2)", margin: 0 }}>
            Pages downscale client-side to ≤1600px longest edge, JPEG, before
            the request leaves the browser. The image itself is never stored —
            only the transcription and the image&apos;s sha256 travel further.
          </p>
        </MarginSection>

        <MarginSection label="Provenance key">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-unit)" }}>
            <ProvenanceChip mode="live" />
            <ProvenanceChip mode="cached" collatedAt="HH:MM" />
            <ProvenanceChip mode="fixture" />
          </div>
        </MarginSection>

        <MarginSection label="Hand-off">
          {savedDocumentId ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "calc(var(--space-unit) * 0.75)" }}>
              <Link href={`/tracer?document=${encodeURIComponent(savedDocumentId)}`} style={tertiaryLink}>
                Anatomize in Tracer
              </Link>
              <Link href={`/network?document=${encodeURIComponent(savedDocumentId)}`} style={tertiaryLink}>
                Chart in Prosopon
              </Link>
            </div>
          ) : (
            <LacunaState compact note="Fix a transcription in the record to open a hand-off." />
          )}
        </MarginSection>
      </ApparatusMargin>
    </div>
  );
}

function formatHHMM(iso: string): string | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
