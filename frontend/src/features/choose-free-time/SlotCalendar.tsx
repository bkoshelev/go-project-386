import { Button, NativeSelect, Radio, Stack, Text } from "@mantine/core";
import { useMachine } from "@xstate/react";
import { useEffect } from "react";
import type { AvailableSlot, EventType } from "../../api/generated";
import { localDate, windowDates } from "./dates";
import { freeTimeMachine } from "./model";

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
  onContinue,
}: {
  eventTypeId: string;
  onMissing: () => void;
  onContinue?: (selection: { event: EventType; slot: AvailableSlot }) => void;
}) {
  const [state, send] = useMachine(freeTimeMachine, { input: { eventTypeId } });
  useEffect(() => {
    send({ type: "eventTypeChanged", eventTypeId });
  }, [eventTypeId, send]);
  useEffect(() => {
    if (state.matches("missing")) onMissing();
  }, [state, onMissing]);
  if (state.matches("loading")) return <Text component="output">Загрузка свободного времени…</Text>;
  if (state.matches("failed"))
    return (
      <Stack align="flex-start">
        <Text role="alert">Не удалось загрузить свободное время</Text>
        <Button variant="outline" onClick={() => send({ type: "refresh" })}>
          Повторить загрузку времени
        </Button>
      </Stack>
    );
  if (!state.matches("ready") || !state.context.data) return null;
  const { event, availability } = state.context.data!;
  const dates = windowDates(availability);
  const { date: currentDate, selected } = state.context;
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
              send({ type: "dateChanged", date: event.currentTarget.value });
            }}
            data={dates.map((value) => ({
              value,
              label: dateLabel.format(new Date(`${value}T12:00:00`)),
            }))}
          />
          {slots.length === 0 ? (
            <Text>На эту дату нет свободного времени</Text>
          ) : (
            <Radio.Group
              label="Свободное время"
              value={selected}
              onChange={(startsAt) => send({ type: "slotSelected", startsAt })}
            >
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
      {onContinue && (
        <Button
          disabled={!chosen}
          onClick={() => {
            if (chosen) onContinue({ event, slot: chosen });
          }}
        >
          Продолжить
        </Button>
      )}
      <Text c="dimmed">Выбор не резервирует время</Text>
      <Button variant="outline" onClick={() => send({ type: "refresh" })}>
        Обновить доступность
      </Button>
    </Stack>
  );
}
