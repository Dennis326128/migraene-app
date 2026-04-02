/**
 * Doctor Share Hooks
 * React Query hooks for the "Per Code teilen" feature
 *
 * Logik: is_active + expires_at
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  getDoctorShareStatus,
  activateDoctorShare,
  deactivateDoctorShare,
} from "../api/doctorShare.api";
import type { DoctorShareStatus } from "../api/types";

const QUERY_KEY = ["doctor-share-status"];

/**
 * Haupthook: Holt den Status des Arzt-Codes (inkl. Freigabe-Status).
 *
 * Robustheit:
 * - refetchOnWindowFocus ensures fresh data when user returns to app
 * - Client-side expiry timer auto-invalidates cache when 24h window ends
 * - staleTime reduced to 10s to minimize stale "active" states
 */
export function useDoctorShareStatus() {
  const queryClient = useQueryClient();
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getDoctorShareStatus,
    staleTime: 1000 * 10,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Client-side expiry timer: when share is active with expires_at,
  // schedule a cache invalidation so the switch flips automatically.
  useEffect(() => {
    // Clear any existing timer
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }

    const data = query.data;
    if (!data?.is_currently_active || !data.expires_at) return;

    const expiresMs = new Date(data.expires_at).getTime();
    const nowMs = Date.now();
    const remainingMs = expiresMs - nowMs;

    if (remainingMs <= 0) {
      // Already expired — refetch immediately to correct UI
      console.log('[DoctorShare] Share already expired, refetching status');
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      return;
    }

    // Schedule refetch at expiry time (+ 1s buffer for clock skew)
    const timerMs = Math.min(remainingMs + 1000, 2_147_483_647); // max setTimeout value
    console.log(`[DoctorShare] Expiry timer set: ${Math.round(remainingMs / 60000)}min remaining`);

    expiryTimerRef.current = setTimeout(() => {
      console.log('[DoctorShare] Share expired (timer fired), refetching status');
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    }, timerMs);

    return () => {
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }
    };
  }, [query.data?.is_currently_active, query.data?.expires_at, queryClient]);

  return query;
}

/**
 * Aktiviert die Freigabe (Default 24h)
 */
export function useActivateDoctorShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => activateDoctorShare(),
    onSuccess: (result) => {
      // Immediately update cache with server response to avoid stale state
      queryClient.setQueryData(QUERY_KEY, (old: DoctorShareStatus | null | undefined) => {
        if (!old) return old;
        return {
          ...old,
          is_active: result.is_active,
          expires_at: result.expires_at,
          is_currently_active: result.is_currently_active,
          is_share_active: result.is_share_active,
          share_active_until: result.share_active_until,
          share_revoked_at: result.share_revoked_at,
          was_revoked_today: false,
        };
      });
      // Also background-refetch to ensure full consistency
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/**
 * Beendet die Freigabe sofort (Toggle OFF)
 */
export function useDeactivateDoctorShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deactivateDoctorShare,
    onSuccess: (result) => {
      // Immediately update cache with server response
      queryClient.setQueryData(QUERY_KEY, (old: DoctorShareStatus | null | undefined) => {
        if (!old) return old;
        return {
          ...old,
          is_active: false,
          is_currently_active: false,
          is_share_active: false,
          share_active_until: result.share_active_until,
          share_revoked_at: result.share_revoked_at,
          was_revoked_today: true,
        };
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

// Legacy alias
export const useRevokeDoctorShare = useDeactivateDoctorShare;

// Legacy-Hooks für Kompatibilität
export function usePermanentDoctorCode() {
  return useDoctorShareStatus();
}

export function useDoctorShares() {
  return useDoctorShareStatus();
}

export function useActiveDoctorShares() {
  return useDoctorShareStatus();
}

export function useCreateDoctorShare() {
  return useActivateDoctorShare();
}

// Re-export types
export type { DoctorShareStatus };
export type DoctorShare = DoctorShareStatus;
