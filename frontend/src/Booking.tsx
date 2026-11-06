import { Avatar, Badge, Button, Stack, Text, Title } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import { bookingMachine, ContactForm, MeetingSummary } from "./features/book-selected-slot";
import { getCalendarOwner, type EventType } from "./api/generated";
import { GuestEventCatalog } from "./features/browse-event-types";
import { useRead } from "./shared/useRead";
import { SlotCalendar } from "./features/choose-free-time";
import "./booking.css";

const readOwner = async (signal: AbortSignal) =>
  (await getCalendarOwner({ signal, throwOnError: true })).data;
const steps = ["Тип события", "Дата и время", "Данные гостя"];

export function Booking() {
  const { state, reload } = useRead(readOwner);
  const [booking, send] = useMachine(bookingMachine);
  const [loadedEvent, setLoadedEvent] = useState<EventType | null>(null);
  const { eventTypeId, selection, guest, errors, notice, confirmation } = booking.context;
  const choosingType = booking.matches("type");
  const choosingTime = booking.matches("time");
  const confirmed = booking.matches("confirmed");
  const saving = booking.matches("saving");
  const activeStep = choosingType ? 0 : choosingTime ? 1 : confirmed ? 3 : 2;
  const step = confirmed ? "Встреча подтверждена" : `Шаг ${activeStep + 1}. ${steps[activeStep]}`;
  const event = !choosingType && loadedEvent?.id === eventTypeId ? loadedEvent : null;
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
    <div className="booking-layout">
      <div className="booking-intro">
        <Text className="booking-eyebrow">Найдём время для разговора</Text>
        <Title order={2}>Встретимся в удобное время</Title>
      </div>
      <div className="booking-card">
        <aside className="booking-sidebar" aria-label="Сводка встречи">
          <div className="booking-owner">
            {state.status === "loading" && (
              <Text component="output">Загрузка профиля владельца…</Text>
            )}
            {state.status === "error" && (
              <Stack align="flex-start" gap="sm">
                <Text role="alert">Не удалось загрузить профиль владельца</Text>
                <Button
                  className="booking-button"
                  classNames={{ label: "booking-button-label" }}
                  variant="outline"
                  onClick={reload}
                >
                  Повторить загрузку профиля
                </Button>
              </Stack>
            )}
            {state.status === "ready" && (
              <>
                <Avatar
                  size={60}
                  radius="xl"
                  color="gray"
                  aria-hidden="true"
                  classNames={{ placeholder: "booking-avatar" }}
                >
                  {state.data.fullName
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")}
                </Avatar>
                <div>
                  <Text fw={600}>{state.data.fullName}</Text>
                  <Text size="sm" c="dimmed">
                    Организатор встречи
                  </Text>
                </div>
              </>
            )}
          </div>
          <div className="booking-event-summary">
            <Text className="booking-eyebrow">Ваша встреча</Text>
            {event ? (
              <>
                <Text className="booking-event-name" fw={600}>
                  {event.name}
                </Text>
                {event.description && (
                  <Text size="sm" c="dimmed">
                    {event.description}
                  </Text>
                )}
                <Badge className="booking-duration" variant="light" radius="sm">
                  {event.durationMinutes} мин
                </Badge>
              </>
            ) : (
              <Text size="sm" c="dimmed">
                {choosingType
                  ? "Выберите тип события, чтобы узнать подробности встречи."
                  : "Подробности выбранного типа появятся после загрузки."}
              </Text>
            )}
            {choosingTime && (
              <Button
                className="booking-button booking-change-type"
                classNames={{ label: "booking-button-label" }}
                variant="subtle"
                onClick={() => send({ type: "backToTypes" })}
              >
                Изменить тип встречи
              </Button>
            )}
          </div>
          <Text className="booking-sidebar-note" size="sm" c="dimmed">
            Выберите дату и свободное время. На следующем шаге укажите имя и email.
          </Text>
        </aside>
        <section className="booking-content" aria-labelledby="booking-step-heading">
          <ol className="booking-steps" aria-label="Этапы записи">
            {steps.map((label, index) => (
              <li
                key={label}
                className="booking-step"
                aria-current={activeStep === index ? "step" : undefined}
                data-completed={activeStep > index || undefined}
              >
                <span
                  className="booking-step-number"
                  aria-label={activeStep > index ? "Завершён" : undefined}
                >
                  {activeStep > index ? "✓" : index + 1}
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
          <Stack gap="lg">
            <Title
              id="booking-step-heading"
              order={3}
              tabIndex={-1}
              ref={heading}
              className="booking-step-heading"
            >
              {step}
            </Title>
            {notice && (
              <Text role="alert" className="booking-notice">
                {notice}
              </Text>
            )}
            {choosingType && (
              <GuestEventCatalog onContinue={(id) => send({ type: "typeChosen", id })} />
            )}
            {choosingTime && eventTypeId && (
              <SlotCalendar
                key={eventTypeId}
                eventTypeId={eventTypeId}
                onMissing={missingType}
                onEventLoaded={setLoadedEvent}
                onContinue={(selection) => send({ type: "slotChosen", selection })}
              />
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
              <section
                className="booking-confirmation"
                aria-label="Подтверждение встречи"
                aria-live="polite"
              >
                <Text className="booking-success-mark" aria-hidden="true">
                  ✓
                </Text>
                <MeetingSummary
                  name={confirmation.eventTypeName}
                  startsAt={confirmation.startsAt}
                  endsAt={confirmation.endsAt}
                />
              </section>
            )}
          </Stack>
        </section>
      </div>
    </div>
  );
}
