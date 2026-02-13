import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listSymptomBurdens, upsertSymptomBurden } from "../api/symptomBurden.api";

export function useSymptomBurdens() {
  return useQuery({
    queryKey: ["symptom_burden"],
    queryFn: listSymptomBurdens,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertSymptomBurden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ symptomKey, burdenLevel }: { symptomKey: string; burdenLevel: number }) =>
      upsertSymptomBurden(symptomKey, burdenLevel),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["symptom_burden"] });
    },
  });
}

/**
 * 4-level burden system:
 * 0 = neutral (default / no selection)
 * 1 = stört etwas
 * 2 = stört mittel
 * 3 = stört stark
 * 4 = schränkt mich am meisten ein
 */
export const BURDEN_WEIGHTS: Record<number, number> = {
  0: 1.0,
  1: 1.1,
  2: 1.2,
  3: 1.35,
  4: 1.5,
};

/** Get burden weight; null/undefined burden = neutral 1.0 */
export function getBurdenWeight(burdenLevel: number | null | undefined): number {
  if (burdenLevel === null || burdenLevel === undefined) return 1.0;
  return BURDEN_WEIGHTS[burdenLevel] ?? 1.0;
}

/** Burden level labels (DE) */
export const BURDEN_LABELS: Record<number, string> = {
  0: "",
  1: "stört etwas",
  2: "stört mittel",
  3: "stört stark",
  4: "schränkt mich am meisten ein",
};

/** All selectable burden steps */
export const BURDEN_STEPS = [1, 2, 3, 4] as const;

/** Fallback clinical order when user has no data */
export const BURDEN_SYMPTOM_FALLBACK_ORDER = [
  "Lichtempfindlichkeit",
  "Geräuschempfindlichkeit",
  "Übelkeit",
  "Geruchsempfindlichkeit",
  "Aura",
];
