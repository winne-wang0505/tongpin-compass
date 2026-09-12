import { test, expect, type Page } from "@playwright/test";
async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("昵称（不必使用真实姓名）").fill("虚构测试用户");
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page
    .getByLabel("密码", { exact: true })
    .fill("Browser-Test-Password-903!");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
}
async function fill(page: Page, age: string) {
  await page.goto("/profile");
  await page.getByLabel("我的年龄").fill(age);
  await page.getByLabel("我的城市").fill("杭州");
  await page.getByLabel("我的情况").selectOption("认真交往");
  await page.getByRole("button", { name: "保存这一页" }).click();
  await expect(page.getByText("已保存到账号", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByLabel("我的情况").selectOption("不吸烟");
  await page.getByLabel("我的联系频率").fill("3");
  await page.getByRole("button", { name: "保存这一页" }).click();
  await expect(page.getByText("已保存到账号", { exact: true })).toBeVisible();
  await page.goto("/preferences");
  await page.getByLabel("对我有多重要").nth(0).selectOption("prefer");
  await page.getByLabel("可接受的最低值").fill("25");
  await page.getByLabel("可接受的最高值").fill("35");
  await page.getByLabel("对我有多重要").nth(2).selectOption("must");
  await page.getByRole("checkbox", { name: "认真交往", exact: true }).check();
  await page.getByRole("button", { name: "保存这一页" }).click();
  await expect(page.getByText("已保存到账号", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByLabel("对我有多重要").nth(0).selectOption("must");
  await page.getByRole("checkbox", { name: "不吸烟", exact: true }).check();
  await page.getByRole("button", { name: "保存这一页" }).click();
  await expect(page.getByText("已保存到账号", { exact: true })).toBeVisible();
}
async function consent(page: Page) {
  for (const label of ["年龄", "关系目标", "吸烟习惯"])
    await page.getByRole("checkbox", { name: label, exact: true }).check();
  await page.getByRole("checkbox", { name: /我已核对/ }).check();
  await page.getByRole("button", { name: "同意本次分享" }).click();
  await expect(
    page.getByText("你已同意这份快照。等待另一方完成后即可生成报告。"),
  ).toBeVisible();
}
test("two adult accounts finish mobile flow and revocation removes report access", async ({
  browser,
}) => {
  const a = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    b = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ap = await a.newPage(),
    bp = await b.newPage();
  const errors: string[] = [];
  ap.on("pageerror", (e) => errors.push(e.message));
  bp.on("pageerror", (e) => errors.push(e.message));
  const nonce = Date.now();
  await register(ap, `browser-a-${nonce}@example.com`);
  await fill(ap, "28");
  await register(bp, `browser-b-${nonce}@example.com`);
  await fill(bp, "40");
  await ap.goto("/dashboard");
  await ap.getByRole("button", { name: "创建私密邀请" }).click();
  await expect(ap).toHaveURL(/invite\//);
  const invUrl = ap.url();
  const link = await ap.getByLabel("私密邀请链接").inputValue();
  await bp.goto(link);
  await bp.getByRole("button", { name: "接受邀请" }).click();
  await expect(bp).toHaveURL(/invite\//);
  await ap.reload();
  await consent(ap);
  await consent(bp);
  await bp.getByRole("button", { name: "生成双向匹配报告" }).click();
  await expect(bp).toHaveURL(/report\//);
  const reportUrl = bp.url();
  await expect(
    bp.getByRole("heading", { name: "把差异，变成对话" }),
  ).toBeVisible();
  await expect(bp.getByText("有差异", { exact: true })).toBeVisible();
  await bp.screenshot({
    path: "test-results/report-mobile.png",
    fullPage: true,
  });
  expect(
    await bp.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await bp.reload();
  await expect(
    bp.getByRole("heading", { name: "把差异，变成对话" }),
  ).toBeVisible();
  await ap.goto(reportUrl);
  await expect(
    ap.getByRole("heading", { name: "把差异，变成对话" }),
  ).toBeVisible();
  await ap.goto("/settings");
  await ap.getByRole("button", { name: "退出登录" }).click();
  await ap
    .getByLabel("邮箱", { exact: true })
    .fill(`browser-a-${nonce}@example.com`);
  await ap
    .getByLabel("密码", { exact: true })
    .fill("Browser-Test-Password-903!");
  await ap.getByRole("button", { name: "登录", exact: true }).click();
  await expect(ap).toHaveURL(/dashboard/);
  await ap.goto(reportUrl);
  await expect(
    ap.getByRole("heading", { name: "把差异，变成对话" }),
  ).toBeVisible();
  await ap.goto(invUrl);
  ap.once("dialog", (d) => d.accept());
  await ap.getByRole("button", { name: "撤销邀请 / 撤回授权" }).click();
  await expect(ap.getByText("已撤销", { exact: true })).toBeVisible();
  await bp.reload();
  await expect(
    bp.getByRole("heading", { name: "无法访问这份报告" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await a.close();
  await b.close();
});
test("home, example and 320px forms render without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /先了解自己/ })).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  for (const path of ["/", "/register", "/example", "/privacy", "/forgot"]) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      path,
    ).toBe(true);
  }
  await expect(page.getByText(/当前环境未配置邮件服务/)).toBeVisible();
});
