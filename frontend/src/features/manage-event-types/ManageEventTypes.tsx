import { Stack, Title } from "@mantine/core";
import { useRead } from "../../shared/useRead";
import { EventCatalog, readCatalog } from "../browse-event-types";
import { CreateEventTypeForm } from "./CreateEventTypeForm";

export function ManageEventTypes() {
  const { state, reload } = useRead(readCatalog);
  return (
    <Stack gap="xl">
      <Title order={2}>Типы событий</Title>
      <EventCatalog state={state} reload={reload} />
      <CreateEventTypeForm onCreated={reload} />
    </Stack>
  );
}
