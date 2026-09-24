import { describe, expect, it } from "vitest";
import {
  onchainDepositAmountError,
  onchainAddressExplorerUrl,
} from "src/js/onchain";

describe("onchainAddressExplorerUrl", () => {
  it("returns the mainnet Mempool address page", () => {
    expect(onchainAddressExplorerUrl("bc1qexampleaddress")).toBe(
      "https://mempool.space/address/bc1qexampleaddress"
    );
  });

  it("normalizes bitcoin URIs and selects the Mutinynet explorer", () => {
    expect(
      onchainAddressExplorerUrl("bitcoin:tb1qexampleaddress?amount=1")
    ).toBe("https://mutinynet.com/address/tb1qexampleaddress");
  });

  it("does not return an explorer URL for an unrecognized address", () => {
    expect(onchainAddressExplorerUrl("invalid-address")).toBeNull();
  });
});

describe("onchainDepositAmountError", () => {
  it.each([1, 1000, 5000])(
    "accepts positive amounts without advertised limits: %s",
    (amount) => {
      expect(onchainDepositAmountError(amount, "sat", null)).toBe("");
    }
  );

  it("enforces one-sided and inclusive limits", () => {
    expect(
      onchainDepositAmountError(999, "sat", {
        minAmount: 1000,
        maxAmount: null,
      })
    ).not.toBe("");
    expect(
      onchainDepositAmountError(1000, "sat", {
        minAmount: 1000,
        maxAmount: null,
      })
    ).toBe("");
    expect(
      onchainDepositAmountError(5000, "sat", {
        minAmount: null,
        maxAmount: 5000,
      })
    ).toBe("");
    expect(
      onchainDepositAmountError(5001, "sat", {
        minAmount: null,
        maxAmount: 5000,
      })
    ).not.toBe("");
    expect(
      onchainDepositAmountError(1, "sat", { minAmount: null, maxAmount: 0 })
    ).not.toBe("");
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid amount %s",
    (amount) => {
      expect(onchainDepositAmountError(amount, "sat", null)).not.toBe("");
    }
  );

  it.each(["sat", "msat", "usd"])(
    "uses the mint's %s limits without adding currency restrictions",
    (unit) => {
      const limits = { minAmount: 1000, maxAmount: 5000 };
      expect(onchainDepositAmountError(1001, unit, limits)).toBe("");
      expect(onchainDepositAmountError(999, unit, limits)).not.toBe("");
    }
  );
});
