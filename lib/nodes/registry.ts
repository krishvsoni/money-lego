import { aiNodes } from "./catalog/ai";
import { commerceNodes } from "./catalog/commerce";
import { connectorNodes } from "./catalog/connectors";
import { dataNodes } from "./catalog/data";
import { integrationNodes } from "./catalog/integrations";
import { logicNodes } from "./catalog/logic";
import { paypalNodes } from "./catalog/paypal";
import { providerTriggerNodes } from "./catalog/provider-triggers";
import { triggerNodes } from "./catalog/triggers";
import { utilityNodes } from "./catalog/utilities";
import type { Category, NodeDefinition } from "./types";

// Plugin packages register here. Order within a category is the catalog order.
const ALL: NodeDefinition[] = [
  ...providerTriggerNodes.slice(0, 2),
  ...triggerNodes,
  ...providerTriggerNodes.slice(2),
  ...logicNodes,
  ...dataNodes,
  ...paypalNodes,
  ...aiNodes,
  ...integrationNodes.slice(0, 1),
  ...commerceNodes,
  ...connectorNodes,
  ...integrationNodes.slice(1),
  ...utilityNodes,
];

const BY_TYPE = new Map(ALL.map((d) => [d.type, d]));

export function nodeDefinition(type: string): NodeDefinition | undefined {
  return BY_TYPE.get(type);
}

export function allNodeDefinitions(): NodeDefinition[] {
  return ALL;
}

export const CATEGORY_ORDER: Category[] = ["triggers", "paypal", "logic", "data", "ai", "integrations", "utilities"];

export function definitionsByCategory(): Array<{ category: Category; nodes: NodeDefinition[] }> {
  return CATEGORY_ORDER.map((category) => ({ category, nodes: ALL.filter((d) => d.category === category) }));
}

export function isTrigger(type: string): boolean {
  return BY_TYPE.get(type)?.category === "triggers";
}

export function isSideEffect(type: string): boolean {
  return BY_TYPE.get(type)?.sideEffect === true;
}
