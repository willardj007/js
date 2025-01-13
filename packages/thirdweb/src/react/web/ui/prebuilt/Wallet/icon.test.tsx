import { describe, expect, it } from "vitest";
import { render, waitFor } from "~test/react-render.js";
import { SocialIcon, WalletIcon, fetchWalletImage } from "./icon.js";
import { WalletProvider } from "./provider.js";

describe("WalletIcon", () => {
  it("should fetch wallet image", async () => {
    expect(await fetchWalletImage({ id: "io.metamask" })).toMatchInlineSnapshot(
      `"data:image/webp;base64,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"`,
    );
  });

  it("should throw error if WalletId is not supported", async () => {
    await expect(() =>
      // @ts-ignore For test
      fetchWalletImage({ id: "__undefined__" }),
    ).rejects.toThrowError("Wallet with id __undefined__ not found");
  });

  it("should render an image", async () => {
    const { container } = render(
      <WalletProvider id="io.cosmostation">
        <WalletIcon />
      </WalletProvider>,
    );
    await waitFor(() => {
      expect(container.querySelector("img")).not.toBe(null);
    });
  });
});

describe("SocialIcon", () => {
  it("should render an image", async () => {
    const { container } = render(<SocialIcon provider="google" />);
    await waitFor(() => {
      expect(container.querySelector("img")).not.toBe(null);
    });
  });
});
