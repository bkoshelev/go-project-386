import { Button, Modal, Stack, Text, TextInput, Title } from "@mantine/core";
import { useMachine } from "@xstate/react";
import { useEffect, useRef } from "react";
import { meetingPauseMachine } from "./model";

export function MeetingPause() {
  const [state, send] = useMachine(meetingPauseMachine);
  const input = useRef<HTMLInputElement>(null);
  const notice = useRef<HTMLParagraphElement>(null);
  const { confirmed, draft, error, outcomeUnknown } = state.context;
  const saving = state.matches("saving");
  const opened = state.matches("editing") || saving;
  const message = outcomeUnknown
    ? "Не удалось получить результат сохранения. Результат неизвестен. Повторите сохранение вручную."
    : state.matches({ editing: "rejected" })
      ? "Не удалось сохранить паузу. Повторите сохранение."
      : "";
  useEffect(() => {
    if (!opened || saving) return;
    // Repeated rejection needs focus even when the message is unchanged.
    if (error) input.current?.focus();
    else if (
      message &&
      (state.matches({ editing: "rejected" }) || state.matches({ editing: "unknown" }))
    )
      notice.current?.focus();
  }, [error, message, opened, saving, state]);
  return (
    <section className="availability-panel meeting-pause" aria-labelledby="meeting-pause-heading">
      <div className="meeting-pause-row">
        <div>
          <Title order={2} id="meeting-pause-heading">
            {confirmed === null
              ? "Пауза между встречами"
              : `Промежуток между встречами: ${confirmed} мин.`}
          </Title>
          <Text size="sm" c="dimmed">
            Для всех типов событий. Уже созданные встречи сохраняются.
          </Text>
        </div>
        {confirmed !== null && (
          <Button variant="default" onClick={() => send({ type: "open" })}>
            Изменить паузу
          </Button>
        )}
        {state.matches("loading") && <Text component="output">Загрузка паузы…</Text>}
        {state.matches("loadFailed") && (
          <Stack gap="xs">
            <Text role="alert">Не удалось загрузить паузу</Text>
            <Button onClick={() => send({ type: "retry" })}>Повторить загрузку паузы</Button>
          </Stack>
        )}
      </div>
      {state.matches("saved") && (
        <Text component="output" className="meeting-pause-success">
          Пауза сохранена
        </Text>
      )}
      {!opened && outcomeUnknown && (
        <Text role="alert" className="meeting-pause-success">
          Результат последнего сохранения неизвестен. Откройте настройку и повторите сохранение
          вручную.
        </Text>
      )}
      <Modal
        opened={opened}
        onClose={() => send({ type: "close" })}
        title="Пауза между встречами"
        centered
        withinPortal={false}
        closeOnClickOutside={!saving}
        closeOnEscape={!saving}
        withCloseButton={!saving}
        closeButtonProps={{ "aria-label": "Закрыть настройку паузы" }}
      >
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            send({ type: "save" });
          }}
        >
          <Stack>
            <Text c="dimmed" size="sm">
              Один минимальный промежуток до и после соседних встреч любых типов.
            </Text>
            <TextInput
              ref={input}
              data-autofocus
              label="Пауза между встречами, мин"
              description="От 0 до 60 целых минут. При 0 встречи могут идти подряд."
              inputMode="numeric"
              value={draft}
              onChange={(event) => send({ type: "change", value: event.currentTarget.value })}
              error={error}
              disabled={saving}
            />
            <Text size="sm" c="dimmed">
              Изменения действуют на новые бронирования. Часы расписания и сохранённый часовой пояс
              не меняются.
            </Text>
            <Button type="submit" disabled={saving}>
              Сохранить паузу
            </Button>
            {saving && <Text component="output">Сохранение паузы…</Text>}
            {message && !saving && (
              <Text ref={notice} role="alert" tabIndex={-1}>
                {message}
              </Text>
            )}
          </Stack>
        </form>
      </Modal>
    </section>
  );
}
