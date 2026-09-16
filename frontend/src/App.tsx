import { Button, Container, Modal, Paper, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'

export function App() {
  const [opened, { open, close }] = useDisclosure(false)

  return (
    <main className="page">
      <Container size="sm">
        <Paper p="xl" radius="lg" shadow="md" withBorder>
          <Stack align="flex-start" gap="lg">
            <Title order={1}>Календарь звонков</Title>
            <Text c="dimmed">
              Минимальный интерфейс готов. Здесь появится управление встречами.
            </Text>
            <Button onClick={open}>Проверить интерфейс</Button>
          </Stack>
        </Paper>
      </Container>

      <Modal opened={opened} onClose={close} title="Интерфейс работает" centered>
        <Text>React и компоненты Mantine успешно подключены.</Text>
      </Modal>
    </main>
  )
}
