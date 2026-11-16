import { Button, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { listOwnerBookings } from "../../api/generated";
import { useRead } from "../../shared/useRead";

const readMeetings = async (signal: AbortSignal) =>
  (await listOwnerBookings({ signal, throwOnError: true })).data;

export function UpcomingMeetings() {
  const { state, reload } = useRead(readMeetings);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone,
  });
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Предстоящие встречи</Title>
        <Text c="dimmed">Текущие и будущие встречи со всеми гостями</Text>
      </div>
      <Text>Часовой пояс встреч: {timeZone}</Text>
      {state.status === "loading" ? (
        <Text component="output">Загружаем встречи…</Text>
      ) : state.status === "error" ? (
        <Stack align="flex-start">
          <Text role="alert">Не удалось загрузить встречи</Text>
          <Button variant="outline" onClick={reload}>
            Повторить
          </Button>
        </Stack>
      ) : state.data.items.length === 0 ? (
        <Text>Предстоящих встреч пока нет</Text>
      ) : (
        <SimpleGrid component="ul" cols={{ base: 1, sm: 2, lg: 3 }} className="event-list">
          {state.data.items.map((meeting) => (
            <Paper component="li" withBorder p="lg" radius="md" key={meeting.id}>
              <Stack gap="sm">
                <Title order={3} size="h4">
                  {meeting.eventTypeName}
                </Title>
                <div>
                  <Text>Начало: {formatter.format(new Date(meeting.startsAt))}</Text>
                  <Text>Окончание: {formatter.format(new Date(meeting.endsAt))}</Text>
                  <Text size="sm" c="dimmed">
                    {timeZone}
                  </Text>
                </div>
                <div>
                  <Text>{meeting.guest.name}</Text>
                  <Text>{meeting.guest.email}</Text>
                </div>
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
