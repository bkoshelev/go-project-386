import { Button, Checkbox, Stack, Text, Title } from "@mantine/core";
import { useMachine } from "@xstate/react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { WeeklyAvailability } from "../../api/generated";
import { IntervalEditor } from "../../shared/availability/IntervalEditor";
import { weeklyAvailabilityMachine } from "./model";
import { dayNames, projectWeek } from "./projection";
import { WeekGrid } from "./WeekGrid";

export type ConfirmedSchedule = {
  timeZone: string;
  week: WeeklyAvailability;
  dirty: boolean;
  outcomeUnknown: boolean;
};

export function Availability({
  onScheduleChange,
  children,
}: {
  onScheduleChange: (schedule: ConfirmedSchedule) => void;
  children?: ReactNode;
}) {
  const [state, send] = useMachine(weeklyAvailabilityMachine);
  const formRef = useRef<HTMLFormElement>(null);
  const { week, confirmedWeek, selectedDay, timeZone, errors, outcomeUnknown } = state.context;
  const dirty = Boolean(
    week && confirmedWeek && JSON.stringify(week) !== JSON.stringify(confirmedWeek),
  );
  useEffect(() => {
    if (timeZone && confirmedWeek)
      onScheduleChange({ timeZone, week: confirmedWeek, dirty, outcomeUnknown });
  }, [timeZone, confirmedWeek, dirty, outcomeUnknown, onScheduleChange]);
  const saving = state.matches("saving");
  const success = state.matches({ editable: "saved" });
  const zoneError = state.matches("detectionFailed")
    ? "Не удалось определить часовой пояс браузера"
    : state.matches("initializationRejected") || state.matches("initializationUnknown")
      ? "Не удалось сохранить часовой пояс расписания"
      : "";
  const message = success
    ? "Расписание сохранено"
    : Object.keys(errors).length > 0
      ? "Проверьте интервалы расписания"
      : state.matches({ editable: "rejected" })
        ? "Не удалось сохранить расписание. Повторите сохранение."
        : state.matches({ editable: "unknown" })
          ? "Не удалось получить результат сохранения. Результат неизвестен. Повторите сохранение вручную."
          : "";
  useEffect(() => {
    if (Object.keys(errors).length > 0 && !saving)
      formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  }, [errors, saving]);
  const day = week?.days[selectedDay];
  const summary = week ? projectWeek(week).summary : null;
  return (
    <Stack gap="xl">
      <div className="availability-intro">
        <div>
          <Title order={2} className="availability-title">
            Время для встреч
          </Title>
          <Text c="dimmed">Настройте часы, в которые гости могут назначать встречи.</Text>
        </div>
        {timeZone && <Text className="availability-zone">Часовой пояс расписания: {timeZone}</Text>}
      </div>
      {children}
      {state.matches("loading") && <Text component="output">Загрузка доступности…</Text>}
      {state.matches("loadFailed") && (
        <Stack>
          <Text role="alert">Не удалось загрузить доступность</Text>
          <Button onClick={() => send({ type: "retryLoad" })}>Повторить</Button>
        </Stack>
      )}
      {week && day && (
        <>
          {!timeZone &&
            (zoneError ? (
              <Stack>
                <Text role="alert">{zoneError}</Text>
                <Button onClick={() => send({ type: "retryInitialization" })}>
                  Повторить сохранение пояса
                </Button>
              </Stack>
            ) : (
              <Text component="output">Сохранение часового пояса…</Text>
            ))}
          <div className="availability-summary" aria-label="Рабочие часы обычной недели">
            <div>
              <Text className="availability-summary-number">{summary?.duration ?? "—"}</Text>
              <Text size="sm" c="dimmed">
                Рабочие часы обычной недели
              </Text>
            </div>
            <div>
              <Text className="availability-summary-number">
                {summary ? `${summary.days} дн.` : "—"}
              </Text>
              <Text size="sm" c="dimmed">
                Дней с рабочими часами
              </Text>
            </div>
            {!summary && <Text size="sm">Проверьте интервалы, чтобы рассчитать рабочие часы</Text>}
          </div>
          {week.days.every((item) => item.intervals.length === 0) && (
            <Text size="sm">Рабочие интервалы пока не заданы</Text>
          )}
          <div className="availability-week-layout">
            <WeekGrid
              week={week}
              selectedDay={selectedDay}
              disabled={saving || !timeZone}
              dirty={dirty}
              timeZone={timeZone}
              onSelect={(dayIndex) => send({ type: "daySelected", dayIndex })}
            />
            <form
              className="availability-panel availability-editor"
              ref={formRef}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                send({ type: "saveRequested" });
              }}
            >
              <fieldset className="event-fields" disabled={saving || !timeZone}>
                <div className="availability-panel-heading">
                  <Text size="xs" c="green.8">
                    Рабочие часы
                  </Text>
                  <Title order={3} id="selected-day-title" aria-live="polite">
                    {dayNames[day.weekday]}
                  </Title>
                  <Text size="sm" c="dimmed">
                    Повторяется каждую неделю
                  </Text>
                </div>
                <Stack
                  component="fieldset"
                  className="event-fields availability-editor-body"
                  gap="lg"
                  aria-labelledby="selected-day-title"
                >
                  <Checkbox
                    label="День заблокирован"
                    checked={day.isBlocked}
                    onChange={(event) =>
                      send({
                        type: "dayBlocked",
                        dayIndex: selectedDay,
                        blocked: event.currentTarget.checked,
                      })
                    }
                  />
                  {day.isBlocked && (
                    <Text size="sm" c="dimmed">
                      Часы сохранены, но день закрыт
                    </Text>
                  )}
                  <IntervalEditor
                    intervals={day.intervals}
                    errors={errors}
                    prefix={`/days/${selectedDay}/intervals`}
                    onAdd={() => send({ type: "intervalAdded", dayIndex: selectedDay })}
                    onRemove={(intervalIndex) =>
                      send({ type: "intervalRemoved", dayIndex: selectedDay, intervalIndex })
                    }
                    onChange={(intervalIndex, values) =>
                      send({
                        type: "intervalChanged",
                        dayIndex: selectedDay,
                        intervalIndex,
                        values,
                      })
                    }
                  />
                  <Text size="sm" c="dimmed">
                    Промежутки между интервалами остаются недоступными для встреч. Окончание 24:00 —
                    конец дня.
                  </Text>
                  <Button type="submit">Сохранить расписание</Button>
                </Stack>
              </fieldset>
              <div className="availability-result">
                {saving && <Text component="output">Сохранение расписания…</Text>}
                {message && (
                  <Text component={success ? "output" : "p"} role={success ? undefined : "alert"}>
                    {message}
                  </Text>
                )}
              </div>
            </form>
          </div>
        </>
      )}
    </Stack>
  );
}
