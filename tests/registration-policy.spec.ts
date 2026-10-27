import { test, expect } from '@playwright/test';
import { CATEGORY_GROUPS, REGISTRATION_POLICY, registrationCategoryGroups } from '../src/webparts/lostFoundStudent/found-items/utils/categories';

test('個別登録の24種類と一般品・窓口対象外の線引きは共通ポリシーに従う', () => {
  const codes = registrationCategoryGroups().flatMap(group => group.children.map(child => child.code));
  expect(codes.sort()).toEqual([...REGISTRATION_POLICY.individualCategories].sort());
  expect(codes).toContain('P02_EARPHONE_WIRED');
  expect(codes).toContain('P02_EARPHONE_WIRELESS');
  expect(codes).toHaveLength(24);
  for (const code of ['P08_MEDICAL','P12_SEAL','P12_OTHER','P09_MUSIC']) {
    expect(codes).not.toContain(code);
    expect(registrationCategoryGroups(code).flatMap(group => group.children.map(child => child.code))).not.toContain(code);
  }
  expect(codes).not.toContain('P03_BACKPACK');
  expect(codes).not.toContain('P05_UMBRELLA_LONG');
  expect(registrationCategoryGroups('',true).flatMap(group => group.children.map(child => child.code))).not.toContain('P09_BICYCLE');
  expect(registrationCategoryGroups('P05_UMBRELLA_LONG').find(group => group.code==='P05')?.children.map(child => child.code)).toEqual(['P05_UMBRELLA_LONG']);
  expect(CATEGORY_GROUPS.find(group => group.code==='P05')?.children.length).toBeGreaterThan(1);
});

for (const width of [320, 1200]) {
  test(`学生の簡潔な検索タブ・検索のカテゴリを確認する（${width}px）`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await page.goto('/?role=student');
    await expect(page.getByRole('button',{name:'個別登録',exact:true})).toBeVisible();
    await expect(page.getByText(/原則7日で警察へ移管|以前に1点ずつ登録/)).toHaveCount(0);
    await expect(page.getByText('貴重品など｜7日以降に警察へ移管',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'写真掲載',exact:true}).click();
    await expect(page.getByText('その他｜3か月以上保管後に処分',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'個別登録',exact:true}).click();
    await page.getByRole('button',{name:'絞り込み',exact:true}).click();
    const filters=page.getByRole('dialog');
    await expect(filters.getByRole('radio',{name:'生活・医療・化粧品',exact:true})).toHaveCount(0);
    await expect(filters.getByRole('radio',{name:'印鑑',exact:true})).toHaveCount(0);
    await expect(filters.getByRole('radio',{name:'薬・医療用品',exact:true})).toHaveCount(0);
    await expect(filters.getByRole('radio',{name:'傘・雨具',exact:true})).toHaveCount(0);
    await filters.getByRole('radio',{name:'スマホ・電子機器',exact:true}).check();
    await expect(filters.getByRole('radio',{name:'有線イヤホン・ヘッドホン',exact:true})).toBeVisible();
    await expect(filters.getByRole('radio',{name:'充電器・ケーブル・アダプター',exact:true})).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect(await page.locator('body').evaluate(element => element.scrollWidth)).toBe(width);
  });
}

test('職員は警察へ移管する品物を登録し、公開状態と拾得者メールを入力しない', async ({page}) => {
  await page.goto('/?role=staff');
  await page.getByRole('button',{name:'＋ 拾得物を登録',exact:true}).click();
  await expect(page.getByRole('radio',{name:'傘・雨具',exact:true})).toBeVisible();
  await expect(page.getByRole('checkbox',{name:/非公開|公開する/})).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'拾得者の学校メール（任意）',exact:true})).toHaveCount(0);
  await expect(page.getByText(/7日で警察へ移管/)).toBeVisible();
});
