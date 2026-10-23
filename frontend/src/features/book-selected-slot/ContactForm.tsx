import { Button, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useRef } from "react";
import type { BookingGuest } from "../../api/generated";
import type { FieldErrors } from "./workflows";

export function ContactForm({
  guest,
  errors,
  saving,
  message,
  onChange,
  onBack,
  onSave,
}: {
  guest: BookingGuest;
  errors: FieldErrors;
  saving: boolean;
  message: string;
  onChange: (values: Partial<BookingGuest>) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const name = useRef<HTMLInputElement>(null);
  const email = useRef<HTMLInputElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (saving) return;
    if (errors.name) name.current?.focus();
    else if (errors.email) email.current?.focus();
    else if (message) alert.current?.focus();
  }, [errors, saving, message]);
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <Stack>
        <fieldset disabled={saving} className="event-fields">
          <Stack>
            <TextInput
              ref={name}
              label="Имя"
              required
              autoComplete="name"
              value={guest.name}
              error={errors.name}
              onChange={(event) => onChange({ name: event.currentTarget.value })}
            />
            <TextInput
              ref={email}
              label="Email"
              required
              type="email"
              autoComplete="email"
              value={guest.email}
              error={errors.email}
              onChange={(event) => onChange({ email: event.currentTarget.value })}
            />
            <Button type="submit" disabled={saving}>
              Забронировать
            </Button>
            <Button variant="outline" onClick={onBack}>
              Назад к времени
            </Button>
          </Stack>
        </fieldset>
        {saving && <Text component="output">Сохранение бронирования…</Text>}
        {message && (
          <Text role="alert" ref={alert} tabIndex={-1}>
            {message}
          </Text>
        )}
      </Stack>
    </form>
  );
}
