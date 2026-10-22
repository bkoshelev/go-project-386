import { Button, Checkbox, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { useMachine } from "@xstate/react";
import { useEffect, useRef } from "react";
import type { Weekday } from "../../api/generated";
import { DateAvailability } from "../manage-date-availability";
import { weeklyAvailabilityMachine } from "./model";

const dayNames: Record<Weekday, string> = {
  monday: "Понедельник",
  tuesday: "Вторник",
  wednesday: "Среда",
  thursday: "Четверг",
  friday: "Пятница",
  saturday: "Суббота",
  sunday: "Воскресенье",
};

export function Availability() {
  const [state, send] = useMachine(weeklyAvailabilityMachine);
  const formRef = useRef<HTMLFormElement>(null);
  const { week, timeZone, errors } = state.context;
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
          ? "Не удалось получить результат сохранения. Повторите сохранение."
          : "";
  useEffect(() => {
    if (Object.keys(errors).length > 0 && !saving) {
      formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
    }
  }, [errors, saving]);

  return (
    <Stack>
      <Title order={2}>Доступность</Title>
      {state.matches("loading") && <Text component="output">Загрузка доступности…</Text>}
      {state.matches("loadFailed") && (
        <Stack>
          <Text role="alert">Не удалось загрузить доступность</Text>
          <Button onClick={() => send({ type: "retryLoad" })}>Повторить</Button>
        </Stack>
      )}
      {week && (
        <Stack>
          {timeZone ? (
            <Text>Часовой пояс расписания: {timeZone}</Text>
          ) : zoneError ? (
            <Stack>
              <Text role="alert">{zoneError}</Text>
              <Button onClick={() => send({ type: "retryInitialization" })}>
                Повторить сохранение пояса
              </Button>
            </Stack>
          ) : (
            <Text component="output">Сохранение часового пояса…</Text>
          )}
          {week.days.every((day) => day.intervals.length === 0) && (
            <Text>Рабочие интервалы пока не заданы</Text>
          )}
          <Text>
            Часы и блокировки относятся к местным дням в поясе расписания. Окончание 24:00 — конец
            дня.
          </Text>
          <form
            ref={formRef}
            onSubmit={(event) => {
              event.preventDefault();
              send({ type: "saveRequested" });
            }}
            noValidate
          >
            <Stack>
              <fieldset className="event-fields" disabled={saving || !timeZone}>
                <Stack gap="lg">
                  {week.days.map((day, index) => (
                    <fieldset className="weekly-day" key={day.weekday}>
                      <legend>{dayNames[day.weekday]}</legend>
                      <Stack>
                        <Checkbox
                          label="День заблокирован"
                          checked={day.isBlocked}
                          onChange={(event) =>
                            send({
                              type: "dayBlocked",
                              dayIndex: index,
                              blocked: event.currentTarget.checked,
                            })
                          }
                        />
                        {day.intervals.map((interval, intervalIndex) => (
                          <Group align="start" grow className="weekly-interval" key={intervalIndex}>
                            <TextInput
                              classNames={{ input: "weekly-clock" }}
                              label={`Начало интервала ${intervalIndex + 1}`}
                              placeholder="09:00"
                              value={interval.start}
                              error={errors[`/days/${index}/intervals/${intervalIndex}/start`]}
                              onChange={(event) =>
                                send({
                                  type: "intervalChanged",
                                  dayIndex: index,
                                  intervalIndex,
                                  values: {
                                    start: event.currentTarget.value,
                                  },
                                })
                              }
                            />
                            <TextInput
                              classNames={{ input: "weekly-clock" }}
                              label={`Окончание интервала ${intervalIndex + 1}`}
                              placeholder="18:00"
                              value={interval.end}
                              error={errors[`/days/${index}/intervals/${intervalIndex}/end`]}
                              onChange={(event) =>
                                send({
                                  type: "intervalChanged",
                                  dayIndex: index,
                                  intervalIndex,
                                  values: { end: event.currentTarget.value },
                                })
                              }
                            />
                            <Button
                              variant="subtle"
                              aria-label={`Удалить интервал ${intervalIndex + 1}`}
                              onClick={() =>
                                send({ type: "intervalRemoved", dayIndex: index, intervalIndex })
                              }
                            >
                              Удалить
                            </Button>
                          </Group>
                        ))}
                        <Button
                          variant="light"
                          onClick={() => send({ type: "intervalAdded", dayIndex: index })}
                        >
                          Добавить интервал
                        </Button>
                      </Stack>
                    </fieldset>
                  ))}
                  <Button type="submit">Сохранить расписание</Button>
                </Stack>
              </fieldset>
              {saving && <Text component="output">Сохранение расписания…</Text>}
              {message &&
                (success ? (
                  <Text component="output">{message}</Text>
                ) : (
                  <Text role="alert">{message}</Text>
                ))}
            </Stack>
          </form>
        </Stack>
      )}
      {timeZone && <DateAvailability timeZone={timeZone} />}
    </Stack>
  );
}
