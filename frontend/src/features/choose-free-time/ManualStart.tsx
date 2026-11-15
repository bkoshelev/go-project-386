import { Button, Text, TextInput, Title } from "@mantine/core";
import { useMachine } from "@xstate/react";
import { useEffect } from "react";
import { assign, fromPromise, setup } from "xstate";
import type { AvailableSlot, UnavailabilityReason } from "../../api/generated";
import { checkFreeTime } from "./workflows";

const reasons: Record<UnavailabilityReason, string> = {
  time_occupied: "Это время занято с учётом паузы между встречами.",
  starts_in_past: "Начало встречи должно быть в будущем.",
  outside_booking_window: "Встреча выходит за окно бронирования.",
  outside_working_hours: "Встреча выходит за рабочие часы или попадает на закрытую дату.",
  schedule_not_initialized: "Расписание ещё не настроено.",
};

// Контекст содержит тип, выбранную дату, черновик времени и проверенный результат.
// changed очищает результат и отменяет запрос; check проверяет формат, затем запускает
// checking. available и unavailable отражают ответ, failed — ошибку, missing — удалённый
// тип. Из invalid, failed и unavailable гость исправляет ввод или повторяет проверку;
// available также допускает явную повторную проверку без изменения ввода.
type Context = {
  eventTypeId: string;
  date: string;
  durationMinutes: number;
  time: string;
  slot: AvailableSlot | null;
  reason: UnavailabilityReason | null;
};
const machine = setup({
  types: {
    context: {} as Context,
    input: {} as { eventTypeId: string; date: string; durationMinutes: number },
    events: {} as { type: "changed"; time: string } | { type: "check" },
  },
  actors: {
    check: fromPromise(
      ({
        input,
        signal,
      }: {
        input: { eventTypeId: string; startsAt: string; durationMinutes: number };
        signal: AbortSignal;
      }) => checkFreeTime(input.eventTypeId, input.startsAt, input.durationMinutes, signal),
    ),
  },
}).createMachine({
  id: "manualStart",
  initial: "editing",
  context: ({ input }) => ({ ...input, time: "", slot: null, reason: null }),
  on: {
    changed: {
      target: ".editing",
      actions: assign({ time: ({ event }) => event.time, slot: null, reason: null }),
    },
  },
  states: {
    editing: {
      on: {
        check: [
          {
            guard: ({ context }) => /^([01]\d|2[0-3]):[0-5]\d$/.test(context.time),
            target: "checking",
          },
          { target: "invalid" },
        ],
      },
    },
    invalid: { on: { check: "editing" } },
    checking: {
      invoke: {
        src: "check",
        input: ({ context }) => ({
          eventTypeId: context.eventTypeId,
          durationMinutes: context.durationMinutes,
          startsAt: new Date(`${context.date}T${context.time}:00`).toISOString(),
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.available,
            target: "available",
            actions: assign({
              slot: ({ event }) => (event.output.available ? event.output.slot : null),
            }),
          },
          {
            target: "unavailable",
            actions: assign({
              reason: ({ event }) => (event.output.available ? null : event.output.reason),
            }),
          },
        ],
        onError: [
          {
            guard: ({ event }) =>
              Boolean(
                event.error &&
                typeof event.error === "object" &&
                "code" in event.error &&
                event.error.code === "event_type_not_found",
              ),
            target: "missing",
          },
          { target: "failed" },
        ],
      },
    },
    missing: {},
    available: {
      on: { check: { target: "checking", actions: assign({ slot: null, reason: null }) } },
    },
    unavailable: { on: { check: "checking" } },
    failed: { on: { check: "checking" } },
  },
});

export function ManualStart({
  eventTypeId,
  date,
  durationMinutes,
  onSelection,
  onMissing,
}: {
  eventTypeId: string;
  date: string;
  durationMinutes: number;
  onSelection: (slot: AvailableSlot | null) => void;
  onMissing: () => void;
}) {
  const [state, send] = useMachine(machine, { input: { eventTypeId, date, durationMinutes } });
  const slot = state.context.slot;
  useEffect(() => {
    if (state.matches("missing")) onMissing();
  }, [state, onMissing]);
  useEffect(() => {
    if (slot) onSelection(slot);
  }, [slot, onSelection]);
  const formatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" });
  return (
    <section className="booking-manual" aria-label="Своё время">
      <Title order={4}>Или проверьте своё время</Title>
      <Text size="sm">Введите начало для выбранной даты в вашем часовом поясе.</Text>
      <div className="booking-manual-fields">
        <TextInput
          label="Своё время начала"
          type="time"
          value={state.context.time}
          error={state.matches("invalid") ? "Введите время с точностью до минуты" : undefined}
          onChange={(event) => {
            onSelection(null);
            send({ type: "changed", time: event.currentTarget.value });
          }}
        />
        <Button
          className="booking-button"
          classNames={{ label: "booking-button-label" }}
          loading={state.matches("checking")}
          onClick={() => {
            onSelection(null);
            send({ type: "check" });
          }}
        >
          Проверить время
        </Button>
      </div>
      {state.matches("checking") && <Text component="output">Проверяем доступность…</Text>}
      {state.matches("failed") && (
        <Text role="alert">Не удалось проверить время. Повторите проверку.</Text>
      )}
      {state.matches("unavailable") && state.context.reason && (
        <Text role="alert">{reasons[state.context.reason]}</Text>
      )}
      {state.matches("available") && slot && (
        <div className="booking-manual-result">
          <Text component="output">
            Доступно: {formatter.format(new Date(slot.startsAt))} —{" "}
            {formatter.format(new Date(slot.endsAt))}
          </Text>
        </div>
      )}
    </section>
  );
}
