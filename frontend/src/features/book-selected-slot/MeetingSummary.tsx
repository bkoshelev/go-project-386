import { Stack, Text } from "@mantine/core";

const label = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" });
export function MeetingSummary({
  name,
  startsAt,
  endsAt,
}: {
  name: string;
  startsAt: string;
  endsAt: string;
}) {
  return (
    <Stack gap="xs">
      <Text fw={600}>{name}</Text>
      <Text>Начало: {label.format(new Date(startsAt))}</Text>
      <Text>Окончание: {label.format(new Date(endsAt))}</Text>
      <Text>Часовой пояс: {Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
    </Stack>
  );
}
