import { Button, NativeSelect, Stack, Text, TextInput, Title } from "@mantine/core";
import { useMachine } from "@xstate/react";
import { useEffect, useRef } from "react";
import type { WeeklyAvailability } from "../../api/generated";
import { IntervalEditor } from "../../shared/availability/IntervalEditor";
import { dateAvailabilityMachine } from "./model";

function localDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((key) => parts.find((part) => part.type === key)?.value)
    .join("-");
}

type Props = {
  timeZone: string;
  confirmedWeek: WeeklyAvailability;
  weekDirty: boolean;
  outcomeUnknown: boolean;
};
export function DateAvailability({ timeZone, confirmedWeek, weekDirty, outcomeUnknown }: Props) {
  const [state, send] = useMachine(dateAvailabilityMachine, {
    input: { date: localDate(timeZone) },
  });
  const { draft, errors, date } = state.context;
  const saving = state.matches("saving");
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const failure =
    state.matches("loadFailed") ||
    state.matches({ editable: "unknown" }) ||
    state.matches({ editable: "rejected" });
  const mode = draft?.isBlocked ? "blocked" : draft?.intervals !== undefined ? "custom" : "inherit";
  const dateInstant = new Date(`${date}T12:00:00Z`);
  const weekday = confirmedWeek.days[(dateInstant.getUTCDay() + 6) % 7];
  useEffect(() => {
    if (Object.keys(errors).length > 0)
      formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
    else if (failure) alertRef.current?.focus();
  }, [errors, failure]);
  return (
    <Stack
      component="section"
      className="availability-panel availability-date"
      aria-labelledby="date-availability-title"
      gap="lg"
    >
      <div>
        <Text size="xs" c="green.8">
          Исключения
        </Text>
        <Title order={2} id="date-availability-title">
          Настройка конкретной даты
        </Title>
        <Text size="sm" c="dimmed">
          Местная дата и часы в поясе {timeZone}
        </Text>
      </div>
      <TextInput
        type="date"
        label="Местная дата"
        value={date}
        disabled={saving}
        onChange={(event) => send({ type: "dateChanged", date: event.currentTarget.value })}
      />
      {state.matches("choosing") && <Text>Выберите местную дату</Text>}
      {state.matches("loading") && <Text component="output">Загрузка настройки даты…</Text>}
      {state.matches("loadFailed") && (
        <Stack>
          <Text role="alert" ref={alertRef} tabIndex={-1}>
            Не удалось загрузить настройку даты
          </Text>
          <Button onClick={() => send({ type: "reload" })}>Повторить чтение даты</Button>
        </Stack>
      )}
      {draft && (
        <form
          ref={formRef}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            send({ type: "save" });
          }}
        >
          <Stack>
            <fieldset className="event-fields" disabled={saving}>
              <Stack gap="lg">
                <NativeSelect
                  label="Правило для даты"
                  value={mode}
                  data={[
                    { value: "inherit", label: "По недельному расписанию" },
                    { value: "custom", label: "Собственные интервалы" },
                    { value: "blocked", label: "Заблокировать дату" },
                  ]}
                  onChange={(event) =>
                    send({
                      type: "modeChanged",
                      mode: event.currentTarget.value as "inherit" | "custom" | "blocked",
                    })
                  }
                />
                {mode === "blocked" && (
                  <Text size="sm">
                    Дата закрыта. Собственные интервалы удаляются при сохранении. Снятие блокировки
                    возвращает недельное расписание.
                  </Text>
                )}
                {mode === "inherit" && (
                  <div className="availability-inheritance">
                    <Text fw={500}>Используются недельные интервалы</Text>
                    {weekday && (
                      <Text size="sm">
                        {new Intl.DateTimeFormat("ru", { weekday: "long", timeZone: "UTC" }).format(
                          dateInstant,
                        )}
                        :{" "}
                        {weekday.isBlocked
                          ? "День заблокирован"
                          : weekday.intervals.length
                            ? weekday.intervals
                                .map((interval) => `${interval.start}–${interval.end}`)
                                .join(" / ")
                            : "Нет рабочих часов"}
                      </Text>
                    )}
                  </div>
                )}
                {mode === "custom" && (
                  <>
                    {draft.intervals!.length === 0 && (
                      <Text size="sm">Собственные рабочие интервалы не заданы</Text>
                    )}
                    <Text size="sm" c="dimmed">
                      Собственные интервалы полностью заменяют недельные. Пустой список оставляет
                      дату без рабочих часов.
                    </Text>
                    <IntervalEditor
                      date
                      intervals={draft.intervals!}
                      errors={errors}
                      prefix="/intervals"
                      onAdd={() => send({ type: "add" })}
                      onRemove={(index) => send({ type: "remove", index })}
                      onChange={(index, values) => send({ type: "change", index, values })}
                    />
                  </>
                )}
                <div className="availability-confirmed-note">
                  <Text size="sm" c="dimmed">
                    {outcomeUnknown
                      ? "Последние подтверждённые данные; результат сохранения неизвестен"
                      : weekDirty
                        ? "Используется подтверждённая неделя. Несохранённые изменения недели здесь не действуют."
                        : "Основа — последняя подтверждённая неделя."}
                  </Text>
                  {weekday?.isBlocked && (
                    <Text size="sm" className="availability-warning">
                      Этот день недели заблокирован. Настройка даты не откроет его для встреч.
                    </Text>
                  )}
                </div>
                <Button type="submit" variant="outline">
                  Сохранить настройку даты
                </Button>
                <Button variant="subtle" onClick={() => send({ type: "reload" })}>
                  Прочитать настройку даты
                </Button>
              </Stack>
            </fieldset>
            {saving && <Text component="output">Сохранение настройки даты…</Text>}
            {state.matches({ editable: "saved" }) && (
              <Text component="output">Настройка даты сохранена</Text>
            )}
            {state.matches({ editable: "rejected" }) && (
              <Text role="alert" ref={alertRef} tabIndex={-1}>
                {Object.keys(errors).length > 0
                  ? "Проверьте интервалы даты"
                  : "Не удалось сохранить настройку даты. Повторите сохранение."}
              </Text>
            )}
            {state.matches({ editable: "unknown" }) && (
              <>
                <Text role="alert" ref={alertRef} tabIndex={-1}>
                  Результат сохранения неизвестен. Ввод сохранён. Прочитайте настройку даты или
                  повторите сохранение вручную.
                </Text>
                <Text size="sm">Чтение заменит текущий ввод данными сервера.</Text>
              </>
            )}
          </Stack>
        </form>
      )}
    </Stack>
  );
}
