import type { Recipe, PlannerConfig, PlanResult } from "../types";

function add(map: Map<string, number>, key: string, val: number) {
  map.set(key, (map.get(key) ?? 0) + val);
}

function outputAmountFor(item: string, r: Recipe): number {
  const out = r.outputs.find(o => o.item === item);
  if (!out) throw new Error(`Recipe ${r.slug} does not output: ${item}`);
  return out.amount;
}

function pickItemToExpand(demand: Map<string, number>, prodIndex: Map<string, Recipe[]>) {
  for (const [item, v] of demand.entries()) {
    if (v > 1e-12 && prodIndex.has(item)) return item;
  }
  return null;
}

/**
 * Netto-Bilanzierung:
 * demand[item] > 0 => Bedarf/min
 * demand[item] < 0 => Überschuss/min (Byproduct)
 */
export function buildPlan(
  targetItem: string,
  targetPerMin: number,
  recipes: Recipe[],
  cfg: PlannerConfig
): PlanResult {
  const prodIndex = new Map<string, Recipe[]>();
  for (const r of recipes) {
    for (const o of r.outputs) {
      const arr = prodIndex.get(o.item) ?? [];
      arr.push(r);
      prodIndex.set(o.item, arr);
    }
  }

  const demand = new Map<string, number>();
  demand.set(targetItem, targetPerMin);

  const machines = new Map<string, number>();
  const recipeRuns = new Map<string, number>();

  const MAX_STEPS = 25000;
  let steps = 0;

  while (steps++ < MAX_STEPS) {
    const item = pickItemToExpand(demand, prodIndex);
    if (!item) break;

    const needPerMin = demand.get(item)!;
    const candidates = prodIndex.get(item)!;

    const pinned = cfg.recipeChoice?.get(item);
    const r = (pinned && candidates.find(x => x.slug === pinned)) || candidates[0];

    const outAmt = outputAmountFor(item, r);
    const runsPerMin = needPerMin / outAmt;

    add(recipeRuns, r.slug, runsPerMin);

    const factorySpeed = cfg.factorySpeedMult;
    const machinesNeeded = (runsPerMin * r.crafting_s) / 60 / factorySpeed;
    add(machines, r.device, machinesNeeded);

    // Outputs reduzieren Bedarf (kann negativ werden => Überschuss)
    for (const o of r.outputs) add(demand, o.item, -runsPerMin * o.amount);

    // Inputs erhöhen Bedarf
    for (const i of r.inputs) add(demand, i.item, runsPerMin * i.amount);

    // Cleanup
    for (const [k, v] of demand.entries()) {
      if (Math.abs(v) < 1e-12) demand.delete(k);
    }
  }

  if (steps >= MAX_STEPS) {
    return { ok: false, error: "Max steps reached (Recipe loop / cycle?)", demand, machines, recipeRuns };
  }

  return { ok: true, demand, machines, recipeRuns };
}
