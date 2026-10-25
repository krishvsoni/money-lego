"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { api, errorMessage, newRequestKey } from "@/lib/api-client";
import type { WorkflowDTO } from "@/lib/workflow/dto";

// Imports a template into a new workflow and opens it in the editor. One request key per
// template per page visit: a double click or a retried request lands on the same workflow.
export function useTemplateImport() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());

  const importTemplate = async (slug: string) => {
    if (busy) return;
    setBusy(slug);
    const requestKey = keys.current.get(slug) ?? newRequestKey();
    keys.current.set(slug, requestKey);
    try {
      const { workflow } = await api<{ workflow: WorkflowDTO }>("/api/workflows", { body: { templateSlug: slug, requestKey } });
      router.push(`/workflows/${workflow.id}?setup=1`);
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(null);
    }
  };

  return { busy, importTemplate };
}
