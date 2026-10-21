import { Button, Checkbox, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  getSchedulingSettings,
  getWeeklyAvailability,
  initializeScheduleTimeZone,
  updateWeeklyAvailability,
  type AvailabilityTimeRange,
  type Weekday,
  type WeeklyAvailability,
} from "./api/generated";
import { validateWeek } from "./availability-validation";
import { useRead } from "./catalog";

const dayNames: Record<Weekday, string> = {
  monday: "Понедельник",
  tuesday: "Вторник",
  wednesday: "Среда",
  thursday: "Четверг",
  friday: "Пятница",
  saturday: "Суббота",
  sunday: "Воскресенье",
};

const readAvailability = async (signal: AbortSignal) => {
  const [settings, week] = await Promise.all([
    getSchedulingSettings({ signal, throwOnError: true }),
    getWeeklyAvailability({ signal, throwOnError: true }),
  ]);
  return { settings: settings.data, week: week.data };
};

export function Availability() {
  const { state, reload } = useRead(readAvailability);
  return (
    <Stack>
      <Title order={2}>Доступность</Title>
      {state.status === "loading" && <Text component="output">Загрузка доступности…</Text>}
      {state.status === "error" && (
        <Stack>
          <Text role="alert">Не удалось загрузить доступность</Text>
          <Button onClick={reload}>Повторить</Button>
        </Stack>
      )}
      {state.status === "ready" && (
        <WeeklyEditor
          initialWeek={state.data.week}
          initialTimeZone={state.data.settings.timeZone}
        />
      )}
    </Stack>
  );
}

function WeeklyEditor({
  initialWeek,
  initialTimeZone,
}: {
  initialWeek: WeeklyAvailability;
  initialTimeZone?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [week, setWeek] = useState(initialWeek);
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [zoneAttempt, setZoneAttempt] = useState(0);
  const [zoneError, setZoneError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialTimeZone) return;
    let active = true;
    setZoneError("");
    const initialize = async () => {
      let detected: string;
      try {
        detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!detected) throw new Error("No browser time zone");
      } catch {
        if (active) setZoneError("Не удалось определить часовой пояс браузера");
        return;
      }
      try {
        const result = await initializeScheduleTimeZone({
          body: { timeZone: detected },
          throwOnError: true,
        });
        if (active) setTimeZone(result.data.timeZone);
      } catch {
        if (active) setZoneError("Не удалось сохранить часовой пояс расписания");
      }
    };
    initialize().catch(() => {
      if (active) setZoneError("Не удалось сохранить часовой пояс расписания");
    });
    return () => {
      active = false;
    };
  }, [initialTimeZone, zoneAttempt]);

  useEffect(() => {
    if (Object.keys(errors).length > 0 && !saving) {
      formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
    }
  }, [errors, saving]);

  const changeDay = (index: number, update: Partial<WeeklyAvailability["days"][number]>) => {
    setWeek((current) => ({
      days: current.days.map((day, i) =>
        i === index ? { ...day, ...update } : day,
      ) as WeeklyAvailability["days"],
    }));
    setMessage("");
    setErrors({});
  };

  const changeInterval = (
    dayIndex: number,
    intervalIndex: number,
    update: Partial<AvailabilityTimeRange>,
  ) => {
    changeDay(dayIndex, {
      intervals: week.days[dayIndex].intervals.map((interval, index) =>
        index === intervalIndex ? { ...interval, ...update } : interval,
      ),
    });
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setSuccess(false);
    const validation = validateWeek(week);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      setMessage("Проверьте интервалы расписания");
      return;
    }
    setSaving(true);
    try {
      const result = await updateWeeklyAvailability({ body: week });
      if (!result.response || (result.error && result.response.ok)) {
        setMessage("Не удалось получить результат сохранения. Повторите сохранение.");
        return;
      }
      if (result.error) {
        if (result.error.code === "validation_error") {
          setErrors(
            Object.fromEntries(result.error.fields.map((issue) => [issue.field, issue.message])),
          );
          setMessage("Проверьте интервалы расписания");
        } else {
          setMessage("Не удалось сохранить расписание. Повторите сохранение.");
        }
        return;
      }
      setWeek(result.data);
      setSuccess(true);
      setMessage("Расписание сохранено");
    } catch {
      setMessage("Не удалось получить результат сохранения. Повторите сохранение.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      {timeZone ? (
        <Text>Часовой пояс расписания: {timeZone}</Text>
      ) : zoneError ? (
        <Stack>
          <Text role="alert">{zoneError}</Text>
          <Button onClick={() => setZoneAttempt((value) => value + 1)}>
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
        Часы и блокировки относятся к местным дням в поясе расписания. Окончание 24:00 — конец дня.
      </Text>
      <form
        ref={formRef}
        onSubmit={(event) => {
          save(event).catch(() =>
            setMessage("Не удалось получить результат сохранения. Повторите сохранение."),
          );
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
                        changeDay(index, { isBlocked: event.currentTarget.checked })
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
                            changeInterval(index, intervalIndex, {
                              start: event.currentTarget.value,
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
                            changeInterval(index, intervalIndex, { end: event.currentTarget.value })
                          }
                        />
                        <Button
                          variant="subtle"
                          aria-label={`Удалить интервал ${intervalIndex + 1}`}
                          onClick={() =>
                            changeDay(index, {
                              intervals: day.intervals.filter((_, i) => i !== intervalIndex),
                            })
                          }
                        >
                          Удалить
                        </Button>
                      </Group>
                    ))}
                    <Button
                      variant="light"
                      onClick={() =>
                        changeDay(index, { intervals: [...day.intervals, { start: "", end: "" }] })
                      }
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
  );
}
