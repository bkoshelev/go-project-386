import { Button, NativeSelect, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { useRef, useState, type FormEvent } from "react";
import { createEventType } from "./api/generated";

export function CreateEventType({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [unit, setUnit] = useState("minutes");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const durationRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const durationLimit = unit === "hours" ? 23 : 60;

  const focusError = (fields: Record<string, string>) => {
    if (fields.name) nameRef.current?.focus();
    else if (fields.description) descriptionRef.current?.focus();
    else if (fields.durationMinutes) durationRef.current?.focus();
  };
  const showUnknownResult = () => {
    setSuccess(false);
    setMessage("Не удалось получить результат сохранения. Проверьте каталог перед повтором.");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current) return;
    const value = Number(duration);
    const fields: Record<string, string> = {};
    if (!name.trim()) fields.name = "Введите название";
    if (!Number.isInteger(value) || value < 1 || value > durationLimit) {
      fields.durationMinutes = `Введите целое число от 1 до ${durationLimit}`;
    }
    setErrors(fields);
    setSuccess(false);
    setMessage("");
    if (Object.keys(fields).length) {
      focusError(fields);
      return;
    }
    pending.current = true;
    setSaving(true);
    try {
      const result = await createEventType({
        body: {
          name: name.trim(),
          ...(description ? { description } : {}),
          durationMinutes: unit === "hours" ? value * 60 : value,
        },
      });
      if (!result.response || (result.error && result.response.ok)) {
        showUnknownResult();
      } else if (result.error) {
        if (result.error.code === "validation_error") {
          const serverFields: Record<string, string> = {};
          for (const field of result.error.fields)
            serverFields[field.field.slice(1)] = field.message;
          setErrors(serverFields);
          // Focus after the disabled fieldset is re-enabled below.
          requestAnimationFrame(() => focusError(serverFields));
        }
        setMessage("Не удалось сохранить тип события. Проверьте данные и повторите.");
      } else if (result.data) {
        setSuccess(true);
        setMessage("Тип события создан");
        setName("");
        setDescription("");
        setDuration("");
        onCreated();
      }
    } catch {
      showUnknownResult();
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <form
      noValidate
      onSubmit={(event) => {
        submit(event).catch(showUnknownResult);
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
              onChange={(event) => setName(event.currentTarget.value)}
              error={errors.name}
            />
            <Textarea
              ref={descriptionRef}
              label="Описание"
              description="Необязательно"
              autosize
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
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
              onChange={(event) => setDuration(event.currentTarget.value)}
              error={errors.durationMinutes}
            />
            <NativeSelect
              label="Единица длительности"
              value={unit}
              onChange={(event) => setUnit(event.currentTarget.value)}
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
