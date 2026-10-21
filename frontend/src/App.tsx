import { Anchor, Button, Container, Divider, Group, Text, Title } from "@mantine/core";
import { Availability } from "./Availability";
import { Booking } from "./Booking";
import { ManageEventTypes } from "./features/manage-event-types";

export function App() {
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
        {path.startsWith("/admin") && (
          <Group component="nav" aria-label="Разделы администратора" mb="xl">
            <Anchor href="/admin" aria-current={path === "/admin" ? "page" : undefined}>
              Типы событий
            </Anchor>
            <Anchor
              href="/admin/availability"
              aria-current={path === "/admin/availability" ? "page" : undefined}
            >
              Доступность
            </Anchor>
          </Group>
        )}
        {path === "/admin/availability" ? (
          <Availability />
        ) : path === "/admin" ? (
          <ManageEventTypes />
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
