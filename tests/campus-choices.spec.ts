import { test, expect } from '@playwright/test';
import { CAMPUSES } from '../src/webparts/lostFoundStudent/found-items/utils/locations';

const first = CAMPUSES.find(campus => campus.code === 'C01')!;
const second = CAMPUSES.find(campus => campus.code === 'C02')!;
const third = CAMPUSES.find(campus => campus.code === 'C03')!;

for (const width of [320, 390, 1200]) {
  test(`キャンパスORと色ANDを検索し、保存・復元・解除する（${width}px）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?role=student');
    await page.evaluate(() => {
      const key = 'lost-found-no-qr-test-harness-v1';
      const database = JSON.parse(localStorage.getItem(key)!);
      const base = database.public[0];
      database.public = [['C01', '白'], ['C02', '白'], ['C03', '白'], ['C01', '青']].map(([campus, color], index) => ({
        ...base, id: String(100 + index), value: { ...base.value, sourceId: String(100 + index), campus, colors: [color] }
      }));
      localStorage.setItem(key, JSON.stringify(database));
    });
    await page.reload();
    await page.getByRole('button', { name: '絞り込み', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: '検索条件' });
    let campuses = dialog.getByRole('group', { name: 'キャンパス', exact: true });
    const all = campuses.getByRole('checkbox', { name: 'すべて', exact: true });
    await expect(all).toBeChecked();
    await dialog.getByRole('radio', { name: '傘・雨具', exact: true }).check();
    await dialog.getByRole('checkbox', { name: '白', exact: true }).check();
    await campuses.getByRole('checkbox', { name: first.name, exact: true }).check();
    await campuses.getByRole('checkbox', { name: second.name, exact: true }).check();
    await expect(campuses.getByRole('checkbox', { checked: true })).toHaveCount(2);
    await expect(all).not.toBeChecked();
    await expect(campuses.locator('span')).not.toContainText(['✓']);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await campuses.screenshot({ path: `temp/screenshots/student-campus-choices-${width}.png` });
    await dialog.getByRole('button', { name: 'この条件で探す', exact: true }).click();
    await expect(page.locator('.lf-item-card')).toHaveCount(2);
    await expect(page.locator('.lf-search-summary')).toContainText(first.name);
    await expect(page.locator('.lf-search-summary')).toContainText(second.name);

    // A cancelled draft must not change the applied pair of campuses.
    await page.getByRole('button', { name: '絞り込み', exact: true }).click();
    await campuses.getByRole('checkbox', { name: first.name, exact: true }).uncheck();
    await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
    await expect(page.locator('.lf-item-card')).toHaveCount(2);
    await page.getByRole('button', { name: '絞り込み', exact: true }).click();
    await expect(campuses.getByRole('checkbox', { name: first.name, exact: true })).toBeChecked();
    await campuses.getByRole('checkbox', { name: first.name, exact: true }).uncheck();
    await dialog.getByRole('button', { name: 'この条件で探す', exact: true }).click();
    await expect(page.locator('.lf-item-card')).toHaveCount(1);
    await page.getByRole('button', { name: '絞り込み', exact: true }).click();
    await campuses.getByRole('checkbox', { name: second.name, exact: true }).uncheck();
    await expect(all).toBeChecked();
    await campuses.getByRole('checkbox', { name: first.name, exact: true }).check();
    await campuses.getByRole('checkbox', { name: second.name, exact: true }).check();
    await dialog.getByRole('button', { name: 'この条件で探す', exact: true }).click();

    await page.getByRole('button', { name: '紛失した物を登録', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '紛失した物を登録' });
    campuses = dialog.getByRole('group', { name: 'キャンパス', exact: true });
    await expect(campuses.getByRole('checkbox', { name: first.name, exact: true })).toBeChecked();
    await expect(campuses.getByRole('checkbox', { name: second.name, exact: true })).toBeChecked();
    await dialog.getByRole('button', { name: '紛失した物を登録', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.lf-record-card')).toContainText(first.name);
    await expect(page.locator('.lf-record-card')).toContainText(second.name);
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lost-found-no-qr-test-harness-v1')!).requests[0].value.criteria);
    expect(saved.campuses).toEqual(['C01', 'C02']);
    expect(saved).not.toHaveProperty('campus');
    await page.reload();
    await page.getByRole('navigation', { name: '学生メニュー' }).getByRole('button', { name: '紛失した物', exact: true }).click();
    await page.getByRole('button', { name: '編集', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '紛失した物を編集' });
    campuses = dialog.getByRole('group', { name: 'キャンパス', exact: true });
    await expect(campuses.getByRole('checkbox', { name: first.name, exact: true })).toBeChecked();
    await expect(campuses.getByRole('checkbox', { name: second.name, exact: true })).toBeChecked();
    await campuses.getByRole('checkbox', { name: 'すべて', exact: true }).check();
    await expect(campuses.getByRole('checkbox', { checked: true })).toHaveCount(1);
    await dialog.getByRole('button', { name: '変更を保存', exact: true }).click();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lost-found-no-qr-test-harness-v1')!).requests[0].value.criteria);
    expect(saved.campuses).toEqual([]);
    await page.getByRole('button', { name: '編集', exact: true }).click();
    await expect(campuses.getByRole('checkbox', { name: 'すべて', exact: true })).toBeChecked();
  });
}

test('過去の単一キャンパスの申告を復元し、複数キャンパスに変更できる', async ({ page }) => {
  await page.goto('/?role=student');
  await page.evaluate(() => {
    const key = 'lost-found-no-qr-test-harness-v1';
    const database = JSON.parse(localStorage.getItem(key)!);
    database.requests = [{ id: '81', author: 'student-1', etag: '1', value: { criteria: { parent: 'P05', category: '', colors: [], campus: 'C02', building: '', dateFrom: '', dateTo: '', query: '' }, feature: '', status: 'ACTIVE', createdAt: '2026-09-15T00:00:00Z' } }];
    localStorage.setItem(key, JSON.stringify(database));
  });
  await page.reload();
  await page.getByRole('navigation', { name: '学生メニュー' }).getByRole('button', { name: '紛失した物', exact: true }).click();
  await page.getByRole('button', { name: '編集', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '紛失した物を編集' });
  const campuses = dialog.getByRole('group', { name: 'キャンパス', exact: true });
  await expect(campuses.getByRole('checkbox', { name: second.name, exact: true })).toBeChecked();
  await campuses.getByRole('checkbox', { name: third.name, exact: true }).check();
  await dialog.getByRole('button', { name: '変更を保存', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lost-found-no-qr-test-harness-v1')!).requests[0].value.criteria);
  expect(saved.campuses).toEqual(['C02', 'C03']);
  expect(saved).not.toHaveProperty('campus');
});
