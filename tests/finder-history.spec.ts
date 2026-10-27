import { test, expect } from '@playwright/test';
for (const width of [390, 1200]) {
  test(`拾得者の登録とありがとうを表示しない（${width}px）`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await page.goto('/?role=student');
    await expect(page.locator('.lf-item-card').first()).toBeVisible();
    await expect(page.getByRole('button',{name:'拾った物',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'拾った物を登録',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'ありがとう',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'お礼を見る',exact:true})).toHaveCount(0);
    await expect(page.getByRole('navigation',{name:'学生メニュー'}).getByRole('button')).toHaveCount(4);
  });
}
