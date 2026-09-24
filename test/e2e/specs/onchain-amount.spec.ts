import { expect, test } from "../fixtures/test";
import { MINT_A_URL, counterpartyRequest } from "../fixtures/mint";
import { disableAutomaticChecks, holdIncomingQuote } from "../fixtures/ui";
import { WalletUi } from "../pages/WalletUi";

test.use({ viewport: { width: 390, height: 844 } });

test("requires an in-range on-chain amount and preserves its payment URI in history", async ({
  page,
}) => {
  const wallet = new WalletUi(page);
  await wallet.goto();
  // Advertise a distinct on-chain range while retaining the real mint API.
  await page.route(`${MINT_A_URL}/v1/info`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    for (const method of body.nuts[4].methods) {
      if (method.method === "onchain" && method.unit === "sat") {
        method.min_amount = 1000;
        method.max_amount = 5000;
      }
    }
    await route.fulfill({ response, json: body });
  });
  await wallet.onboard(MINT_A_URL);
  await disableAutomaticChecks(wallet);
  await holdIncomingQuote(wallet, MINT_A_URL, "onchain");
  await wallet.openReceive("onchain");
  const create = page.getByTestId("create-payment-request");
  const error = page.getByTestId("onchain-amount-error");
  let submissions = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url() === `${MINT_A_URL}/v1/mint/quote/onchain`
    )
      submissions++;
  });
  await expect(create).toBeDisabled();
  await expect(page.locator(".qr-container:visible")).toHaveCount(0);
  await wallet.enterAmount(999);
  await expect(error).toContainText("at least 1000 sat");
  await expect(create).toBeDisabled();
  // Move focus off the last keypad button before using the physical keyboard.
  await page.locator(".amount-display:visible").click();
  await page.keyboard.press("Enter");
  expect(submissions).toBe(0);
  for (let i = 0; i < 3; i++) await page.keyboard.press("Backspace");
  await wallet.enterAmount(5001);
  await expect(error).toContainText("no more than 5000 sat");
  await expect(create).toBeDisabled();
  // Move focus off the last keypad button before using the physical keyboard.
  await page.locator(".amount-display:visible").click();
  await page.keyboard.press("Enter");
  expect(submissions).toBe(0);
  await page.keyboard.press("Backspace");
  await wallet.enterAmount(0);
  await expect(create).toBeEnabled();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
  await wallet.enterAmount(1000);
  await expect(create).toBeEnabled();
  await expect(create).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("amount-entry.png") });
  const created = page.waitForResponse(
    (response) =>
      response.url() === `${MINT_A_URL}/v1/mint/quote/onchain` &&
      response.request().method() === "POST"
  );
  await create.click();
  const quote = await (await created).json();
  const uri = quote.request.startsWith("tb1")
    ? `bitcoin:?tb=${quote.request}&amount=0.00001000`
    : `bitcoin:${quote.request}?amount=0.00001000`;
  const qrLink = page.locator(".qr-container:visible a");
  await expect(qrLink).toHaveAttribute("href", uri);
  await page.locator(".qr-copy-text:visible").click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(uri);
  expect(submissions).toBe(1);
  await wallet.closeFullscreenDialog();
  await wallet.openReceive("onchain");
  await expect(create).toBeDisabled();
  await expect(page.locator(".qr-container:visible")).toHaveCount(0);
  await wallet.closeFullscreenDialog();
  await page.reload();
  await wallet.home("History");
  await page
    .getByTestId("history-row")
    .first()
    .getByTestId("history-details")
    .click();
  await expect(qrLink).toHaveAttribute("href", uri);
});

test("pays BIP321 on-chain URIs using their encoded amounts", async ({
  page,
  request,
}) => {
  const wallet = new WalletUi(page);
  await wallet.onboard(MINT_A_URL);
  await wallet.mintBolt11(100);

  for (const queryAddress of [false, true]) {
    const address = await counterpartyRequest(request, "onchain");
    const key = address.startsWith("tb1") ? "tb" : "bc";
    const uri = queryAddress
      ? `BITCOIN:?${key.toUpperCase()}=${address}&AMOUNT=0.00000029`
      : `bitcoin:${address}?amount=0.00000029`;
    const before = await wallet.balanceSats();
    await wallet.openSend("onchain");
    const quoted = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url() === `${MINT_A_URL}/v1/melt/quote/onchain`
    );
    // No manual amount entry: reading the URI should prepare the payment.
    await wallet.quoteRequest(uri);
    expect((await quoted).postDataJSON()).toMatchObject({
      request: address,
      amount: 29,
      unit: "sat",
    });
    await expect(page.getByTestId("quote-payment-request")).toBeHidden();
    await expect.poll(() => wallet.balanceSats()).toBe(before);
    await page.getByTestId("pay-payment-request").click();
    await expect(page.getByText("Paid", { exact: false })).toBeVisible();
    // The fake backend charges a one-sat fee.
    await expect.poll(() => wallet.balanceSats()).toBe(before - 30);
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }
});
