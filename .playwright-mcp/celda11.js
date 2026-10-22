async (page) => {
  await page.waitForTimeout(1200);
  const nb = page.locator('#t-name-box');
  await nb.click(); await nb.fill('H11'); await nb.press('Enter');
  await page.waitForTimeout(400);
  await page.locator('#docs-insert-menu').click();
  await page.locator('.goog-menuitem:visible', { hasText: /^Imagen/ }).first().hover();
  await page.locator('.goog-menuitem:visible', { hasText: 'Insertar imagen en celda' }).first().click();
  const f = page.frameLocator('iframe[src*="picker"]').last();
  await f.getByText('Subir', { exact: true }).click({ timeout: 20000 });
  await f.getByRole('button', { name: 'Examinar' }).waitFor({ timeout: 20000 });
  return 'H11 listo';
}
