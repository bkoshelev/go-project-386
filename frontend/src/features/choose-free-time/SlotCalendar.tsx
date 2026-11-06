import { Button, Radio, Stack, Text, Title } from "@mantine/core";
import { Calendar } from "@mantine/dates";
import { useMachine } from "@xstate/react";
import { useEffect, useState } from "react";
import "dayjs/locale/ru";
import type { AvailableSlot, EventType } from "../../api/generated";
import { localDate, windowDates } from "./dates";
import { freeTimeMachine } from "./model";
import type { FreeTime } from "./workflows";

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
  onEventLoaded,
  onContinue,
}: {
  eventTypeId: string;
  onMissing: () => void;
  onEventLoaded?: (event: EventType) => void;
  onContinue?: (selection: { event: EventType; slot: AvailableSlot }) => void;
}) {
  const [state, send] = useMachine(freeTimeMachine, { input: { eventTypeId } });
  useEffect(() => {
    send({ type: "eventTypeChanged", eventTypeId });
  }, [eventTypeId, send]);
  useEffect(() => {
    if (state.matches("missing")) onMissing();
  }, [state, onMissing]);
  const event = state.context.data?.event;
  useEffect(() => {
    if (event) onEventLoaded?.(event);
  }, [event, onEventLoaded]);
  if (state.matches("loading")) return <Text component="output">Загрузка свободного времени…</Text>;
  if (state.matches("failed"))
    return (
      <Stack align="flex-start">
        <Text role="alert">Не удалось загрузить свободное время</Text>
        <Button
          className="booking-button"
          classNames={{ label: "booking-button-label" }}
          variant="outline"
          onClick={() => send({ type: "refresh" })}
        >
          Повторить загрузку времени
        </Button>
      </Stack>
    );
  if (!state.matches("ready") || !state.context.data) return null;
  return (
    <TimePicker
      data={state.context.data}
      currentDate={state.context.date}
      selected={state.context.selected}
      onDateChange={(date) => send({ type: "dateChanged", date })}
      onSlotChange={(startsAt) => send({ type: "slotSelected", startsAt })}
      onRefresh={() => send({ type: "refresh" })}
      onContinue={onContinue}
    />
  );
}

function TimePicker({
  data: { event, availability },
  currentDate,
  selected,
  onDateChange,
  onSlotChange,
  onRefresh,
  onContinue,
}: {
  data: FreeTime;
  currentDate: string;
  selected: string;
  onDateChange: (date: string) => void;
  onSlotChange: (startsAt: string) => void;
  onRefresh: () => void;
  onContinue?: (selection: { event: EventType; slot: AvailableSlot }) => void;
}) {
  const [month, setMonth] = useState(currentDate);
  const dates = windowDates(availability);
  const datesWithSlots = new Set(
    availability.slots.map((slot) => localDate(new Date(slot.startsAt))),
  );
  const slots = availability.slots.filter(
    (slot) => localDate(new Date(slot.startsAt)) === currentDate,
  );
  const chosen = slots.find((slot) => slot.startsAt === selected);
  return (
    <Stack gap="lg">
      <div className="booking-picker">
        <section className="booking-month" aria-label="Дата встречи">
          <Calendar
            classNames={{
              month: "booking-calendar-month",
              calendarHeader: "booking-calendar-header",
              day: "booking-calendar-day",
            }}
            fullWidth
            locale="ru"
            firstDayOfWeek={1}
            maxLevel="month"
            hideOutsideDates
            date={month}
            onDateChange={setMonth}
            minDate={dates[0]}
            maxDate={dates[dates.length - 1]}
            previousLabel="Предыдущий месяц"
            nextLabel="Следующий месяц"
            getDayAriaLabel={(date) => dateLabel.format(new Date(`${date}T12:00:00`))}
            getDayProps={(date) => ({
              selected: date === currentDate,
              "aria-pressed": date === currentDate,
              "aria-describedby": datesWithSlots.has(date) ? "booking-available-day" : undefined,
              "data-has-slots": datesWithSlots.has(date) || undefined,
              onClick: () => onDateChange(date),
            })}
          />
          <Text id="booking-available-day" className="booking-calendar-legend" size="sm">
            <span aria-hidden="true">●</span> Есть свободное время
          </Text>
        </section>
        <section className="booking-times" aria-label="Время встречи">
          <Title order={4} className="booking-date-label">
            {dateLabel.format(new Date(`${currentDate}T12:00:00`))}
          </Title>
          {availability.slots.length === 0 ? (
            <Text component="output">В ближайшие 14 дней нет свободного времени</Text>
          ) : slots.length === 0 ? (
            <Text component="output">На эту дату нет свободного времени</Text>
          ) : (
            <Radio.Group label="Свободное время" value={selected} onChange={onSlotChange}>
              <div className="booking-slot-grid">
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
                      className="booking-slot"
                      classNames={{ label: "booking-radio-label" }}
                    />
                  );
                })}
              </div>
            </Radio.Group>
          )}
        </section>
      </div>
      <div className="booking-timezone">
        <Text size="sm">Часовой пояс: {Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
        <Text size="xs" c="dimmed">
          Окно бронирования (UTC): {utcLabel.format(new Date(availability.windowStartsAt))} —{" "}
          {utcLabel.format(new Date(availability.windowEndsAt))}
        </Text>
      </div>
      <div className="booking-selection-footer">
        <div>
          {chosen ? (
            <Text component="output" className="booking-selected-time">
              Время выбрано: {instantLabel.format(new Date(chosen.startsAt))} —{" "}
              {instantLabel.format(new Date(chosen.endsAt))}
            </Text>
          ) : (
            <Text size="sm">Выберите дату и свободное время</Text>
          )}
          <Text size="sm" c="dimmed">
            Выбор не резервирует время
          </Text>
        </div>
        {onContinue && (
          <Button
            className="booking-button"
            classNames={{ label: "booking-button-label" }}
            disabled={!chosen}
            onClick={() => {
              if (chosen) onContinue({ event, slot: chosen });
            }}
          >
            Продолжить
          </Button>
        )}
      </div>
      <Button
        className="booking-button booking-refresh"
        classNames={{ label: "booking-button-label" }}
        variant="subtle"
        onClick={onRefresh}
      >
        Обновить доступность
      </Button>
    </Stack>
  );
}
