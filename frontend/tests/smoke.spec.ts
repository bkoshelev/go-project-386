import { expect, test } from '@playwright/test'

test('страница загружается, а модальное окно открывается и закрывается', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'Календарь звонков' })).toBeVisible()

  const openButton = page.getByRole('button', { name: 'Проверить интерфейс' })
  await expect(openButton).toBeVisible()
  await openButton.click()

  const dialog = page.getByRole('dialog', { name: 'Интерфейс работает' })
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
