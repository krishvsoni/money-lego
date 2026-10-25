"use client";

import { useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { nodeDefinition } from "@/lib/nodes/registry";
import { CATEGORY_META } from "@/lib/nodes/types";
import type { CredentialDTO, NodeRunDTO, WorkflowDTO } from "@/lib/workflow/dto";
import type { GraphIssue } from "@/lib/workflow/validate";
import { NodeIcon } from "../node-icon";
import { FieldInput } from "./field-input";
import { SetupChecklist } from "./setup-checklist";
import type { Editor } from "./use-workflow-editor";

function Json({ value }: { value: unknown }) {
  return <pre className="max-h-72 overflow-auto rounded-md bg-sunken p-2.5 font-mono text-[0.6875rem] leading-relaxed text-ink-2">{JSON.stringify(value ?? null, null, 2)}</pre>;
}

// How each inbound trigger's sender should call the endpoint.
const ENDPOINT_HELP: Record<string, string> = {
  "trigger.github": "In the repository: Settings, Webhooks, Add webhook. Paste this URL, content type application/json, the same secret, and pick Releases or Pull requests.",
  "trigger.stripe": "In Stripe: Developers, Webhooks, Add endpoint. Paste this URL and select invoice.paid, then save the signing secret as a credential.",
  "trigger.shopify": "In Shopify: Settings, Notifications, Webhooks, Create webhook. Event Order payment, format JSON, this URL.",
  "trigger.discord": "In the Developer Portal: your app, General Information, Interactions Endpoint URL. Discord checks it with a signed ping, which works while the workflow is off.",
};

function WebhookHelp({ workflow, type }: { workflow: WorkflowDTO; type: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? workflow.webhookPath : `${window.location.origin}${workflow.webhookPath}`;
  return (
    <div className="rounded-lg bg-sunken p-3 text-xs text-ink-2">
      <p className="font-semibold text-ink">Endpoint {workflow.enabled ? "" : "(turn the workflow on to accept events)"}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[0.6875rem]">{url}</code>
        <button
          className="press shrink-0 rounded px-1.5 py-0.5 hover:bg-surface"
          onClick={() => {
            navigator.clipboard.writeText(url).catch(() => null);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? "Copied" : <Copy className="h-3.5 w-3.5" aria-label="Copy URL" />}
        </button>
      </div>
      {ENDPOINT_HELP[type] ? (
        <p className="mt-2">{ENDPOINT_HELP[type]} Redeliveries of the same event never start a second run.</p>
      ) : (
        <p className="mt-2">POST JSON with header <code className="font-mono">x-money-lego-signature: sha256=&lt;HMAC of the raw body&gt;</code>. Add an <code className="font-mono">idempotency-key</code> header so retries never start a second run.</p>
      )}
    </div>
  );
}

export function Inspector({
  editor,
  credentials,
  onCredentialCreated,
  onRefreshCredentials,
  nodeRun,
}: {
  editor: Editor;
  credentials: CredentialDTO[];
  onCredentialCreated: (c: CredentialDTO) => void;
  onRefreshCredentials: () => Promise<CredentialDTO[]>;
  nodeRun: NodeRunDTO | null;
}) {
  const [tab, setTab] = useState<"settings" | "data">("settings");
  const node = editor.graph.nodes.find((n) => n.id === editor.selectedId);

  if (!node) {
    const general = editor.issues.filter((i) => !i.nodeId);
    return (
      <aside className="flex h-full w-[340px] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface p-5" aria-label="Inspector">
        <h2 className="text-sm font-bold">Workflow</h2>
        <p className="mt-1 text-sm text-ink-2">Select a node to configure it. Drag from a node&apos;s right edge to another node to connect them.</p>
        <SetupChecklist editor={editor} />
        {editor.issues.length > 0 ? (
          <div className="mt-5">
            <p className="text-sm font-semibold">{editor.issues.length} to fix before it can run</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {editor.issues.slice(0, 12).map((i: GraphIssue, k) => (
                <li key={k}>
                  <button
                    disabled={!i.nodeId}
                    onClick={() => i.nodeId && editor.setSelectedId(i.nodeId)}
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs text-ink-2 hover:bg-sunken disabled:hover:bg-transparent"
                  >
                    <span className="font-semibold text-danger">{i.nodeId ? editor.graph.nodes.find((n) => n.id === i.nodeId)?.label || nodeDefinition(editor.graph.nodes.find((n) => n.id === i.nodeId)?.type ?? "")?.title : "Workflow"}</span>{" "}
                    {i.message}
                  </button>
                </li>
              ))}
            </ul>
            {general.length === 0 && editor.issues.length > 12 && <p className="mt-1 text-xs text-ink-3">And {editor.issues.length - 12} more.</p>}
          </div>
        ) : (
          editor.graph.nodes.length > 0 && <p className="mt-5 text-sm text-success">Ready to run.</p>
        )}
      </aside>
    );
  }

  const def = nodeDefinition(node.type);
  const issues = editor.issues.filter((i) => i.nodeId === node.id);
  const byField = Object.fromEntries(issues.filter((i) => i.field).map((i) => [i.field!, i.message]));
  const color = def ? CATEGORY_META[def.category].color : "var(--ink-3)";
  const setConfig = (key: string, value: unknown) => editor.updateNode(node.id, { config: { ...node.config, [key]: value } });

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-line bg-surface" aria-label="Inspector">
      <header className="border-b border-line p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
            <NodeIcon name={def?.icon ?? "Hash"} className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <input
              aria-label="Node name"
              value={node.label ?? ""}
              placeholder={def?.title}
              onChange={(e) => editor.updateNode(node.id, { label: e.target.value || undefined })}
              maxLength={60}
              className="w-full rounded bg-transparent text-sm font-bold outline-none placeholder:text-ink focus:bg-sunken"
            />
            <p className="text-xs text-ink-3">{def?.title}</p>
          </div>
          <button onClick={() => editor.removeNodes([node.id])} className="press rounded-md p-1.5 text-ink-3 hover:bg-danger-wash hover:text-danger" aria-label="Delete node">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-2">{def?.description}</p>
        <div className="mt-3 flex gap-1 rounded-md bg-sunken p-0.5 text-xs font-semibold" role="tablist">
          {(["settings", "data"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 rounded px-2 py-1.5 ${tab === t ? "bg-surface text-ink shadow-sm" : "text-ink-2"}`}>
              {t === "settings" ? "Settings" : nodeRun ? "Last run data" : "Data"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "settings" ? (
          <div className="flex flex-col gap-4">
            {(node.type === "trigger.webhook" || ENDPOINT_HELP[node.type]) && <WebhookHelp workflow={editor.workflow} type={node.type} />}
            {def?.fields.map((f) => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <label htmlFor={f.key} className="flex items-center justify-between text-xs font-semibold">
                  <span>
                    {f.label}
                    {f.required && <span className="text-danger"> *</span>}
                  </span>
                  {f.expression && <span className="font-normal text-ink-3">{"{{ }}"} allowed</span>}
                </label>
                <FieldInput
                  field={f}
                  value={node.config[f.key]}
                  error={byField[f.key]}
                  rowErrors={byField}
                  credentials={credentials}
                  onChange={(v) => setConfig(f.key, v)}
                  onCredentialCreated={onCredentialCreated}
                  onRefreshCredentials={onRefreshCredentials}
                />
                {byField[f.key] ? <p className="text-xs text-danger">{byField[f.key]}</p> : f.help ? <p className="text-xs text-ink-3">{f.help}</p> : null}
              </div>
            ))}
            {def?.fields.length === 0 && <p className="text-sm text-ink-2">Nothing to configure. This node works from its input.</p>}
            {issues.filter((i) => !i.field || !def?.fields.some((f) => i.field === f.key || i.field!.startsWith(`${f.key}.`))).map((i, k) => (
              <p key={k} className="rounded-md bg-danger-wash px-2.5 py-2 text-xs text-danger">
                {i.message}
              </p>
            ))}
            <div className="border-t border-line pt-4">
              <p className="text-xs font-semibold">Output</p>
              <p className="mt-1 text-xs text-ink-2">{def?.outputHint}</p>
            </div>
            <label className="flex items-center justify-between text-xs">
              <span className="font-semibold">Skip this node</span>
              <input type="checkbox" checked={Boolean(node.disabled)} onChange={(e) => editor.updateNode(node.id, { disabled: e.target.checked || undefined })} className="h-4 w-4 accent-[var(--action)]" />
            </label>
          </div>
        ) : nodeRun ? (
          <div className="flex flex-col gap-3 text-xs">
            <p className="text-ink-2">
              {nodeRun.status} after {nodeRun.attempts} attempt{nodeRun.attempts === 1 ? "" : "s"}
              {nodeRun.port && nodeRun.port !== "main" ? `, took the ${nodeRun.port} branch` : ""}
            </p>
            {nodeRun.error && <p className="rounded-md bg-danger-wash px-2.5 py-2 text-danger">{nodeRun.error}</p>}
            <p className="font-semibold">Input</p>
            <Json value={nodeRun.input} />
            <p className="font-semibold">Output</p>
            <Json value={nodeRun.output} />
          </div>
        ) : (
          <div className="text-sm text-ink-2">
            <p>Run the workflow to see what this node receives and produces.</p>
            <p className="mt-3 text-xs">
              Reference earlier data in any field marked {"{{ }}"}: <code className={`${inputClass} mt-1 block h-auto py-1.5 font-mono text-[0.6875rem]`}>{"{{ input.amount }}  {{ trigger.body.event }}  {{ nodes.split.amountRaw }}"}</code>
            </p>
          </div>
        )}
      </div>
      {def?.unavailable && (
        <div className="border-t border-line p-4">
          <Button variant="secondary" className="w-full" disabled>
            {def.unavailable}
          </Button>
        </div>
      )}
    </aside>
  );
}
