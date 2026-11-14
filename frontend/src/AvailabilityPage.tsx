import { Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { Availability, type ConfirmedSchedule } from "./features/manage-weekly-availability";
import { DateAvailability } from "./features/manage-date-availability";
import { MeetingPause } from "./features/manage-meeting-pause";
import "./availability.css";

export function AvailabilityPage() {
  const [schedule, setSchedule] = useState<ConfirmedSchedule>();
  return (
    <Stack gap="xl">
      <Availability onScheduleChange={setSchedule}>{schedule && <MeetingPause />}</Availability>
      {schedule && (
        <div className="availability-date-layout">
          <DateAvailability
            timeZone={schedule.timeZone}
            confirmedWeek={schedule.week}
            weekDirty={schedule.dirty}
            outcomeUnknown={schedule.outcomeUnknown}
          />
          <aside className="availability-explanation">
            <Title order={2}>Одна дата — другие часы</Title>
            <Text c="dimmed">
              Отпуск, короткий день или другое время встречи. Создайте исключение, сохранив
              привычный ритм недели.
            </Text>
            <Text size="sm">
              Недельная блокировка имеет приоритет над настройкой даты. Изменения не отменяют и не
              переносят уже созданные встречи.
            </Text>
          </aside>
        </div>
      )}
    </Stack>
  );
}
