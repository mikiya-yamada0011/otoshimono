import { test, expect } from '@playwright/test';

for (const width of [390, 1200]) {
  test(`学生タブは重複見出しを置かず返却履歴を表示する（${width}px）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/?role=student');
    await expect(page.locator('.lf-item-card').first()).toBeVisible();
    const nav = page.getByRole('navigation', { name: '学生メニュー' });
    await expect(nav.getByRole('button', { name: '履歴', exact: true })).toHaveCount(0);
    for (const label of ['紛失した物', 'お知らせ', '返却履歴', 'ありがとう']) {
      const tab = nav.getByRole('button', { name: label, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-current', 'page');
      const main = page.getByRole('main', { name: label, exact: true });
      await expect(main).toBeVisible();
      await expect(main.getByRole('heading', { name: label, exact: true })).toHaveCount(0);
      await expect(main.locator('.lf-page-title')).toHaveCount(0);
      if (label === '紛失した物') {
        await expect(main.getByRole('button', { name: '紛失した物を登録', exact: true })).toBeVisible();
        const actions = (await main.locator('.lf-page-actions').boundingBox())!;
        const panel = (await main.boundingBox())!;
        expect(actions.y - panel.y).toBeLessThan(35);
      }
    }
    await nav.getByRole('button', { name: '紛失した物', exact: true }).click();
    await page.getByRole('button', { name: '紛失した物を登録', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '検索条件', exact: true })).toBeVisible();
  });
}
