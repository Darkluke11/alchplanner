import React, { useEffect, useMemo, useState } from "react";
import type { Recipe } from "./types";
import { buildPlan } from "./lib/planner";

const pctToMult = (p: number) => 1 + (Number.isFinite(p) ? p : 0) / 100;

function fmt(n: number) {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 100) return n.toFixed(2);
  if (Math.abs(n) >= 10) return n.toFixed(3);
  return n.toFixed(4);
}

export default function App() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [targetItem, setTargetItem] = useState("");
  const [mode, setMode] = useState<"rate" | "devices">("rate");
  const [targetValue, setTargetValue] = useState(2);

  const [factoryPct, setFactoryPct] = useState(0);
  const [fuelPct, setFuelPct] = useState(0);
  const [fertPct, setFertPct] = useState(0);

  // item -> chosen recipe slug (für Items mit mehreren Rezepten)
  const [recipeChoice, setRecipeChoice] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + "recipes.json")
      .then(r => r.json())
      .then((data: any[]) => {
        const clean = (data || [])
          .filter(x => x && !x.parse_error)
          .map((x) => ({
            name: String(x.name ?? x.slug),
            slug: String(x.slug),
            device: String(x.device ?? "unknown device"),
            crafting_s: Number(x.crafting_s),
            inputs: (x.inputs ?? []).map((i: any) => ({ item: String(i.item), amount: Number(i.amount) })),
            outputs: (x.outputs ?? []).map((o: any) => ({ item: String(o.item), amount: Number(o.amount) })),
            url: x.url ? String(x.url) : undefined,
          })) as Recipe[];

        setRecipes(clean);
      });
  }, []);

  const items = useMemo(() => {
    const s = new Set<string>();
    for (const r of recipes) {
      r.inputs.forEach(i => s.add(i.item));
      r.outputs.forEach(o => s.add(o.item));
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "de"));
  }, [recipes]);

  const recipesByOutputItem = useMemo(() => {
    const m = new Map<string, Recipe[]>();
    for (const r of recipes) {
      for (const o of r.outputs) {
        const arr = m.get(o.item) ?? [];
        arr.push(r);
        m.set(o.item, arr);
      }
    }
    return m;
  }, [recipes]);

  // Init from URL
  useEffect(() => {
    if (!items.length) return;

    const url = new URL(window.location.href);
    const item = url.searchParams.get("item");
    const modeParam = url.searchParams.get("mode");
    const targetParam = url.searchParams.get("target");

    setTargetItem(item && items.includes(item) ? item : items[0]);
    if (modeParam === "devices") setMode("devices");
    if (targetParam) setTargetValue(Number(targetParam));
  }, [items]);

  // Write URL
  useEffect(() => {
    if (!targetItem) return;
    const url = new URL(window.location.href);
    url.searchParams.set("item", targetItem);
    url.searchParams.set("mode", mode);
    url.searchParams.set("target", String(targetValue));
    window.history.replaceState({}, "", url.toString());
  }, [targetItem, mode, targetValue]);

  const plan = useMemo(() => {
    if (!targetItem || !recipes.length) return null;

    let targetPerMin = targetValue;

    if (mode === "devices") {
      const options = recipesByOutputItem.get(targetItem) ?? [];
      if (!options.length) return null;

      const pinned = recipeChoice.get(targetItem);
      const r = (pinned && options.find(x => x.slug === pinned)) || options[0];

      const outAmt = r.outputs.find(o => o.item === targetItem)!.amount;
      const factorySpeed = pctToMult(factoryPct);
      const runsPerMinPerDevice = (60 / r.crafting_s) * factorySpeed;

      targetPerMin = targetValue * runsPerMinPerDevice * outAmt;
    }

    return buildPlan(targetItem, targetPerMin, recipes, {
      factorySpeedMult: pctToMult(factoryPct),
      fuelValueMult: pctToMult(fuelPct),
      nutrientValueMult: pctToMult(fertPct),
      recipeChoice,
    });
  }, [targetItem, targetValue, mode, recipes, recipesByOutputItem, factoryPct, fuelPct, fertPct, recipeChoice]);

  const targetRecipeOptions = recipesByOutputItem.get(targetItem) ?? [];
  const chosenTargetRecipeSlug = recipeChoice.get(targetItem) ?? targetRecipeOptions[0]?.slug;

  return (
    <div style={{ fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,Arial", margin: 20, lineHeight: 1.3 }}>
      <h1>Alchemy Factory – Production Planner</h1>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6 }}>
            Target Item
            <select value={targetItem} onChange={(e) => setTargetItem(e.target.value)} style={{ padding: 8, minWidth: 260 }}>
              {items.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            Mode
            <select value={mode} onChange={(e) => setMode(e.target.value as any)} style={{ padding: 8 }}>
              <option value="rate">Units / min</option>
              <option value="devices">Number of Devices</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            Target
            <input type="number" min={0} step={0.01} value={targetValue} onChange={(e) => setTargetValue(Number(e.target.value))}
              style={{ padding: 8, width: 140 }} />
          </label>

          {targetRecipeOptions.length > 1 && (
            <label style={{ display: "grid", gap: 6 }}>
              Recipe (for {targetItem})
              <select
                value={chosenTargetRecipeSlug}
                onChange={(e) => {
                  const next = new Map(recipeChoice);
                  next.set(targetItem, e.target.value);
                  setRecipeChoice(next);
                }}
                style={{ padding: 8, minWidth: 320 }}
              >
                {targetRecipeOptions.map(r => (
                  <option key={r.slug} value={r.slug}>
                    {r.device} · {r.crafting_s}s · {r.slug}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            Factory Efficiency (+%)
            <input type="number" step={1} value={factoryPct} onChange={(e) => setFactoryPct(Number(e.target.value))}
              style={{ padding: 8, width: 160 }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            Fuel Efficiency (+%)
            <input type="number" step={1} value={fuelPct} onChange={(e) => setFuelPct(Number(e.target.value))}
              style={{ padding: 8, width: 160 }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            Fertilizer Efficiency (+%)
            <input type="number" step={1} value={fertPct} onChange={(e) => setFertPct(Number(e.target.value))}
              style={{ padding: 8, width: 180 }} />
          </label>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
          <h2>Machines</h2>
          {!plan ? <div>—</div> : !plan.ok ? <div>{plan.error}</div> : (
            <ul>
              {Array.from(plan.machines.entries()).sort((a, b) => b[1] - a[1]).map(([m, c]) => (
                <li key={m}><b>{m}</b>: {fmt(c)}</li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14 }}>
          <h2>Totals / min</h2>
          {!plan ? <div>—</div> : !plan.ok ? <div>{plan.error}</div> : (
            <>
              <h3>Need (Inputs / Rohstoffe)</h3>
              <ul>
                {Array.from(plan.demand.entries()).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([i, v]) => (
                  <li key={i}>{i}: {fmt(v)}</li>
                ))}
              </ul>

              <h3>Surplus (Byproducts)</h3>
              <ul>
                {Array.from(plan.demand.entries()).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).map(([i, v]) => (
                  <li key={i}>{i}: {fmt(-v)}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
