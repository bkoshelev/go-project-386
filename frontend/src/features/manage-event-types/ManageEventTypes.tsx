import { Anchor, Button, Group, Modal, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import type { EventTypes } from "../../api/generated";
import { useRead, type ReadState } from "../../shared/useRead";
import { readCatalog } from "../browse-event-types";
import { CreateEventTypeForm } from "./CreateEventTypeForm";
import "./manage-event-types.css";

type EventType = EventTypes["items"][number];

function Duration({ minutes }: { minutes: number }) {
  return (
    <span className="event-type-duration">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </svg>
      {minutes} мин
    </span>
  );
}

function EventTypeCards({
  state,
  reload,
  onCreate,
  onPreview,
}: {
  state: ReadState<EventTypes>;
  reload: () => void;
  onCreate: () => void;
  onPreview: (item: EventType) => void;
}) {
  if (state.status === "loading") return <Text component="output">Загрузка типов событий…</Text>;
  if (state.status === "error")
    return (
      <Stack align="flex-start">
        <Text role="alert">Не удалось загрузить типы событий</Text>
        <Button variant="outline" color="#315d4e" onClick={reload}>
          Повторить
        </Button>
      </Stack>
    );
  return (
    <>
      {state.data.items.length === 0 && (
        <Text c="dimmed" mb="lg">
          Типов событий пока нет
        </Text>
      )}
      <ul className="event-type-grid" aria-label="Типы событий">
        {state.data.items.map((item, index) => (
          <li className={`event-type-card event-type-tone-${index % 4}`} key={item.id}>
            <div className="event-type-card-top">
              <span className="event-type-symbol" aria-hidden="true">
                {["✳︎", "↗", "◇", "◎"][index % 4]}
              </span>
              <Duration minutes={item.durationMinutes} />
            </div>
            <Title order={3} className="event-type-name">
              {item.name}
            </Title>
            <Text className="event-type-description">{item.description || "Без описания"}</Text>
            <button
              type="button"
              className="event-type-preview-button"
              aria-label={`Как увидит гость: ${item.name}`}
              onClick={() => onPreview(item)}
            >
              Как увидит гость <span aria-hidden="true">↗</span>
            </button>
          </li>
        ))}
        <li role="presentation">
          <button
            type="button"
            className="event-type-add"
            aria-label="Добавить тип события"
            onClick={onCreate}
          >
            <span className="event-type-add-symbol" aria-hidden="true">
              ＋
            </span>
            <strong>
              {state.data.items.length ? "Ещё один формат?" : "Начнём с первой встречи?"}
            </strong>
            <span>Создать тип события</span>
          </button>
        </li>
      </ul>
    </>
  );
}

export function ManageEventTypes() {
  const { state, reload } = useRead(readCatalog);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [preview, setPreview] = useState<EventType | null>(null);
  const openCreate = () => {
    setCreated(false);
    setCreating(true);
  };
  return (
    <section className="manage-event-types" aria-labelledby="event-types-title">
      <Group className="event-types-heading" justify="space-between" align="center">
        <div>
          <Text className="event-types-eyebrow">ВАШ КАЛЕНДАРЬ / ТИПЫ СОБЫТИЙ</Text>
          <Title order={2} id="event-types-title" className="event-types-title">
            У каждой встречи — своя цель.
          </Title>
          <Text c="dimmed">Соберите форматы встреч, а гости выберут подходящий.</Text>
        </div>
        <Button color="#315d4e" radius="xl" size="md" onClick={openCreate}>
          + Новый тип
        </Button>
      </Group>
      {created && (
        <Text component="output" className="event-type-success">
          Тип события создан
        </Text>
      )}
      <Group justify="space-between" className="event-types-toolbar">
        <Text size="sm">
          Ваши типы{" "}
          {state.status === "ready" && (
            <span className="event-types-count">
              {String(state.data.items.length).padStart(2, "0")}
            </span>
          )}
        </Text>
        <Text className="event-types-legend" c="dimmed">
          Название · описание · длительность
        </Text>
      </Group>
      <EventTypeCards state={state} reload={reload} onCreate={openCreate} onPreview={setPreview} />
      <Text className="event-types-footnote">
        Все типы используют ваше{" "}
        <Anchor href="/admin/availability" c="inherit" size="inherit">
          расписание доступности ↗
        </Anchor>
      </Text>
      <CreateEventTypeForm
        opened={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreated(true);
          setCreating(false);
          reload();
        }}
      />
      <Modal
        opened={!!preview}
        onClose={() => setPreview(null)}
        title="Предпросмотр для гостя"
        centered
        radius="lg"
      >
        {preview && (
          <Stack className="event-type-guest-preview">
            <Text className="event-types-eyebrow">ТИП СОБЫТИЯ</Text>
            <Title order={3}>{preview.name}</Title>
            <Duration minutes={preview.durationMinutes} />
            {preview.description && <Text>{preview.description}</Text>}
            <Text c="dimmed" size="xs">
              Так название, описание и длительность будут видны гостю при выборе встречи.
            </Text>
          </Stack>
        )}
      </Modal>
    </section>
  );
}
