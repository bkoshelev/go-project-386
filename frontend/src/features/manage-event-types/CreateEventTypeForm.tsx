import {
  Button,
  Group,
  Modal,
  NativeSelect,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { creationMachine, getDurationLimit } from "./creation";

export function CreateEventTypeForm({
  opened,
  onClose,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [state, send] = useMachine(creationMachine, { input: { onCreated } });
  const { draft, errors } = state.context;
  const { name, description, duration, unit } = draft;
  const saving = state.matches("saving");
  const message = state.matches({ editable: "rejected" })
    ? "Не удалось сохранить тип события. Проверьте данные и повторите."
    : state.matches({ editable: "unknown" })
      ? "Не удалось получить результат сохранения. Проверьте каталог перед повтором."
      : "";
  const nameRef = useRef<HTMLInputElement>(null);
  const durationRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const durationLimit = getDurationLimit(unit);

  useEffect(() => {
    if (saving) return;
    // React has re-enabled the fieldset before focusing a rejected field.
    if (errors.name) nameRef.current?.focus();
    else if (errors.description) descriptionRef.current?.focus();
    else if (errors.durationMinutes) durationRef.current?.focus();
  }, [errors, saving]);
  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!saving) onClose();
      }}
      title="Создать тип события"
      centered
      radius="lg"
      keepMounted
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      withCloseButton={!saving}
      closeButtonProps={{ "aria-label": "Закрыть форму" }}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          send({ type: "saveRequested" });
        }}
      >
        <Stack>
          <Text c="dimmed" size="sm">
            Опишите встречу — гости смогут выбрать подходящий формат.
          </Text>
          <fieldset disabled={saving} className="event-fields">
            <Stack>
              <TextInput
                ref={nameRef}
                data-autofocus
                placeholder="Например, консультация"
                label="Название"
                required
                value={name}
                onChange={(event) =>
                  send({ type: "draftChanged", values: { name: event.currentTarget.value } })
                }
                error={errors.name}
              />
              <Textarea
                ref={descriptionRef}
                label="Описание"
                description="Необязательно"
                placeholder="О чём поговорим и кому подойдёт встреча"
                minRows={3}
                autosize
                value={description}
                onChange={(event) =>
                  send({ type: "draftChanged", values: { description: event.currentTarget.value } })
                }
                error={errors.description}
              />
              <Group grow align="flex-start" className="event-type-duration-fields">
                <TextInput
                  ref={durationRef}
                  label="Длительность"
                  required
                  type="number"
                  min={1}
                  max={durationLimit}
                  step={1}
                  value={duration}
                  onChange={(event) =>
                    send({ type: "draftChanged", values: { duration: event.currentTarget.value } })
                  }
                  error={errors.durationMinutes}
                />
                <NativeSelect
                  label="Единица длительности"
                  value={unit}
                  onChange={(event) =>
                    send({
                      type: "draftChanged",
                      values: { unit: event.currentTarget.value === "hours" ? "hours" : "minutes" },
                    })
                  }
                  data={[
                    { value: "minutes", label: "Минуты" },
                    { value: "hours", label: "Часы" },
                  ]}
                />
              </Group>
              <Button type="submit" disabled={saving} color="#315d4e" size="md" radius="xl">
                Создать тип события
              </Button>
            </Stack>
          </fieldset>
          {saving && <Text component="output">Сохранение…</Text>}
          {message && <Text role="alert">{message}</Text>}
        </Stack>
      </form>
    </Modal>
  );
}
