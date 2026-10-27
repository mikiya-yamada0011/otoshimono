import { test, expect } from '@playwright/test';

test.use({ locale: 'ja-JP' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-27T12:00:00+09:00'));
  await page.goto('/?role=student');
  await page.getByRole('button', { name: '絞り込み', exact: true }).click();
});

test('標準日付欄で選択・削除・適用・再表示し、開始終了と未来日の制約を維持する', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: '検索条件' });
  const start = dialog.getByLabel('日付（開始）', { exact: true });
  const end = dialog.getByLabel('日付（終了）', { exact: true });
  await expect(start).toHaveAttribute('type', 'date');
  await expect(end).toHaveAttribute('type', 'date');
  await expect(start).toHaveAttribute('max', '2026-09-27');
  await expect(end).not.toHaveAttribute('min');
  await start.fill('2026-09-24');
  await expect(end).toHaveAttribute('min', '2026-09-24');
  await end.fill('2026-09-23');
  await expect.poll(() => end.evaluate(input => (input as HTMLInputElement).validity.rangeUnderflow)).toBe(true);
  await dialog.getByRole('button', { name: 'この条件で探す', exact: true }).click();
  await expect(dialog).toBeVisible();
  await end.fill('2026-09-28');
  await expect.poll(() => end.evaluate(input => (input as HTMLInputElement).validity.rangeOverflow)).toBe(true);
  await end.fill('2026-09-25');
  await expect(start).toHaveAttribute('max', '2026-09-25');
  await start.fill('2026-09-26');
  await expect.poll(() => start.evaluate(input => (input as HTMLInputElement).validity.rangeOverflow)).toBe(true);
  await start.fill('');
  await expect(end).not.toHaveAttribute('min');
  await dialog.getByRole('button', { name: 'この条件で探す', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '絞り込み', exact: true }).click();
  await expect(start).toHaveValue('');
  await expect(end).toHaveValue('2026-09-25');
  await dialog.getByRole('button', { name: '条件をクリア', exact: true }).click();
  await expect(end).toHaveValue('');
  await start.fill('2024-02-29');
  await expect.poll(() => dialog.locator('form').evaluate(form => (form as HTMLFormElement).checkValidity())).toBe(true);
});

test('紛失申告も標準日付欄で保存し、編集時に復元する', async ({ page }) => {
  let dialog = page.getByRole('dialog', { name: '検索条件' });
  await dialog.getByRole('radio', { name: '財布・現金', exact: true }).check();
  await dialog.getByRole('radio', { name: '財布', exact: true }).check();
  await dialog.getByLabel('日付（開始）', { exact: true }).fill('2026-09-24');
  await dialog.getByLabel('日付（終了）', { exact: true }).fill('2026-09-27');
  await dialog.getByRole('button', { name: 'この条件で探す', exact: true }).click();
  await page.getByRole('button', { name: '紛失した物を登録', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '紛失した物を登録' });
  await expect(dialog.getByLabel('日付（開始）', { exact: true })).toHaveAttribute('type', 'date');
  await expect(dialog.getByLabel('日付（開始）', { exact: true })).toHaveValue('2026-09-24');
  await expect(dialog.getByLabel('日付（終了）', { exact: true })).toHaveValue('2026-09-27');
  for (const label of ['日付（開始）', '日付（終了）']) {
    await expect(dialog.getByLabel(label)).toHaveCSS('font-size', '14px');
    await expect(dialog.getByLabel(label)).toHaveCSS('height', '40px');
  }
  await dialog.getByRole('button', { name: '紛失した物を登録', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lost-found-no-qr-test-harness-v1')!).requests[0].value.criteria);
  expect(saved).toMatchObject({ dateFrom: '2026-09-24', dateTo: '2026-09-27' });
  await page.getByRole('button', { name: '編集', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '紛失した物を編集' });
  await expect(dialog.getByLabel('日付（開始）', { exact: true })).toHaveValue('2026-09-24');
  await expect(dialog.getByLabel('日付（終了）', { exact: true })).toHaveValue('2026-09-27');
  for (const width of [390, 521, 520, 1200]) {
    await page.setViewportSize({ width, height: 900 });
    for (const label of ['日付（開始）', '日付（終了）']) {
      await expect(dialog.getByLabel(label)).toHaveCSS('font-size', width <= 520 ? '16px' : '14px');
      await expect(dialog.getByLabel(label)).toHaveCSS('height', width <= 520 ? '44px' : '40px');
    }
    await expect(dialog.getByLabel('日付（開始）')).toHaveValue('2026-09-24');
    await expect(dialog.getByLabel('日付（終了）')).toHaveValue('2026-09-27');
  }
});
