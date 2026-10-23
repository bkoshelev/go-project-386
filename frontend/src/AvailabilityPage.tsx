import { Stack } from "@mantine/core";
import { useState } from "react";
import { Availability } from "./features/manage-weekly-availability";
import { DateAvailability } from "./features/manage-date-availability";

export function AvailabilityPage() {
  const [timeZone, setTimeZone] = useState<string>();
  return (
    <Stack gap="xl">
      <Availability onTimeZoneReady={setTimeZone} />
      {timeZone && <DateAvailability timeZone={timeZone} />}
    </Stack>
  );
}
