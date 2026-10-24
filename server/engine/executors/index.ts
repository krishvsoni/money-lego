import "server-only";
import type { Executor } from "../types";
import { coreExecutors } from "./core";
import { integrationExecutors } from "./integrations";
import { moneyExecutors } from "./money";

// Connector packages add their executors here; the engine looks them up by node type.
const EXECUTORS: Record<string, Executor> = { ...coreExecutors, ...moneyExecutors, ...integrationExecutors };

export function executorFor(type: string): Executor | undefined {
  return EXECUTORS[type];
}
