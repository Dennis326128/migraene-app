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
 * 3-state burden system:
 * 0 = neutral (default)
 * 1 = Belastend
 * 2 = Besonders belastend (max 3 allowed)
 */
export const BURDEN_WEIGHTS: Record<number, number> = {
  0: 1.0,
  1: 1.2,
  2: 1.5,
};

/** Get burden weight; null/undefined burden = neutral 1.0 */
export function getBurdenWeight(burdenLevel: number | null | undefined): number {
  if (burdenLevel === null || burdenLevel === undefined) return 1.0;
  return BURDEN_WEIGHTS[burdenLevel] ?? 1.0;
}

/** Burden level labels (DE) */
export const BURDEN_LABELS: Record<number, string> = {
  0: "Neutral",
  1: "Belastend",
  2: "Besonders belastend",
};

/** Max number of symptoms that can be "Besonders belastend" */
export const MAX_BESONDERS_BELASTEND = 3;

/** Clinical priority order for burden screen */
export const BURDEN_SYMPTOM_ORDER = [
  "Lichtempfindlichkeit",
  "Geräuschempfindlichkeit",
  "Übelkeit",
  "Geruchsempfindlichkeit",
  "Aura",
  "Wortfindungsstörung",
  "Konzentrationsstörung",
  "Gleichgewichtsstörung",
  "Doppelbilder",
];
