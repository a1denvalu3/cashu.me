import { beforeAll, describe, expect, it, vi } from "vitest";

const stores = vi.hoisted(() => ({
  wallet: { invoiceHistory: [] as any[] },
  mints: {
    activeMintUrl: "https://mint.example",
    activeUnit: "sat",
    mints: [] as any[],
  },
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

  it("always asks for an amount when receiving on-chain", () => {
    const context = {
      isOnchain: true,
      isBolt12: false,
      showNpubCashPreview: false,
      reusableBolt12Offer: { request: "lno1offer" },
    };
    expect(CreateInvoiceDialog.computed.showAmountInput.call(context)).toBe(
      true
    );
    expect(CreateInvoiceDialog.computed.showReusableQuote.call(context)).toBe(
      false
    );
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

  it("passes the chosen on-chain amount to quote creation", async () => {
    const mintWallet = {};
    const context: any = {
      canCreate: true,
      isOnchain: true,
      invoiceData: { amount: 1234 },
      activeUnitCurrencyMultiplyer: 1,
      activeWallet: vi.fn().mockResolvedValue(mintWallet),
      requestMintOnchain: vi.fn().mockResolvedValue({ quote: "onchain-q" }),
      mintOnPaidOnchain: vi.fn(),
    };
    await CreateInvoiceDialog.methods.requestMintButton.call(context);
    expect(context.requestMintOnchain).toHaveBeenCalledWith(1234, mintWallet);
    expect(context.showInvoiceDetails).toBe(true);
    expect(context.createInvoiceButtonBlocked).toBe(false);
  });
});
