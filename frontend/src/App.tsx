import {
  Anchor,
  Button,
  Container,
  Divider,
  Group,
  MantineProvider,
  Text,
  Title,
  type ContainerProps,
} from "@mantine/core";
import { availabilityCssVariables, availabilityTheme } from "./availabilityTheme";
import { AvailabilityPage } from "./AvailabilityPage";
import { Booking } from "./Booking";
import { ManageEventTypes } from "./features/manage-event-types";

const pageContainerProps = {
  "/": {
    component: "main",
    size: "md",
    px: { base: "md", sm: "xl" },
    py: { base: 64, sm: 96 },
  },
  "/admin": {
    component: "main",
    size: "xl",
    px: { base: "md", sm: "xl" },
    py: 28,
  },
  "/admin/availability": {
    component: "main",
    size: 1440,
    px: { base: 20, xs: 32, lg: 48 },
    py: { base: 32, sm: 48 },
  },
  "/book": {
    component: "main",
    className: "booking-page",
    size: 1184,
    px: { base: 12, sm: 32 },
    py: { base: 28, sm: 48 },
  },
} satisfies Record<
  "/" | "/admin" | "/admin/availability" | "/book",
  ContainerProps & { component: "main" }
>;

export function App() {
  const path = window.location.pathname;
  const page =
    path === "/admin" || path === "/admin/availability"
      ? path
      : path.startsWith("/book")
        ? "/book"
        : "/";
  const availability = path === "/admin/availability";
  const content = (
    <>
      <header>
        <Container
          size={availability ? 1440 : "md"}
          px={availability ? { base: 20, xs: 32, lg: 48 } : { base: "md", sm: "xl" }}
        >
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

      <Container {...pageContainerProps[page]}>
        {path.startsWith("/admin") && (
          <Group
            component="nav"
            aria-label="Разделы администратора"
            mb="xl"
            className={availability ? "availability-navigation" : undefined}
          >
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
          <AvailabilityPage />
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
  return availability ? (
    <MantineProvider
      forceColorScheme="light"
      cssVariablesSelector=".availability-shell"
      theme={availabilityTheme}
      cssVariablesResolver={availabilityCssVariables}
    >
      <div className="availability-shell" data-mantine-color-scheme="light">
        {content}
      </div>
    </MantineProvider>
  ) : (
    content
  );
}
