export type IO = { item: string; amount: number };

export type Recipe = {
  name: string;
  slug: string;
  device: string;
  crafting_s: number;
  inputs: IO[];
  outputs: IO[];
  url?: string;
};

export type PlannerConfig = {
  factorySpeedMult: number;   // Production Speed
  fuelValueMult: number;      // Fuel Value
  nutrientValueMult: number;  // Nutrient Value
  recipeChoice?: Map<string, string>; // item -> recipeSlug
};

export type PlanResult =
  | {
      ok: true;
      demand: Map<string, number>;      // +need / -surplus (per min)
      machines: Map<string, number>;    // device -> count
      recipeRuns: Map<string, number>;  // recipeSlug -> runs/min
    }
  | {
      ok: false;
      error: string;
      demand: Map<string, number>;
      machines: Map<string, number>;
      recipeRuns: Map<string, number>;
    };
