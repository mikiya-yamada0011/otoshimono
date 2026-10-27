import { expect, test } from "@playwright/test";

for (const width of [390, 1200]) {
  test(`拾得物の写真は窓口と受付日で探せ、拡大できる（${width}px）`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("https://photos.example.invalid/**", (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
          "base64",
        ),
      }),
    );
    await page.goto("/?role=student");
    await expect(page.locator(".lf-item-card").first()).toBeVisible();
    await page.evaluate(() => {
      const key = "lost-found-no-qr-test-harness-v1";
      const db = JSON.parse(localStorage.getItem(key)!);
      db.photoBatches = [
        {
          id: "1",
          author: "staff-1",
          value: {
            window: "工学部事務室",
            receivedOn: "2026-10-10",
            photos: [
              {
                name: "photo-1.jpg",
                url: "https://photos.example.invalid/one.jpg",
              },
              {
                name: "photo-2.jpg",
                url: "https://photos.example.invalid/two.jpg",
              },
            ],
          },
        },
        {
          id: "2",
          author: "staff-1",
          value: {
            window: "農学部事務室",
            receivedOn: "2026-10-11",
            photos: [
              {
                name: "photo-3.jpg",
                url: "https://photos.example.invalid/three.jpg",
              },
            ],
          },
        },
        {
          id: "3",
          author: "staff-1",
          value: {
            window: "文学部事務室",
            receivedOn: "2026-10-11",
            photos: [
              {
                name: "photo-4.jpg",
                url: "https://photos.example.invalid/four.jpg",
              },
              {
                name: "photo-5.jpg",
                url: "https://photos.example.invalid/five.jpg",
              },
              {
                name: "photo-6.jpg",
                url: "https://photos.example.invalid/six.jpg",
              },
            ],
          },
        },
      ];
      localStorage.setItem(key, JSON.stringify(db));
    });
    await page
      .getByRole("button", { name: "写真掲載", exact: true })
      .click();
    await expect(page.locator(".lf-daily-photo-day")).toHaveCount(2);
    await expect(page.locator(".lf-daily-photo-grid")).toHaveCount(3);
    const latestDay = page.locator(".lf-daily-photo-day").first();
    await expect(
      latestDay.getByRole("heading", { name: "2026/10/11 受付", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "2026/10/11 受付", exact: true }),
    ).toHaveCount(1);
    await expect(latestDay.locator(".lf-daily-photo-window")).toHaveCount(2);
    await expect(latestDay).toContainText("農学部事務室");
    await expect(latestDay).toContainText("文学部事務室");
    await expect(page.locator(".lf-daily-photo-day").nth(1)).toContainText(
      "2026/10/10 受付",
    );
    await expect(
      page.getByRole("heading", { name: "拾得物の写真 3件", exact: true }),
    ).toBeVisible();
    // 同じ日・同じ写真番号でも、選んだ窓口の画像を拡大する。
    for (const [window, url] of [
      ["農学部事務室", "three.jpg"],
      ["文学部事務室", "four.jpg"],
    ]) {
      await page
        .getByRole("button", {
          name: `${window}・2026-10-11受付の写真1を拡大`,
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(window);
      await expect(dialog.locator("img")).toHaveAttribute(
        "src",
        `https://photos.example.invalid/${url}`,
      );
      await page.keyboard.press("Escape");
    }
    await expect(
      page.getByRole("textbox", { name: "キーワードで探す" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "紛失した物を登録", exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel("掲載窓口", { exact: true })
      .selectOption("工学部事務室");
    await expect(page.locator(".lf-daily-photo-grid")).toHaveCount(1);
    await expect(page.locator(".lf-photo-open")).toHaveCount(2);
    await expect(page.locator(".lf-daily-photo-day")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "拾得物の写真 1件", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "工学部事務室・2026-10-10受付の写真1を拡大",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("工学部事務室");
    await expect(dialog.locator("img")).toHaveAttribute(
      "src",
      "https://photos.example.invalid/one.jpg",
    );
    await expect
      .poll(() =>
        dialog
          .locator("img")
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(
      dialog.getByRole("button", { name: "受け取りを申し込む" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.getByLabel("受付日（開始）", { exact: true }).fill("2026-10-11");
    await expect(
      page.getByText("この条件の写真はありません", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("受付日（終了）", { exact: true }).fill("2026-10-10");
    await expect(page.getByRole("alert")).toContainText(
      "受付日の開始は終了以前",
    );
    await expect(page.locator(".lf-daily-photo-day")).toHaveCount(0);
    await page.getByLabel("受付日（終了）", { exact: true }).fill("2026-10-11");
    await page.getByLabel("掲載窓口", { exact: true }).selectOption("");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.locator(".lf-daily-photo-day")).toHaveCount(1);
    await expect(page.locator(".lf-daily-photo-window")).toHaveCount(2);
    await expect(
      page.getByRole("heading", { name: "2026/10/11 受付", exact: true }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: "個別登録", exact: true })
      .click();
    await expect(page.locator(".lf-item-card").first()).toBeVisible();
    expect(await page.locator("body").evaluate((el) => el.scrollWidth)).toBe(
      width,
    );
  });
}

test("日別写真の未接続・不正データを空一覧に見せず再試行できる", async ({
  page,
}) => {
  await page.goto("/?role=student");
  await expect(page.locator(".lf-item-card").first()).toBeVisible();
  await page.evaluate(() => {
    const key = "lost-found-no-qr-test-harness-v1",
      db = JSON.parse(localStorage.getItem(key)!);
    db.photoBatches = [
      {
        id: "1",
        author: "staff-1",
        value: { window: "工学部事務室", receivedOn: "invalid", photos: [] },
      },
    ];
    localStorage.setItem(key, JSON.stringify(db));
  });
  await page
    .getByRole("button", { name: "写真掲載", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "拾得物の写真を読み込めませんでした",
  );
  await page.evaluate(() => {
    const key = "lost-found-no-qr-test-harness-v1",
      db = JSON.parse(localStorage.getItem(key)!);
    db.photoBatches = [];
    localStorage.setItem(key, JSON.stringify(db));
  });
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect(
    page.getByText("現在、掲載中の写真はありません", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
