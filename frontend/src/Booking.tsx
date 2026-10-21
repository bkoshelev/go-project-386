import { Button, Stack, Text, Title } from "@mantine/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCalendarOwner } from "./api/generated";
import { GuestEventCatalog } from "./features/browse-event-types";
import { useRead } from "./shared/useRead";
import { SlotCalendar } from "./SlotCalendar";

const readOwner = async (signal: AbortSignal) =>
  (await getCalendarOwner({ signal, throwOnError: true })).data;

export function Booking() {
  const { state, reload } = useRead(readOwner);
  const [eventTypeId, setEventTypeId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const missingType = useCallback(() => {
    setNotice("Тип события не найден. Выберите другой тип.");
    setEventTypeId(null);
  }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [eventTypeId]);
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
        {eventTypeId ? "Шаг 2. Дата и время" : "Шаг 1. Тип события"}
      </Title>
      {notice && <Text role="alert">{notice}</Text>}
      {eventTypeId ? (
        <Stack>
          <Button variant="outline" onClick={() => setEventTypeId(null)}>
            Назад к типам событий
          </Button>
          <SlotCalendar key={eventTypeId} eventTypeId={eventTypeId} onMissing={missingType} />
        </Stack>
      ) : (
        <GuestEventCatalog
          onContinue={(id) => {
            setNotice("");
            setEventTypeId(id);
          }}
        />
      )}
    </Stack>
  );
}
