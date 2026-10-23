import { Button, Stack, Text, Title } from "@mantine/core";
import { useCallback, useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { bookingMachine, ContactForm, MeetingSummary } from "./features/book-selected-slot";
import { getCalendarOwner } from "./api/generated";
import { GuestEventCatalog } from "./features/browse-event-types";
import { useRead } from "./shared/useRead";
import { SlotCalendar } from "./features/choose-free-time";

const readOwner = async (signal: AbortSignal) =>
  (await getCalendarOwner({ signal, throwOnError: true })).data;

export function Booking() {
  const { state, reload } = useRead(readOwner);
  const [booking, send] = useMachine(bookingMachine);
  const { eventTypeId, selection, guest, errors, notice, confirmation } = booking.context;
  const choosingType = booking.matches("type");
  const choosingTime = booking.matches("time");
  const confirmed = booking.matches("confirmed");
  const saving = booking.matches("saving");
  const step = choosingType
    ? "Шаг 1. Тип события"
    : choosingTime
      ? "Шаг 2. Дата и время"
      : confirmed
        ? "Встреча подтверждена"
        : "Шаг 3. Данные гостя";
  const missingType = useCallback(() => send({ type: "missingType" }), [send]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  const message = booking.matches({ contacts: "unknown" })
    ? "Не удалось получить результат бронирования. Встреча могла сохраниться. Автоматического повтора нет."
    : booking.matches({ contacts: "rejected" })
      ? "Не удалось сохранить бронирование. Проверьте время перед повтором."
      : "";
  return (
    <Stack gap="xl">
      {state.status === "loading" && <Text component="output">Загрузка профиля владельца…</Text>}
      {state.status === "error" && (
        <Stack align="flex-start">
          <Text role="alert">Не удалось загрузить профиль владельца</Text>
          <Button variant="outline" onClick={reload}>
            Повторить загрузку профиля
          </Button>
        </Stack>
      )}
      {state.status === "ready" && <Title order={2}>Создать встречу с {state.data.fullName}</Title>}
      <Title order={3} tabIndex={-1} ref={heading}>
        {step}
      </Title>
      {notice && <Text role="alert">{notice}</Text>}
      {choosingType && <GuestEventCatalog onContinue={(id) => send({ type: "typeChosen", id })} />}
      {choosingTime && eventTypeId && (
        <Stack>
          <Button variant="outline" onClick={() => send({ type: "backToTypes" })}>
            Назад к типам событий
          </Button>
          <SlotCalendar
            key={eventTypeId}
            eventTypeId={eventTypeId}
            onMissing={missingType}
            onContinue={(selection) => send({ type: "slotChosen", selection })}
          />
        </Stack>
      )}
      {selection && !confirmed && !choosingTime && (
        <>
          <MeetingSummary
            name={selection.event.name}
            startsAt={selection.slot.startsAt}
            endsAt={selection.slot.endsAt}
          />
          <ContactForm
            guest={guest}
            errors={errors}
            saving={saving}
            message={message}
            onChange={(values) => send({ type: "guestChanged", values })}
            onBack={() => send({ type: "backToTime" })}
            onSave={() => send({ type: "save" })}
          />
        </>
      )}
      {confirmed && confirmation && (
        <MeetingSummary
          name={confirmation.eventTypeName}
          startsAt={confirmation.startsAt}
          endsAt={confirmation.endsAt}
        />
      )}
    </Stack>
  );
}
