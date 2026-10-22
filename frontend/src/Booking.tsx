import { Button, Stack, Text, Title } from "@mantine/core";
import { useEffect, useRef } from "react";
import { getCalendarOwner } from "./api/generated";
import { GuestEventCatalog } from "./event-types/catalog";
import { useRead } from "./shared/useRead";

const readOwner = async (signal: AbortSignal) =>
  (await getCalendarOwner({ signal, throwOnError: true })).data;

export function Booking() {
  const { state, reload } = useRead(readOwner);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
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
        Шаг 1. Тип события
      </Title>
      <GuestEventCatalog />
    </Stack>
  );
}
