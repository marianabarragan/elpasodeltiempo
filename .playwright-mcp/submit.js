async (page) => {
  await page.getByRole('button', { name: 'Quitar archivo' }).waitFor({ timeout: 45000 });
  const r = await page.evaluate(() => [...document.querySelectorAll('[role=radio][aria-checked=true]')].map(x => x.getAttribute('aria-label')));
  if (r.length !== 2) return { error: 'radios', r };
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.waitForURL(/formResponse/, { timeout: 30000 });
  return { submitted: true, r };
}