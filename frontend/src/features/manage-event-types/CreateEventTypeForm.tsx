import { Button, NativeSelect, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { creationMachine, getDurationLimit } from "./creation";

export function CreateEventTypeForm({ onCreated }: { onCreated: () => void }) {
  const [state, send] = useMachine(creationMachine, { input: { onCreated } });
  const { draft, errors } = state.context;
  const { name, description, duration, unit } = draft;
  const saving = state.matches("saving");
  const success = state.matches({ editable: "created" });
  const message = success
    ? "Тип события создан"
    : state.matches({ editable: "rejected" })
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
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        send({ type: "saveRequested" });
      }}
    >
      <Stack>
        <Title order={3}>Создать тип события</Title>
        <fieldset disabled={saving} className="event-fields">
          <Stack>
            <TextInput
              ref={nameRef}
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
              autosize
              value={description}
              onChange={(event) =>
                send({ type: "draftChanged", values: { description: event.currentTarget.value } })
              }
              error={errors.description}
            />
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
            <Button type="submit" disabled={saving}>
              Создать тип события
            </Button>
          </Stack>
        </fieldset>
        {saving && <Text component="output">Сохранение…</Text>}
        {message &&
          (success ? (
            <Text component="output">{message}</Text>
          ) : (
            <Text role="alert">{message}</Text>
          ))}
      </Stack>
    </form>
  );
}
