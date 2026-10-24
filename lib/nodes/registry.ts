import { dataNodes } from "./catalog/data";
import { integrationNodes } from "./catalog/integrations";
import { logicNodes } from "./catalog/logic";
import { moneyNodes } from "./catalog/money";
import { triggerNodes } from "./catalog/triggers";
import { utilityNodes } from "./catalog/utilities";
import type { Category, NodeDefinition } from "./types";

// Plugin packages register here. Order within a category is the catalog order.
const ALL: NodeDefinition[] = [...triggerNodes, ...logicNodes, ...dataNodes, ...moneyNodes, ...integrationNodes, ...utilityNodes];

const BY_TYPE = new Map(ALL.map((d) => [d.type, d]));

export function nodeDefinition(type: string): NodeDefinition | undefined {
  return BY_TYPE.get(type);
}

export function allNodeDefinitions(): NodeDefinition[] {
  return ALL;
}

export function definitionsByCategory(): Array<{ category: Category; nodes: NodeDefinition[] }> {
  const order: Category[] = ["triggers", "logic", "data", "money", "integrations", "utilities"];
  return order.map((category) => ({ category, nodes: ALL.filter((d) => d.category === category) }));
}

export function isTrigger(type: string): boolean {
  return BY_TYPE.get(type)?.category === "triggers";
}
