import { expect, test } from "@playwright/test";
import type { WeeklyAvailability, Weekday } from "../src/api/generated";
import { projectWeek } from "../src/features/manage-weekly-availability/projection";

const weekdays: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
function emptyWeek(): WeeklyAvailability {
  return {
    days: weekdays.map((weekday) => ({
      weekday,
      isBlocked: false,
      intervals: [],
    })) as unknown as WeeklyAvailability["days"],
  };
}

test("обычная неделя показывает 39 часов и пять рабочих дней, учитывая минуты и блокировки", () => {
  const week = emptyWeek();
  for (const day of week.days.slice(0, 5))
    day.intervals = [
      { start: "09:00", end: "13:00" },
      { start: "14:00", end: day.weekday === "friday" ? "17:00" : "18:00" },
    ];
  expect(projectWeek(week).summary).toEqual({ minutes: 2340, days: 5, duration: "39 ч" });
  week.days[4].intervals[1].end = "17:30";
  expect(projectWeek(week).summary?.duration).toBe("39 ч 30 мин");
  week.days[4].isBlocked = true;
  expect(projectWeek(week).summary).toEqual({ minutes: 1920, days: 4, duration: "32 ч" });
  expect(projectWeek(emptyWeek()).summary).toEqual({ minutes: 0, days: 0, duration: "0 ч" });
});

test("шкала содержит границы суток и касающиеся минуты без растягивания блоков", () => {
  const week = emptyWeek();
  week.days[0].intervals = [
    { start: "00:00", end: "01:00" },
    { start: "01:00", end: "01:01" },
    { start: "23:30", end: "24:00" },
  ];
  const blocks = projectWeek(week).rows[0].blocks;
  expect(blocks[0].left).toBe(0);
  expect(blocks[0].width).toBeCloseTo(4.1666667);
  expect(blocks[1].left).toBeCloseTo(100 / 24);
  expect(blocks[1].width).toBeCloseTo(100 / 1440);
  expect(blocks[2].left + blocks[2].width).toBeCloseTo(100);
  week.days[0].isBlocked = true;
  expect(projectWeek(week).rows[0].blocks).toEqual([]);
});

test("невалидные интервалы не становятся часами или блоками на сетке", () => {
  for (const intervals of [
    [{ start: "", end: "" }],
    [{ start: "24:00", end: "24:01" }],
    [{ start: "13:00", end: "12:00" }],
    [
      { start: "09:00", end: "18:00" },
      { start: "12:00", end: "13:00" },
    ],
  ]) {
    const week = emptyWeek();
    week.days[0].intervals = intervals;
    expect(projectWeek(week).summary).toBeNull();
    expect(projectWeek(week).rows[0]).toMatchObject({ invalid: true, blocks: [] });
  }
});
