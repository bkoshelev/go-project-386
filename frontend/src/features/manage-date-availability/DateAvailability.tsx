import { Button, Checkbox, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { useMachine } from "@xstate/react";
import { useEffect, useRef } from "react";
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

export function DateAvailability({ timeZone }: { timeZone: string }) {
  const [state, send] = useMachine(dateAvailabilityMachine, {
    input: { date: localDate(timeZone) },
  });
  const { draft, errors } = state.context;
  const saving = state.matches("saving");
  const formRef = useRef<HTMLFormElement>(null);
  const custom = draft?.intervals !== undefined;
  useEffect(() => {
    if (Object.keys(errors).length > 0)
      formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  return (
    <Stack component="section" aria-labelledby="date-availability-title">
      <Title order={3} id="date-availability-title">
        Настройка конкретной даты
      </Title>
      <Text>Местная дата и часы в поясе {timeZone}. Блокировка дня недели имеет приоритет.</Text>
      <TextInput
        type="date"
        label="Местная дата"
        value={state.context.date}
        disabled={saving}
        onChange={(event) => send({ type: "dateChanged", date: event.currentTarget.value })}
      />
      {state.matches("choosing") && <Text>Выберите местную дату</Text>}
      {state.matches("loading") && <Text component="output">Загрузка настройки даты…</Text>}
      {state.matches("loadFailed") && (
        <Stack>
          <Text role="alert">Не удалось загрузить настройку даты</Text>
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
              <Stack>
                <Checkbox
                  label="Дата заблокирована"
                  checked={draft.isBlocked}
                  onChange={(event) =>
                    send({ type: "blocked", value: event.currentTarget.checked })
                  }
                />
                {draft.isBlocked ? (
                  <Text>Дата закрыта. Собственные интервалы удаляются при сохранении.</Text>
                ) : (
                  <>
                    <Checkbox
                      label="Собственные интервалы"
                      checked={custom}
                      onChange={(event) =>
                        send({ type: "custom", value: event.currentTarget.checked })
                      }
                    />
                    {!custom && <Text>Используются недельные интервалы</Text>}
                    {custom && (
                      <>
                        {draft.intervals!.length === 0 && (
                          <Text>Собственные рабочие интервалы не заданы</Text>
                        )}
                        <Text>
                          Собственные интервалы полностью заменяют недельные. Пустой список
                          оставляет дату без рабочих часов.
                        </Text>
                        {draft.intervals!.map((interval, index) => (
                          <Group align="start" grow className="weekly-interval" key={index}>
                            <TextInput
                              classNames={{ input: "weekly-clock" }}
                              label={`Начало интервала ${index + 1}`}
                              placeholder="09:00"
                              value={interval.start}
                              error={errors[`/intervals/${index}/start`]}
                              onChange={(event) =>
                                send({
                                  type: "change",
                                  index,
                                  values: { start: event.currentTarget.value },
                                })
                              }
                            />
                            <TextInput
                              classNames={{ input: "weekly-clock" }}
                              label={`Окончание интервала ${index + 1}`}
                              placeholder="18:00"
                              value={interval.end}
                              error={errors[`/intervals/${index}/end`]}
                              onChange={(event) =>
                                send({
                                  type: "change",
                                  index,
                                  values: { end: event.currentTarget.value },
                                })
                              }
                            />
                            <Button
                              variant="subtle"
                              aria-label={`Удалить интервал даты ${index + 1}`}
                              onClick={() => send({ type: "remove", index })}
                            >
                              Удалить
                            </Button>
                          </Group>
                        ))}
                        <Button variant="light" onClick={() => send({ type: "add" })}>
                          Добавить интервал даты
                        </Button>
                      </>
                    )}
                  </>
                )}
                <Button type="submit">Сохранить настройку даты</Button>
                <Button variant="light" onClick={() => send({ type: "reload" })}>
                  Прочитать настройку даты
                </Button>
              </Stack>
            </fieldset>
            {saving && <Text component="output">Сохранение настройки даты…</Text>}
            {state.matches({ editable: "saved" }) && (
              <Text component="output">Настройка даты сохранена</Text>
            )}
            {state.matches({ editable: "rejected" }) && (
              <Text role="alert">
                {Object.keys(errors).length > 0
                  ? "Проверьте интервалы даты"
                  : "Не удалось сохранить настройку даты. Повторите сохранение."}
              </Text>
            )}
            {state.matches({ editable: "unknown" }) && (
              <Text role="alert">
                Результат сохранения неизвестен. Ввод сохранён. Прочитайте настройку даты или
                повторите сохранение вручную.
              </Text>
            )}
          </Stack>
        </form>
      )}
    </Stack>
  );
}
