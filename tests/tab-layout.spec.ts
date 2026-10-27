import {test,expect} from '@playwright/test';
for(const width of [390,1200]) test(`学生メニューは3項目で、空の対応中から検索へ戻れる（${width}px）`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/?role=student');
 const nav=page.getByRole('navigation',{name:'学生メニュー'});
 await expect(nav.getByRole('button')).toHaveCount(3);
 for(const label of ['紛失した物','お知らせ']) {
  await nav.getByRole('button',{name:label,exact:true}).click();
  const main=page.getByRole('main',{name:label,exact:true});await expect(main).toBeVisible();
  await expect(main.getByRole('heading',{name:label,exact:true})).toHaveCount(0);
 }
 await nav.getByRole('button',{name:'紛失した物',exact:true}).click();
 await expect(page.getByRole('button',{name:'紛失した物を登録',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'落とし物を探す',exact:true}).click();
 await expect(nav.getByRole('button',{name:'探す',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('dialog')).toHaveCount(0);
});
