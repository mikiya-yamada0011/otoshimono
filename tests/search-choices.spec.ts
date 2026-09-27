import { test, expect } from '@playwright/test';
import { CATEGORY_GROUPS } from '../src/webparts/lostFoundStudent/found-items/utils/categories';
import { CAMPUSES } from '../src/webparts/lostFoundStudent/found-items/utils/locations';
import { COLORS, today } from '../src/webparts/lostFoundStudent/found-items/types/model';

test.use({ locale: 'ja-JP' });

for (const width of [320, 390, 520, 521, 1200]) {
  test(`検索条件は登録と同じ折り返し選択、すべて・単一・複数選択を維持する（${width}px）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?role=student');
    await page.getByRole('button', { name: '絞り込み', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '検索条件' });
    await expect(dialog).toHaveCSS('padding-top', '16px');
    const heading = await dialog.getByRole('heading', { name: '検索条件' }).boundingBox();
    const introduction = await dialog.locator('form > p').boundingBox();
    const conditions = await dialog.locator('.lf-conditions').boundingBox();
    expect(introduction!.y - heading!.y - heading!.height).toBeCloseTo(16, 0);
    expect(conditions!.y - introduction!.y - introduction!.height).toBeCloseTo(16, 0);
    await dialog.screenshot({ path: `temp/screenshots/student-search-compact-header-${width}.png` });
    const parents = dialog.getByRole('group', { name: '種類', exact: true });
    const campuses = dialog.getByRole('group', { name: 'キャンパス', exact: true });
    const colors = dialog.locator('.lf-criteria-colors');
    await expect(dialog.getByRole('combobox')).toHaveCount(0);
    await expect(parents.getByRole('radio')).toHaveCount(CATEGORY_GROUPS.length + 1);
    await expect(campuses.getByRole('checkbox')).toHaveCount(CAMPUSES.length + 1);
    await expect(colors.getByRole('checkbox')).toHaveCount(COLORS.length);
    await expect(parents.getByRole('radio', { name: 'すべて', exact: true })).toBeChecked();
    await expect(campuses.getByRole('checkbox', { name: 'すべて', exact: true })).toBeChecked();
    await expect(dialog.getByRole('group', { name: '細かい種類', exact: true })).toHaveCount(0);
    await expect(dialog.locator('.lf-conditions input[required]')).toHaveCount(0);

    const umbrella = parents.getByRole('radio', { name: '傘・雨具', exact: true });
    await umbrella.check();
    const children = dialog.getByRole('group', { name: '細かい種類', exact: true });
    await expect(children.getByRole('radio', { name: 'すべて', exact: true })).toBeChecked();
    await children.getByRole('radio', { name: '長傘', exact: true }).check();
    await expect(umbrella.locator('+ span')).toHaveCSS('background-color', 'rgb(35, 104, 85)');
    await expect(children.getByRole('radio', { checked: true })).toHaveCount(1);
    await parents.getByRole('radio', { name: '財布・現金', exact: true }).check();
    await expect(children.getByRole('radio', { name: '長傘', exact: true })).toHaveCount(0);
    await expect(children.getByRole('radio', { name: 'すべて', exact: true })).toBeChecked();
    await expect(parents.getByRole('radio', { checked: true })).toHaveCount(1);

    await campuses.getByRole('checkbox', { name: CAMPUSES[0].name, exact: true }).check();
    await campuses.getByRole('checkbox', { name: CAMPUSES[1].name, exact: true }).check();
    await expect(campuses.getByRole('checkbox', { checked: true })).toHaveCount(2);
    await expect(campuses.getByRole('checkbox', { name: 'すべて', exact: true })).not.toBeChecked();
    const red = colors.getByRole('checkbox', { name: '赤', exact: true });
    const white = colors.getByRole('checkbox', { name: '白', exact: true });
    await red.check();
    await white.check();
    await expect(colors.getByRole('checkbox', { checked: true })).toHaveCount(2);
    await expect(red.locator('+ span')).toHaveText('赤');
    await expect(red.locator('+ span')).toHaveCSS('background-color', 'rgb(35, 104, 85)');
    await red.uncheck();
    await page.mouse.move(0, 0);
    await expect(white).toBeChecked();
    await expect(red.locator('+ span')).toHaveText('赤');
    await expect(red.locator('+ span')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await white.focus();
    await page.keyboard.press('Space');
    await expect(white).not.toBeChecked();
    await expect(dialog.getByLabel('日付（開始）', { exact: true })).toHaveAttribute('type', 'date');
    await expect(dialog.getByLabel('日付（終了）', { exact: true })).toHaveAttribute('type', 'date');

    const dates = dialog.locator('.lf-criteria-dates');
    for (const label of ['日付（開始）', '日付（終了）']) {
      const input = dialog.getByLabel(label);
      await expect(input).toHaveCSS('height', width <= 520 ? '44px' : '40px');
      await expect(input).toHaveCSS('font-size', width <= 520 ? '16px' : '14px');
      await expect(input).toHaveCSS('font-weight', '400');
      const bounds = await input.boundingBox();
      expect(bounds!.width).toBeCloseTo(144, 0);
    }
    const start = await dialog.getByLabel('日付（開始）').boundingBox();
    const end = await dialog.getByLabel('日付（終了）').boundingBox();
    if (width > 360) {
      expect(start!.y).toBeCloseTo(end!.y, 0);
      expect(end!.x - start!.x - start!.width).toBeCloseTo(12, 0);
    } else expect(end!.y).toBeGreaterThan(start!.y + start!.height);
    await dates.screenshot({ path: `temp/screenshots/student-filter-dates-${width}.png` });

    await expect(dialog.getByRole('region', { name: '開始日のカレンダー', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '開始日のカレンダーを開く', exact: true })).toHaveCount(0);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

    // Content-sized chips wrap with a six-pixel gap instead of column slots.
    const layout = await parents.locator('.lf-category-choices').evaluate(container => {
      const bounds = container.getBoundingClientRect();
      return { bounds: { x: bounds.x, right: bounds.right }, chips: Array.from(container.querySelectorAll('label')).map(label => {
        const chip = label.getBoundingClientRect();
        const input = label.querySelector('input')!.getBoundingClientRect();
        return { x: chip.x, y: chip.y, right: chip.right, width: chip.width, height: chip.height, inputHeight: input.height };
      }) };
    });
    expect(new Set(layout.chips.map(chip => Math.round(chip.width))).size).toBeGreaterThan(3);
    expect(new Set(layout.chips.map(chip => Math.round(chip.y))).size).toBeGreaterThan(1);
    layout.chips.forEach((chip, index) => {
      expect(chip.x).toBeGreaterThanOrEqual(layout.bounds.x - 1);
      expect(chip.right).toBeLessThanOrEqual(layout.bounds.right + 1);
      expect(chip.inputHeight).toBeCloseTo(chip.height, 0);
      const previous = layout.chips[index - 1];
      if (previous && Math.abs(chip.y - previous.y) < 1) expect(chip.x - previous.right).toBeCloseTo(6, 0);
    });
    await expect(dialog.locator('.lf-category-choices span')).not.toContainText(['✓']);
    expect(await page.locator('body').evaluate(body => body.scrollWidth)).toBe(width);
    await page.screenshot({ path: `temp/screenshots/student-filter-choices-${width}.png` });

    await parents.getByRole('radio', { name: 'すべて', exact: true }).check();
    await expect(children).toHaveCount(0);
    await campuses.getByRole('checkbox', { name: 'すべて', exact: true }).check();
    await expect(campuses.getByRole('checkbox', { checked: true })).toHaveCount(1);
  });
}

test('ボタン検索の下書き・確定・再表示・クリアと空条件を一巡する', async ({ page }) => {
  await page.goto('/?role=student');
  await expect(page.locator('.lf-item-card').first()).toBeVisible();
  const count = await page.locator('.lf-item-card').count();
  await page.getByRole('button', { name: '絞り込み', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '検索条件' });
  const parents = dialog.getByRole('group', { name: '種類', exact: true });
  const children = dialog.getByRole('group', { name: '細かい種類', exact: true });
  const campuses = dialog.getByRole('group', { name: 'キャンパス', exact: true });
  await parents.getByRole('radio', { name: '傘・雨具', exact: true }).check();
  await children.getByRole('radio', { name: '長傘', exact: true }).check();
  await dialog.getByRole('checkbox', { name: '白', exact: true }).check();
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.locator('.lf-item-card')).toHaveCount(count);
  await expect(page.locator('.lf-search-summary')).toHaveCount(0);

  await page.getByRole('button', { name: '絞り込み', exact: true }).click();
  await expect(parents.getByRole('radio', { name: 'すべて', exact: true })).toBeChecked();
  await expect(children).toHaveCount(0);
  await expect(dialog.locator('.lf-criteria-colors').getByRole('checkbox', { checked: true })).toHaveCount(0);
  await parents.getByRole('radio', { name: '傘・雨具', exact: true }).check();
  await children.getByRole('radio', { name: '長傘', exact: true }).check();
  await dialog.getByRole('checkbox', { name: '白', exact: true }).check();
  await dialog.getByRole('checkbox', { name: '黒', exact: true }).check();
  await campuses.getByRole('checkbox', { name: CAMPUSES.find(campus => campus.code === 'C02')!.name, exact: true }).check();
  await dialog.getByLabel('日付（開始）').fill(today());
  await dialog.getByLabel('日付（終了）').fill(today());
  await dialog.getByRole('button', { name: 'この条件で探す', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.lf-item-card')).toHaveCount(1);
  await expect(page.locator('.lf-search-summary')).toContainText('長傘');
  await page.getByRole('button', { name: '絞り込み', exact: true }).click();
  await expect(children.getByRole('radio', { name: '長傘', exact: true })).toBeChecked();
  await expect(dialog.locator('.lf-criteria-colors').getByRole('checkbox', { checked: true })).toHaveCount(2);
  await expect(dialog.getByLabel('日付（開始）')).toHaveValue(today());
  await dialog.getByRole('button', { name: '条件をクリア', exact: true }).click();
  await expect(parents.getByRole('radio', { name: 'すべて', exact: true })).toBeChecked();
  await expect(campuses.getByRole('checkbox', { name: 'すべて', exact: true })).toBeChecked();
  await expect(children).toHaveCount(0);
  await expect(dialog.locator('.lf-criteria-colors').getByRole('checkbox', { checked: true })).toHaveCount(0);
  await expect(dialog.getByLabel('日付（開始）')).toHaveValue('');
  await expect(dialog.getByLabel('日付（終了）')).toHaveValue('');
  await expect(page.locator('.lf-search-summary')).toContainText('長傘');
  await dialog.getByRole('button', { name: 'この条件で探す', exact: true }).click();
  await expect(page.locator('.lf-item-card')).toHaveCount(count);
  await expect(page.locator('.lf-search-summary')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '紛失した物を登録', exact: true })).toHaveCount(0);
});

test('検索から紛失申告へボタン選択を引き継ぎ、申告だけ種類を必須にする', async ({ page }) => {
  await page.goto('/?role=student');
  await page.getByRole('button', { name: '絞り込み', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: '財布・現金', exact: true }).check();
  await dialog.getByRole('radio', { name: '財布', exact: true }).check();
  await dialog.getByRole('checkbox', { name: '白', exact: true }).check();
  await dialog.getByRole('button', { name: 'この条件で探す', exact: true }).click();
  await page.getByRole('button', { name: '紛失した物を登録', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '紛失した物を登録' });
  const parents = dialog.getByRole('group', { name: '種類', exact: true });
  await expect(parents.getByRole('radio', { name: 'すべて', exact: true })).toHaveCount(0);
  await expect(parents.getByRole('radio', { name: '財布・現金', exact: true })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: '財布', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: '白', exact: true })).toBeChecked();
  await expect(parents.getByRole('radio').first()).toHaveAttribute('required', '');
  await expect(dialog.getByLabel('日付（開始）')).toHaveCSS('height', '40px');
  await expect(dialog.getByLabel('日付（終了）')).toHaveCSS('font-weight', '400');
  await dialog.getByRole('button', { name: '紛失した物を登録', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const request = await page.evaluate(() => JSON.parse(localStorage.getItem('lost-found-no-qr-test-harness-v1')!).requests[0].value);
  expect(request.criteria).toMatchObject({ parent: 'P01', category: 'P01_WALLET', colors: ['白'], campuses: [], dateFrom: '', dateTo: '' });
  await page.getByRole('button', { name: '紛失した物を登録', exact: true }).click();
  const nextSearch = page.getByRole('dialog', { name: '検索条件' });
  await expect(nextSearch).toBeVisible();
  await expect(nextSearch.getByRole('group', { name: '種類', exact: true }).getByRole('radio', { name: 'すべて', exact: true })).toBeChecked();
  await expect(nextSearch.locator('input[required]')).toHaveCount(0);
  const savedCount = await page.evaluate(() => JSON.parse(localStorage.getItem('lost-found-no-qr-test-harness-v1')!).requests.length);
  expect(savedCount).toBe(1);
});
