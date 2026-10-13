import { describe, expect, it } from "vitest";
import { allowanceForRun, isWithinActiveHours, jstCalendar } from "./quota";

describe("allowanceForRun（月間上限の日割り）", () => {
  it("月6,000件・31日残り・未使用 → 1日193件まで", () => {
    expect(
      allowanceForRun({ monthlyLimit: 6000, usedThisMonth: 0, usedToday: 0, daysLeft: 31 }),
    ).toBe(193);
  });
  it("今日すでに使った分は差し引く", () => {
    expect(
      allowanceForRun({ monthlyLimit: 6000, usedThisMonth: 150, usedToday: 150, daysLeft: 31 }),
    ).toBe(43);
  });
  it("前日までの使い残しは残り日数で配分し直す", () => {
    // 30日で 3,000 しか使っていない → 最終日は残り 3,000 を使える
    expect(
      allowanceForRun({ monthlyLimit: 6000, usedThisMonth: 3000, usedToday: 0, daysLeft: 1 }),
    ).toBe(3000);
  });
  it("月間上限に達したら0", () => {
    expect(
      allowanceForRun({ monthlyLimit: 6000, usedThisMonth: 6000, usedToday: 10, daysLeft: 5 }),
    ).toBe(0);
  });
});

describe("isWithinActiveHours", () => {
  it("レインズの提供時間 7:00〜23:00", () => {
    expect(isWithinActiveHours([7, 23], 6)).toBe(false);
    expect(isWithinActiveHours([7, 23], 7)).toBe(true);
    expect(isWithinActiveHours([7, 23], 22)).toBe(true);
    expect(isWithinActiveHours([7, 23], 23)).toBe(false);
    expect(isWithinActiveHours(undefined, 3)).toBe(true);
  });
});

describe("jstCalendar", () => {
  it("UTC 15:30 は JST の翌日 0:30", () => {
    const c = jstCalendar(new Date("2026-10-31T15:30:00Z"));
    expect(c).toMatchObject({
      today: "2026-11-01",
      hour: 0,
      monthStart: "2026-11-01",
      daysLeft: 30,
    });
  });
});
