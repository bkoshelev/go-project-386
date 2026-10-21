import { Button, NativeSelect, Radio, Stack, Text } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { getEventAvailability, getEventType } from "./api/generated";
import type { EventAvailability } from "./api/generated";
import { useRead } from "./shared/useRead";

const dateLabel = new Intl.DateTimeFormat("ru-RU", { dateStyle: "full" });
const timeLabel = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const instantLabel = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" });
const utcLabel = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC",
});

export function SlotCalendar({
  eventTypeId,
  onMissing,
}: {
  eventTypeId: string;
  onMissing: () => void;
}) {
  const read = useCallback(
    async (signal: AbortSignal) => {
      const path = { eventTypeId };
      try {
        const [event, availability] = await Promise.all([
          getEventType({ path, signal, throwOnError: true }),
          getEventAvailability({ path, signal, cache: "no-store", throwOnError: true }),
        ]);
        return { event: event.data, availability: availability.data };
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "event_type_not_found"
        )
          return null;
        throw error;
      }
    },
    [eventTypeId],
  );
  const { state, reload } = useRead(read);
  useEffect(() => {
    if (state.status === "ready" && state.data === null) onMissing();
  }, [state, onMissing]);
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState("");
  if (state.status === "loading")
    return <Text component="output">Загрузка свободного времени…</Text>;
  if (state.status === "error")
    return (
      <Stack align="flex-start">
        <Text role="alert">Не удалось загрузить свободное время</Text>
        <Button variant="outline" onClick={reload}>
          Повторить загрузку времени
        </Button>
      </Stack>
    );
  if (state.data === null) return null;
  const { event, availability } = state.data;
  const dates = windowDates(availability);
  const currentDate =
    (dates.includes(date) ? date : "") ||
    (availability.slots[0] ? localDate(new Date(availability.slots[0].startsAt)) : dates[0]);
  const slots = availability.slots.filter(
    (slot) => localDate(new Date(slot.startsAt)) === currentDate,
  );
  const chosen = slots.find((slot) => slot.startsAt === selected);
  return (
    <Stack>
      <Text fw={600}>
        {event.name} · {event.durationMinutes} мин
      </Text>
      <Text>Часовой пояс: {Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
      <Text c="dimmed">
        Окно бронирования (UTC): {utcLabel.format(new Date(availability.windowStartsAt))} —{" "}
        {utcLabel.format(new Date(availability.windowEndsAt))}
      </Text>
      {availability.slots.length === 0 ? (
        <Text>В ближайшие 14 дней нет свободного времени</Text>
      ) : (
        <>
          <NativeSelect
            label="Дата"
            value={currentDate}
            onChange={(event) => {
              setDate(event.currentTarget.value);
              setSelected("");
            }}
            data={dates.map((value) => ({
              value,
              label: dateLabel.format(new Date(`${value}T12:00:00`)),
            }))}
          />
          {slots.length === 0 ? (
            <Text>На эту дату нет свободного времени</Text>
          ) : (
            <Radio.Group label="Свободное время" value={selected} onChange={setSelected}>
              <Stack gap="sm" mt="xs">
                {slots.map((slot) => {
                  const start = new Date(slot.startsAt);
                  const end = new Date(slot.endsAt);
                  const endLabel =
                    localDate(start) === localDate(end)
                      ? timeLabel.format(end)
                      : instantLabel.format(end);
                  return (
                    <Radio
                      key={slot.startsAt}
                      value={slot.startsAt}
                      label={`${timeLabel.format(start)}–${endLabel}`}
                    />
                  );
                })}
              </Stack>
            </Radio.Group>
          )}
        </>
      )}
      {chosen && (
        <Text component="output">
          Время выбрано: {instantLabel.format(new Date(chosen.startsAt))} —{" "}
          {instantLabel.format(new Date(chosen.endsAt))}
        </Text>
      )}
      <Text c="dimmed">Выбор не резервирует время</Text>
      <Button
        variant="outline"
        onClick={() => {
          setSelected("");
          reload();
        }}
      >
        Обновить доступность
      </Button>
    </Stack>
  );
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function windowDates(availability: EventAvailability) {
  const date = new Date(availability.windowStartsAt);
  date.setHours(0, 0, 0, 0);
  const end = new Date(Date.parse(availability.windowEndsAt) - 1);
  const dates: string[] = [];
  while (localDate(date) <= localDate(end)) {
    dates.push(localDate(date));
    date.setDate(date.getDate() + 1);
  }
  return dates;
}
