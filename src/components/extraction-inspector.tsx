"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, ArrowRight, RotateCcw } from "lucide-react";
import type { Plan, PlanDraft } from "@/lib/types";

type Inspection = {
  parser: "openai" | "examples";
  trace: { request: unknown; response: unknown; elapsedMs: number };
  changes: PlanDraft;
  draft: PlanDraft;
  missingFields: string[];
  planPreview: Omit<Plan, "id"> | null;
  validationError: string | null;
};
type Run = { text: string; submittedDraft: PlanDraft; result: Inspection };
function Json({ value, label }: { value: unknown; label: string }) {
  return (
    <pre className="inspection-json" aria-label={label} tabIndex={0}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

const examples = [
  "Mountain biking at Chickadee in 30 minutes for two hours, no kids",
  "Taking my five-year-old cross-country skiing tomorrow at 10am",
  "Going skiing tomorrow, everyone welcome",
];

export function ExtractionInspector({ personName }: { personName: string }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<PlanDraft>({});
  const [continueDraft, setContinueDraft] = useState(true);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = runs[selected];
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    setError("");
    const submittedText = text.trim();
    const submittedDraft = continueDraft ? draft : {};
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: submittedText, draft: submittedDraft }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Extraction failed. Please try again.");
      setRuns((previous) => [
        ...previous,
        { text: submittedText, submittedDraft, result },
      ]);
      setSelected(runs.length);
      setDraft(result.draft);
      setText("");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Extraction failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="extraction-inspector" aria-label="Extraction inspector">
      <div className="inspection-intro">
        <div>
          <h2>See how a text becomes a plan.</h2>
          <p>
            Testing as {personName}. Nothing here publishes a plan or sends a
            notification. Each AI run uses the API.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={busy || !runs.length}
          onClick={() => {
            setDraft({});
            setRuns([]);
            setSelected(0);
            setText("");
            setError("");
            setContinueDraft(true);
          }}
        >
          <RotateCcw size={15} /> Start over
        </button>
      </div>
      <form className="inspection-compose" onSubmit={submit}>
        <label htmlFor="inspection-text">Message to inspect</label>
        <textarea
          id="inspection-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          maxLength={1500}
          required
          placeholder="Describe an outing, or answer a missing-detail question…"
          disabled={busy}
        />
        <div className="inspection-controls">
          <label className="inspection-followup">
            <input
              type="checkbox"
              checked={continueDraft}
              onChange={(event) => setContinueDraft(event.target.checked)}
              disabled={busy || !runs.length}
            />{" "}
            Continue the latest draft
          </label>
          <button
            type="submit"
            className="button primary"
            disabled={busy || !text.trim()}
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <ArrowRight size={16} />
            )}
            {busy ? "Inspecting…" : "Inspect message"}
          </button>
        </div>
        <p className="field-note">
          Follow-ups use the latest successful draft, even when you are viewing
          an older run. Uncheck to test a separate plan.
        </p>
      </form>
      <div className="inspection-examples" aria-label="Inspection examples">
        {examples.map((example) => (
          <button
            type="button"
            key={example}
            disabled={busy}
            onClick={() => {
              setText(example);
              document.getElementById("inspection-text")?.focus();
            }}
          >
            {example}
          </button>
        ))}
        {runs.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setText("No kids");
              document.getElementById("inspection-text")?.focus();
            }}
          >
            No kids
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {runs.length > 0 && (
        <nav className="inspection-history" aria-label="Inspection runs">
          {runs.map((run, index) => (
            <button
              key={index}
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
            >
              {index + 1}. {run.text}
            </button>
          ))}
        </nav>
      )}
      {active ? (
        <>
          <p className="inspection-summary" role="status">
            {active.result.parser === "openai"
              ? "OpenAI"
              : "Offline example parser"}{" "}
            · {(active.result.trace.elapsedMs / 1000).toFixed(2)} seconds ·{" "}
            {active.result.missingFields.length
              ? `Missing: ${active.result.missingFields.join(", ")}`
              : active.result.validationError
                ? "Plan needs correction"
                : "Plan is complete, not published"}
          </p>
          <div className="inspection-grid">
            <article className="inspection-panel">
              <h3>1. Request</h3>
              <p>The message and draft sent by the simulator.</p>
              <Json
                label="Simulator request JSON"
                value={{ text: active.text, draft: active.submittedDraft }}
              />
              <details>
                <summary>
                  Full OpenAI request, including prompt and schema
                </summary>
                {active.result.trace.request ? (
                  <Json
                    label="OpenAI request JSON"
                    value={active.result.trace.request}
                  />
                ) : (
                  <p>
                    No OpenAI request. Configure an API key to use AI
                    extraction.
                  </p>
                )}
              </details>
            </article>
            <article className="inspection-panel">
              <h3>2. Response</h3>
              <p>
                The structured fields returned by the model, followed by the
                response output and usage.
              </p>
              {active.result.trace.response ? (
                <>
                  <Json
                    label="AI structured output JSON"
                    value={
                      (
                        active.result.trace.response as {
                          output_parsed?: unknown;
                        }
                      ).output_parsed
                    }
                  />
                  <details>
                    <summary>OpenAI response output and usage</summary>
                    <Json
                      label="OpenAI response JSON"
                      value={active.result.trace.response}
                    />
                  </details>
                </>
              ) : (
                <p>The example parser runs locally and has no AI response.</p>
              )}
              <details>
                <summary>Normalized changes from this message</summary>
                <Json
                  label="Normalized changes JSON"
                  value={active.result.changes}
                />
              </details>
            </article>
            <article className="inspection-panel inspection-plan">
              <h3>3. Our plan model</h3>
              <p>
                Non-null fields merge into the draft. Unspecified age groups
                default to adults. Follow-ups keep existing age groups. Times
                convert to UTC. A complete plan without an end time ends at
                local midnight. No plan ID is assigned here.
              </p>
              {active.result.validationError && (
                <p className="error">{active.result.validationError}</p>
              )}
              {active.result.missingFields.length > 0 && (
                <p className="inspection-missing">
                  Still needed: {active.result.missingFields.join(", ")}. Type a
                  follow-up above to complete this draft.
                </p>
              )}
              <Json
                label="Plan model JSON"
                value={active.result.planPreview || active.result.draft}
              />
              <details>
                <summary>Merged draft before plan validation</summary>
                <Json label="Merged draft JSON" value={active.result.draft} />
              </details>
            </article>
          </div>
        </>
      ) : (
        <div className="inspection-empty">
          <p>
            Enter a message or choose an example, then inspect it to see each
            step.
          </p>
        </div>
      )}
    </section>
  );
}
