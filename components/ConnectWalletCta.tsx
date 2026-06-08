"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function ConnectWalletCta() {
  return (
    <ConnectButton.Custom>
      {({ openConnectModal, mounted }) => (
        <button
          type="button"
          disabled={!mounted}
          onClick={openConnectModal}
          className="focus-ring inline-flex items-center justify-center rounded-lg bg-base-blue px-5 py-3 font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Connect wallet
        </button>
      )}
    </ConnectButton.Custom>
  );
}
