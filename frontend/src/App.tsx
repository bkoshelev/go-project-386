import { Button, Container, Divider, Group, Text, Title } from "@mantine/core";

export function App() {
  return (
    <>
      <header>
        <Container size="md" px={{ base: "md", sm: "xl" }}>
          <Group justify="space-between" wrap="nowrap" py={{ base: "lg", sm: "xl" }}>
            <Title order={1} fz={{ base: 20, sm: 24 }} miw={0}>
              Календарь встреч
            </Title>
            <Button disabled style={{ flexShrink: 0 }}>
              Записаться
            </Button>
          </Group>
        </Container>
        <Divider />
      </header>

      <Container component="main" size="md" px={{ base: "md", sm: "xl" }} py={{ base: 64, sm: 96 }}>
        <Text size="xl" maw={640} lh={1.7}>
          Сервис для бронирования встреч. Выберите удобное время для очной встречи или звонка
        </Text>
      </Container>
    </>
  );
}
