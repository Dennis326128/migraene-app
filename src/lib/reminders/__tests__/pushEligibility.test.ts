import { describe, it, expect } from "vitest";
import {
  isReminderPushEligible,
  evaluateReminderPushEligibility,
} from "../pushEligibility";
import type { Reminder } from "@/types/reminder.types";

const NOW = new Date("2026-06-08T10:00:00Z");

const base = {
  notification_enabled: true,
  status: "pending" as Reminder["status"],
  date_time: "2026-06-09T08:00:00Z",
  repeat: "daily" as Reminder["repeat"],
};

describe("isReminderPushEligible", () => {
  it("eligible für klassische tägliche Erinnerung", () => {
    expect(isReminderPushEligible(base, NOW)).toBe(true);
  });

  it("nicht eligible wenn Nutzer Erinnerung aus hat", () => {
    expect(
      evaluateReminderPushEligibility({ ...base, notification_enabled: false }, NOW)
        .reason
    ).toBe("notifications_off");
  });

  it("nicht eligible wenn erledigt", () => {
    expect(
      evaluateReminderPushEligibility({ ...base, status: "done" }, NOW).reason
    ).toBe("status_closed");
  });

  it("nicht eligible bei kaputtem date_time", () => {
    expect(
      evaluateReminderPushEligibility({ ...base, date_time: "" }, NOW).reason
    ).toBe("invalid_datetime");
  });

  it("einmalig in Vergangenheit → nicht eligible", () => {
    expect(
      evaluateReminderPushEligibility(
        { ...base, repeat: "none", date_time: "2026-06-07T08:00:00Z" },
        NOW
      ).reason
    ).toBe("past_oneoff");
  });

  it("monatlich in Zukunft → eligible (Ajovy-Fall)", () => {
    expect(
      isReminderPushEligible(
        { ...base, repeat: "monthly", date_time: "2026-07-08T08:00:00Z" },
        NOW
      )
    ).toBe(true);
  });
});
