import { Text, Title } from "@mantine/core";
import type { WeeklyAvailability } from "../../api/generated";
import { dayNames, shortDayNames, projectWeek } from "./projection";

type Props = {
  week: WeeklyAvailability;
  selectedDay: number;
  disabled: boolean;
  dirty: boolean;
  timeZone?: string;
  onSelect: (index: number) => void;
};
export function WeekGrid({ week, selectedDay, disabled, dirty, timeZone, onSelect }: Props) {
  const { rows } = projectWeek(week);
  return (
    <section className="availability-panel availability-grid" aria-labelledby="week-title">
      <div className="availability-panel-heading">
        <Title order={2} id="week-title">
          Обычная неделя
        </Title>
        <Text c="dimmed" size="sm">
          Выберите день, чтобы изменить рабочие интервалы
        </Text>
        {dirty && (
          <Text size="sm" className="availability-dirty">
            Изменения не сохранены
          </Text>
        )}
      </div>
      <div className="availability-grid-body">
        <div className="availability-scale" aria-hidden="true">
          <div className="availability-scale-desktop">
            {[0, 4, 8, 12, 16, 20, 24].map((hour) => (
              <span key={hour}>{String(hour).padStart(2, "0")}:00</span>
            ))}
          </div>
          <div className="availability-scale-mobile">
            {[0, 6, 12, 18, 24].map((hour) => (
              <span key={hour}>{String(hour).padStart(2, "0")}</span>
            ))}
          </div>
        </div>
        {week.days.map((day, index) => {
          const row = rows[index];
          const label = row.invalid
            ? "Проверьте интервалы"
            : day.isBlocked
              ? "День заблокирован"
              : day.intervals.length === 0
                ? "Нет рабочих часов"
                : "Рабочие часы";
          const intervals = day.intervals.map(({ start, end }) => `${start}–${end}`).join(", ");
          return (
            <button
              key={day.weekday}
              type="button"
              className="availability-day"
              aria-pressed={selectedDay === index}
              aria-label={`${dayNames[day.weekday]}. ${label}${intervals ? `. ${intervals}` : ""}`}
              disabled={disabled}
              onClick={() => onSelect(index)}
            >
              <span className="availability-day-name">
                {shortDayNames[index]}
                {selectedDay === index && (
                  <span className="availability-selected" aria-hidden="true">
                    {" "}
                    •
                  </span>
                )}
              </span>
              <span
                className={`availability-track${day.isBlocked ? " availability-track-blocked" : ""}`}
              >
                {row.invalid || day.isBlocked || !day.intervals.length ? (
                  <span className="availability-row-label">{label}</span>
                ) : (
                  row.blocks.map((block, i) => (
                    <span
                      key={i}
                      className="availability-time-block"
                      style={{ left: `${block.left}%`, width: `${block.width}%` }}
                      aria-hidden="true"
                    >
                      <span>
                        {block.start}–{block.end}
                      </span>
                    </span>
                  ))
                )}
              </span>
            </button>
          );
        })}
        <div className="availability-grid-caption">
          <span>Время в {timeZone || "поясе расписания"}</span>
          <span>Блокировки выделены штриховкой</span>
        </div>
      </div>
    </section>
  );
}
