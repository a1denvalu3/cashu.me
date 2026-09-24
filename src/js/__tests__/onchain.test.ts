import { describe, expect, it } from "vitest";
import {
  bitcoinUriAmountSats,
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

  it("requires whole sats when the mint uses msat", () => {
    expect(onchainDepositAmountError(1001, "msat", null)).not.toBe("");
    expect(onchainDepositAmountError(1000, "msat", null)).toBe("");
    expect(onchainDepositAmountError(1000, "usd", null)).not.toBe("");
  });
});

describe("bitcoinUriAmountSats", () => {
  it.each([
    ["amount=0.00000001", 1],
    ["amount=0.00000029", 29],
    ["AMOUNT=0.00001000", 1000],
    ["Amount=1.23456789", 123456789],
    ["amount=1", 100000000],
    ["amount=1.", 100000000],
    ["amount=.00000001", 1],
    ["amount=0.0000000100", 1],
    ["amount=21000000", 2100000000000000],
    ["amount=90071992.54740991", Number.MAX_SAFE_INTEGER],
  ])("reads %s exactly", (query, amount) => {
    expect(bitcoinUriAmountSats(new URLSearchParams(query))).toBe(amount);
  });

  it("leaves an omitted amount undefined", () => {
    expect(
      bitcoinUriAmountSats(new URLSearchParams("label=Alice"))
    ).toBeUndefined();
  });

  it.each([
    "amount=",
    "amount=.",
    "amount=0",
    "amount=-1",
    "amount=NaN",
    "amount=Infinity",
    "amount=1e-8",
    "amount=1,000",
    "amount=%2B1",
    "amount=%201",
    "amount=0.000000001",
    "amount=90071992.54740992",
    "amount=0.1&amount=0.2",
    "amount=0.1&AMOUNT=0.1",
  ])("rejects invalid or ambiguous amounts: %s", (query) => {
    expect(() => bitcoinUriAmountSats(new URLSearchParams(query))).toThrow();
  });

  it("reads amounts from address-body and query-address URIs", () => {
    for (const uri of [
      "bitcoin:bc1qaddress?amount=0.00001234",
      "bitcoin:?tb=tb1qaddress&amount=0.00001234",
    ]) {
      expect(bitcoinUriAmountSats(new URL(uri).searchParams)).toBe(1234);
    }
  });
});
