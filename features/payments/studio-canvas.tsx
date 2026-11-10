"use client";

import { useState } from "react";
import { createAiHarness, enableStudioDevValidations, type AgReportState, type AgStudioApi, type AgStudioMode } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { moneyLegoStudioAdapter, STUDIO_PROMPTS } from "./studio-ai";

// AG Studio through its official React component (ag-studio-react), as the AG Studio quick
// start sets it up: <AgStudioProvider licenseKey> around <AgStudio data mode … />. Loaded only
// in the browser (see studio-dashboard.tsx), so it can read the saved layout straight away.

if (process.env.NODE_ENV !== "production") enableStudioDevValidations();

const LICENSE_KEY = process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY || undefined;
// AG Studio's own dashboard agents, running on Money Lego's server-side model.
const ai = (params: { api: unknown }) => createAiHarness(params.api as AgStudioApi, { adapter: moneyLegoStudioAdapter, promptStarters: STUDIO_PROMPTS });

export interface StudioCanvasProps {
  data: unknown;
  mode: AgStudioMode;
  storageKey: string;
  defaultReport: () => AgReportState;
  onApi: (api: AgStudioApi | null) => void;
}

function readSaved(storageKey: string): AgReportState | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as AgReportState) : null;
  } catch {
    return null;
  }
}

export default function StudioCanvas({ data, mode, storageKey, defaultReport, onApi }: StudioCanvasProps) {
  // The saved layout if there is one; if Studio rejects it (an older version's layout), drop it
  // and remount once on the default report.
  const [start, setStart] = useState(() => {
    const saved = readSaved(storageKey);
    return { state: saved ?? defaultReport(), fromSaved: Boolean(saved), key: 0 };
  });

  return (
    <AgStudioProvider licenseKey={LICENSE_KEY}>
      <AgStudio
        key={start.key}
        style={{ height: "100%", width: "100%" }}
        data={data as never}
        mode={mode}
        initialState={start.state}
        // Explicit grid: without it the row height comes from a theme token that resolves to ~20px
        // here, which squashed every tile to a sliver.
        layout={{ columns: 12, rowHeight: 32 }}
        loadThemeGoogleFonts={false}
        ai={ai}
        onApiReady={(e) => onApi(e.api)}
        onStudioPreDestroyed={() => onApi(null)}
        onErrorRaised={(e) => {
          if (!start.fromSaved) return;
          console.warn("AG Studio: saved report rejected, starting from the default", e);
          try {
            window.localStorage.removeItem(storageKey);
          } catch {
            /* ignore */
          }
          setStart((s) => ({ state: defaultReport(), fromSaved: false, key: s.key + 1 }));
        }}
      />
    </AgStudioProvider>
  );
}
