import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentMethod } from "src/stores/walletTypes";

const stores = vi.hoisted(() => ({
  notifyError: vi.fn(),
  wallet: { invoiceHistory: [] as any[] },
  mints: {
    activeMintUrl: "https://mint.example",
    activeUnit: "sat",
    mints: [] as any[],
  },
}));

vi.mock("src/js/notify", () => ({
  notifyError: stores.notifyError,
}));

vi.mock("src/stores/wallet", () => ({
  useWalletStore: () => stores.wallet,
}));

vi.mock("src/stores/mints", () => ({
  useMintsStore: () => stores.mints,
}));

let CreateInvoiceDialog: any;

beforeAll(async () => {
  (globalThis as any).windowMixin = {};
  CreateInvoiceDialog = (await import("../CreateInvoiceDialog.vue")).default;
});

describe("CreateInvoiceDialog", () => {
  beforeEach(() => {
    stores.wallet.invoiceHistory = [];
    stores.notifyError.mockClear();
  });

  it("uses the amount-first flow when showing the Lightning address is disabled", () => {
    const showNpubCashPreview =
      CreateInvoiceDialog.computed.showNpubCashPreview;

    expect(
      showNpubCashPreview.call({
        showCreateInvoiceDialog: true,
        isOnchain: false,
        isBolt12: false,
        activeUnit: "sat",
        npubCashAddAmount: false,
        hasConfiguredNpubCashAddress: true,
        showAddressOnReceive: false,
        activeMintUrl: "https://mint.example",
        npubCashMintUrl: "https://mint.example",
      })
    ).toBe(false);
  });

  it("shows the Lightning address preview by default when it is enabled", () => {
    const showNpubCashPreview =
      CreateInvoiceDialog.computed.showNpubCashPreview;

    expect(
      showNpubCashPreview.call({
        showCreateInvoiceDialog: true,
        isOnchain: false,
        isBolt12: false,
        activeUnit: "sat",
        npubCashAddAmount: false,
        hasConfiguredNpubCashAddress: true,
        showAddressOnReceive: true,
        activeMintUrl: "https://mint.example",
        npubCashMintUrl: "https://mint.example",
      })
    ).toBe(true);
  });

  it("asks for an amount when no reusable on-chain quote exists", () => {
    const context: any = {
      isOnchain: true,
      isBolt12: false,
      showNpubCashPreview: false,
      onchainAddAmount: false,
      reusableOnchainQuote: null,
      reusableReceiveQuote: null,
    };
    context.showAmountInput =
      CreateInvoiceDialog.computed.showAmountInput.call(context);
    expect(context.showAmountInput).toBe(true);
    expect(CreateInvoiceDialog.computed.showReusableQuote.call(context)).toBe(
      false
    );
  });

  it("reuses the pending address and asks for an amount only when creating a new one", async () => {
    const quote = { request: "bc1qexisting", amount: 0, status: "pending" };
    const context: any = {
      isOnchain: true,
      isBolt12: false,
      onchainSupported: true,
      onchainAddAmount: false,
      reusableOnchainQuote: quote,
      reusableReceiveQuote: quote,
      invoiceData: { amount: 0 },
      onchainAmountError: "Enter a positive whole amount in sat.",
      activeWallet: vi.fn(),
      requestMintOnchain: vi.fn(),
      $nextTick: (callback: () => void) => callback(),
    };
    context.showAmountInput =
      CreateInvoiceDialog.computed.showAmountInput.call(context);
    context.showReusableQuote =
      CreateInvoiceDialog.computed.showReusableQuote.call(context);
    context.reusableQrValue =
      CreateInvoiceDialog.computed.reusableQrValue.call(context);
    context.canCreate = CreateInvoiceDialog.computed.canCreate.call(context);

    expect(context.showAmountInput).toBe(false);
    expect(CreateInvoiceDialog.computed.qrPreview.call(context)).toMatchObject({
      value: quote.request,
      text: quote.request,
    });
    expect(CreateInvoiceDialog.computed.createButtonLabel.call(context)).toBe(
      "Create New Address"
    );

    await CreateInvoiceDialog.methods.requestMintButton.call(context);

    expect(context.activeWallet).not.toHaveBeenCalled();
    expect(context.requestMintOnchain).not.toHaveBeenCalled();
    expect(context.invoiceData.amount).toBe("");
    context.showAmountInput =
      CreateInvoiceDialog.computed.showAmountInput.call(context);
    context.showReusableQuote =
      CreateInvoiceDialog.computed.showReusableQuote.call(context);
    expect(context.showAmountInput).toBe(true);
    expect(CreateInvoiceDialog.computed.qrPreview.call(context)).toBeNull();
    expect(CreateInvoiceDialog.computed.canCreate.call(context)).toBe(false);
  });

  it("retains the existing quote reuse eligibility rules", () => {
    const pending = {
      type: PaymentMethod.Onchain,
      amount: 0,
      status: "pending",
      mint: stores.mints.activeMintUrl,
      unit: stores.mints.activeUnit,
      request: "bc1qexisting",
      mintQuote: { expiry: 0 },
    };
    const newest = { ...pending, request: "bc1qnewest" };
    stores.wallet.invoiceHistory = [
      pending,
      newest,
      { ...pending, status: "paid" },
      { ...pending, amount: -1000 },
      { ...pending, mint: "https://other-mint.example" },
      { ...pending, unit: "msat" },
      { ...pending, request: "" },
      { ...pending, type: PaymentMethod.Bolt12 },
      { ...pending, mintQuote: { expiry: Date.now() / 1000 - 10 } },
    ];
    expect(CreateInvoiceDialog.methods.findReusableOnchainQuotes()).toEqual([
      newest,
      pending,
    ]);
  });

  it.each([0, -1, 999, 5001, 1000.5, NaN, Infinity])(
    "blocks invalid on-chain amount %s, including keyboard submission",
    async (amount) => {
      const context: any = {
        isOnchain: true,
        onchainSupported: true,
        invoiceData: { amount },
        activeUnit: "sat",
        activeUnitCurrencyMultiplyer: 1,
        activeMint: {
          info: {
            nuts: {
              4: {
                methods: [
                  {
                    method: "bolt11",
                    unit: "sat",
                    min_amount: 1,
                    max_amount: 1000000,
                  },
                  {
                    method: "onchain",
                    unit: "sat",
                    min_amount: 1000,
                    max_amount: 5000,
                  },
                ],
              },
            },
          },
        },
        activeWallet: vi.fn(),
        requestMintOnchain: vi.fn(),
      };
      context.onchainAmountError =
        CreateInvoiceDialog.computed.onchainAmountError.call(context);
      context.canCreate = CreateInvoiceDialog.computed.canCreate.call(context);
      expect(context.onchainAmountError).not.toBe("");
      expect(context.canCreate).toBe(false);
      await CreateInvoiceDialog.methods.requestMintButton.call(context);
      expect(context.activeWallet).not.toHaveBeenCalled();
      expect(context.requestMintOnchain).not.toHaveBeenCalled();
    }
  );

  it("revalidates the amount against the selected mint and unit", () => {
    const context: any = {
      isOnchain: true,
      invoiceData: { amount: 1000 },
      activeUnit: "sat",
      activeUnitCurrencyMultiplyer: 1,
      activeMint: {
        info: {
          nuts: {
            4: {
              methods: [
                {
                  method: "onchain",
                  unit: "sat",
                  min_amount: 1000,
                  max_amount: 5000,
                },
                {
                  method: "onchain",
                  unit: "msat",
                  min_amount: 2000,
                  max_amount: 5000000,
                },
              ],
            },
          },
        },
      },
    };
    const error = () =>
      CreateInvoiceDialog.computed.onchainAmountError.call(context);
    expect(error()).toBe("");
    context.invoiceData.amount = 5000;
    expect(error()).toBe("");
    context.invoiceData.amount = 1000;
    context.activeUnit = "msat";
    expect(error()).toContain("2000 msat");
    context.activeMint = {
      info: {
        nuts: {
          4: {
            methods: [{ method: "onchain", unit: "msat", min_amount: 10000 }],
          },
        },
      },
    };
    expect(error()).toContain("10000 msat");
  });

  describe("validating before on-chain quote creation", () => {
    let context: any;
    let mintWallet: any;
    let mint: any;

    beforeEach(() => {
      mint = {
        url: "https://mint.example",
        info: {
          nuts: {
            4: {
              methods: [
                {
                  method: "onchain",
                  unit: "sat",
                  min_amount: 1000,
                  max_amount: 5000,
                },
              ],
            },
          },
        },
      };
      mintWallet = { mint: { mintUrl: mint.url }, unit: "sat" };
      context = {
        canCreate: true,
        isOnchain: true,
        invoiceData: { amount: 1234 },
        activeUnitCurrencyMultiplyer: 1,
        mints: [mint],
        activeWallet: vi.fn().mockResolvedValue(mintWallet),
        requestMintOnchain: vi.fn().mockResolvedValue({ quote: "onchain-q" }),
        mintOnPaidOnchain: vi.fn(),
      };
    });

    it.each([1000, 5000])(
      "accepts inclusive boundary %s using the existing quote API",
      async (amount) => {
        context.invoiceData.amount = amount;
        await CreateInvoiceDialog.methods.requestMintButton.call(context);
        expect(context.requestMintOnchain).toHaveBeenCalledExactlyOnceWith(
          mintWallet
        );
        expect(context.showInvoiceDetails).toBe(true);
        expect(context.createInvoiceButtonBlocked).toBe(false);
      }
    );

    it("checks limits again after refreshing the mint", async () => {
      context.activeWallet.mockImplementation(async () => {
        mint.info.nuts[4].methods[0].min_amount = 2000;
        return mintWallet;
      });
      await CreateInvoiceDialog.methods.requestMintButton.call(context);
      expect(context.requestMintOnchain).not.toHaveBeenCalled();
      expect(stores.notifyError).toHaveBeenCalledWith(
        "Enter at least 2000 sat."
      );
      expect(context.createInvoiceButtonBlocked).toBe(false);
    });

    it("validates against the quote wallet's mint if the active mint changes", async () => {
      context.activeMintUrl = "https://other-mint.example";
      context.mints.push({
        url: context.activeMintUrl,
        info: {
          nuts: {
            4: { methods: [{ method: "onchain", unit: "sat", min_amount: 1 }] },
          },
        },
      });
      context.invoiceData.amount = 999;
      await CreateInvoiceDialog.methods.requestMintButton.call(context);
      expect(context.requestMintOnchain).not.toHaveBeenCalled();
      expect(stores.notifyError).toHaveBeenCalledWith(
        "Enter at least 1000 sat."
      );
    });

    it("does not create a quote if the refreshed mint disables deposits", async () => {
      context.activeWallet.mockImplementation(async () => {
        mint.info.nuts[4].disabled = true;
        return mintWallet;
      });
      await CreateInvoiceDialog.methods.requestMintButton.call(context);
      expect(context.requestMintOnchain).not.toHaveBeenCalled();
      expect(stores.notifyError).toHaveBeenCalledWith(
        expect.stringContaining("does not support")
      );
    });
  });
});
