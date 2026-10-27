import { test, expect } from '@playwright/test';

test('職員一覧は旧非公開品と公開状態を表示しない', async ({page}) => {
  await page.goto('/?role=staff');
  await expect(page.getByRole('heading',{name:'保管中の拾得物',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'受付番号 4 を編集',exact:true})).toHaveCount(0);
  await expect(page.locator('.lf-list-heading')).not.toContainText('公開状態');
  await page.getByRole('button',{name:'絞り込み',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'学生への表示',exact:true})).toHaveCount(0);
});

test('学生の紛失申告は内容の確認だけで手動案内を行わない', async ({page}) => {
  await page.goto('/?role=student');
  await page.evaluate(() => {
    const key='lost-found-no-qr-test-harness-v1', db=JSON.parse(localStorage.getItem(key)!);
    db.requests=[{id:'81',author:'student-1',etag:'1',value:{email:'s260001@stu.kobe-u.ac.jp',
      criteria:{parent:'P01',category:'P01_WALLET',colors:['黒'],campuses:[],building:'',dateFrom:'',dateTo:'',query:''},
      feature:'確認用の申告内容',status:'ACTIVE',valuable:false,createdAt:'2026-10-19T00:00:00Z'}}];
    localStorage.setItem(key,JSON.stringify(db));
  });
  await page.goto('/?role=staff');
  await page.getByRole('navigation',{name:'職員メニュー'}).getByRole('button',{name:'学生の紛失申告',exact:true}).click();
  await page.locator('.lf-item-card').click();
  const dialog=page.getByRole('dialog',{name:'紛失申告の詳細',exact:true});
  await expect(dialog).toContainText('確認用の申告内容');
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:/案内|照合/})).toHaveCount(0);
});
