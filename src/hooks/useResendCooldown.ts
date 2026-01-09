import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "resend_confirmation_cooldown";

interface CooldownState {
  attemptCount: number;
  lastAttemptAt: number;
  lockedUntil: number | null;
}

// Progressive Cooldowns (in Sekunden)
const COOLDOWN_SCHEDULE = [30, 60, 300]; // 30s, 60s, 5min
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 Minuten in ms

function getCooldownState(): CooldownState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return { attemptCount: 0, lastAttemptAt: 0, lockedUntil: null };
}

function saveCooldownState(state: CooldownState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function useResendCooldown() {
  const [state, setState] = useState<CooldownState>(getCooldownState);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  // Berechne verbleibende Zeit
  const calculateRemaining = useCallback(() => {
    const now = Date.now();
    const currentState = getCooldownState();

    // Prüfe Lockout
    if (currentState.lockedUntil && currentState.lockedUntil > now) {
      setIsLocked(true);
      setRemainingSeconds(Math.ceil((currentState.lockedUntil - now) / 1000));
      return;
    } else if (currentState.lockedUntil && currentState.lockedUntil <= now) {
      // Lockout abgelaufen - Reset
      const resetState: CooldownState = { attemptCount: 0, lastAttemptAt: 0, lockedUntil: null };
      saveCooldownState(resetState);
      setState(resetState);
      setIsLocked(false);
      setRemainingSeconds(0);
      return;
    }

    setIsLocked(false);

    // Berechne Cooldown basierend auf Attempts
    if (currentState.attemptCount === 0 || currentState.lastAttemptAt === 0) {
      setRemainingSeconds(0);
      return;
    }

    const cooldownIndex = Math.min(currentState.attemptCount - 1, COOLDOWN_SCHEDULE.length - 1);
    const cooldownDuration = COOLDOWN_SCHEDULE[cooldownIndex] * 1000;
    const cooldownEndsAt = currentState.lastAttemptAt + cooldownDuration;

    if (now < cooldownEndsAt) {
      setRemainingSeconds(Math.ceil((cooldownEndsAt - now) / 1000));
    } else {
      setRemainingSeconds(0);
    }
  }, []);

  // Timer für Countdown
  useEffect(() => {
    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);
    return () => clearInterval(interval);
  }, [calculateRemaining]);

  // Registriere einen Resend-Versuch
  const recordAttempt = useCallback(() => {
    const now = Date.now();
    const currentState = getCooldownState();
    
    const newAttemptCount = currentState.attemptCount + 1;
    
    // Nach 3 Versuchen = Lockout
    const newLockedUntil = newAttemptCount >= COOLDOWN_SCHEDULE.length + 1
      ? now + LOCKOUT_DURATION
      : null;

    const newState: CooldownState = {
      attemptCount: newAttemptCount,
      lastAttemptAt: now,
      lockedUntil: newLockedUntil,
    };

    saveCooldownState(newState);
    setState(newState);
    calculateRemaining();
  }, [calculateRemaining]);

  // Reset nach erfolgreicher Verifizierung
  const resetCooldown = useCallback(() => {
    const resetState: CooldownState = { attemptCount: 0, lastAttemptAt: 0, lockedUntil: null };
    saveCooldownState(resetState);
    setState(resetState);
    setRemainingSeconds(0);
    setIsLocked(false);
  }, []);

  // Formatiere Zeit für Anzeige
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    }
    return `0:${secs.toString().padStart(2, "0")}`;
  };

  return {
    canResend: remainingSeconds === 0 && !isLocked,
    remainingSeconds,
    formattedTime: formatTime(remainingSeconds),
    isLocked,
    attemptCount: state.attemptCount,
    recordAttempt,
    resetCooldown,
  };
}
