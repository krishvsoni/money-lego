import "server-only";
import type { Executor } from "../types";
import { connectorExecutors } from "./connectors";
import { coreExecutors } from "./core";
import { integrationExecutors } from "./integrations";
import { moneyExecutors } from "./money";
import { payoutExecutors } from "./payout";

// Connector packages add their executors here; the engine looks them up by node type.
const EXECUTORS: Record<string, Executor> = { ...coreExecutors, ...payoutExecutors, ...moneyExecutors, ...integrationExecutors, ...connectorExecutors };

export function executorFor(type: string): Executor | undefined {
  return EXECUTORS[type];
}
