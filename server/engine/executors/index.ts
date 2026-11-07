import "server-only";
import type { Executor } from "../types";
import { aiExecutors } from "./ai";
import { connectorExecutors } from "./connectors";
import { coreExecutors } from "./core";
import { integrationExecutors } from "./integrations";
import { onceExecutors } from "./once";
import { paypalExecutors } from "./paypal";

// Connector packages add their executors here; the engine looks them up by node type.
const EXECUTORS: Record<string, Executor> = { ...coreExecutors, ...onceExecutors, ...paypalExecutors, ...aiExecutors, ...integrationExecutors, ...connectorExecutors };

export function executorFor(type: string): Executor | undefined {
  return EXECUTORS[type];
}
