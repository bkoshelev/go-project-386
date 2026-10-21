import { Anchor, Button, Container, Divider, Group, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { Booking } from "./Booking";
import { CreateEventType } from "./CreateEventType";
import { EventCatalog } from "./EventCatalog";

export function App() {
  const [revision, setRevision] = useState(0);
  const path = window.location.pathname;
  return (
    <>
      <header>
        <Container size="md" px={{ base: "md", sm: "xl" }}>
          <Group justify="space-between" py={{ base: "lg", sm: "xl" }}>
            <Title order={1} fz={{ base: 20, sm: 24 }} miw={0}>
              Календарь встреч
            </Title>
            <Group component="nav" aria-label="Основная навигация">
              {path !== "/" && <Anchor href="/">Главная</Anchor>}
              <Anchor href="/admin" aria-current={path === "/admin" ? "page" : undefined}>
                Администрирование
              </Anchor>
              <Button component="a" href="/book">
                Записаться
              </Button>
            </Group>
          </Group>
        </Container>
        <Divider />
      </header>

      <Container component="main" size="md" px={{ base: "md", sm: "xl" }} py={{ base: 64, sm: 96 }}>
        {path === "/admin" ? (
          <Stack gap="xl">
            <Title order={2}>Типы событий</Title>
            <EventCatalog revision={revision} />
            <CreateEventType onCreated={() => setRevision((value) => value + 1)} />
          </Stack>
        ) : path.startsWith("/book") ? (
          <Booking />
        ) : (
          <Text size="xl" maw={640} lh={1.7}>
            Сервис для бронирования встреч. Выберите удобное время для очной встречи или звонка
          </Text>
        )}
      </Container>
    </>
  );
}
