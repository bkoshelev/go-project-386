import { Button, Paper, Radio, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { listEventTypes, type EventTypes } from "../api/generated";
import { useRead, type ReadState } from "../shared/useRead";

export const readCatalog = async (signal: AbortSignal) =>
  (await listEventTypes({ signal, throwOnError: true })).data;

export function GuestEventCatalog() {
  const { state, reload } = useRead(readCatalog);
  return <EventCatalog state={state} reload={reload} guest />;
}

export function EventCatalog({
  state,
  reload,
  guest = false,
}: {
  state: ReadState<EventTypes>;
  reload: () => void;
  guest?: boolean;
}) {
  const [selected, setSelected] = useState("");
  if (state.status === "loading") return <Text component="output">Загрузка типов событий…</Text>;
  if (state.status === "error")
    return (
      <Stack align="flex-start">
        <Text role="alert">Не удалось загрузить типы событий</Text>
        <Button variant="outline" onClick={reload}>
          Повторить
        </Button>
      </Stack>
    );
  if (state.data.items.length === 0)
    return <Text>{guest ? "Пока нет доступных типов встреч" : "Типов событий пока нет"}</Text>;
  const items = (
    <Stack component="ul" aria-label="Типы событий" className="event-list">
      {state.data.items.map((item) => (
        <Paper component="li" withBorder p="md" key={item.id}>
          <Stack gap="xs">
            {guest ? (
              <Radio value={item.id} label={item.name} />
            ) : (
              <Text fw={600}>{item.name}</Text>
            )}
            {item.description && <Text>{item.description}</Text>}
            <Text c="dimmed">{item.durationMinutes} мин</Text>
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
  return guest ? (
    <Radio.Group label="Выберите тип события" value={selected} onChange={setSelected}>
      {items}
    </Radio.Group>
  ) : (
    items
  );
}
