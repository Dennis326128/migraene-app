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

/** Burden weight mapping for impact score calculation */
export const BURDEN_WEIGHTS: Record<number, number> = {
  0: 0.25,
  1: 0.5,
  2: 0.75,
  3: 1.0,
  4: 1.25,
};

/** Get burden weight; null/undefined burden = neutral 1.0 */
export function getBurdenWeight(burdenLevel: number | null | undefined): number {
  if (burdenLevel === null || burdenLevel === undefined) return 1.0;
  return BURDEN_WEIGHTS[burdenLevel] ?? 1.0;
}

/** Burden level labels (DE) */
export const BURDEN_LABELS: Record<number, string> = {
  0: "kaum störend",
  1: "störend",
  2: "stark belastend",
  3: "sehr belastend",
  4: "schlimmstes Symptom",
};
