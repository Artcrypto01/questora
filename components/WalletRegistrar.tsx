"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { getOrCreateUser } from "@/lib/quest-service";

export function WalletRegistrar() {
  const { address, isConnected } = useAccount();

  useEffect(() => {
    if (!isConnected || !address) return;
    getOrCreateUser(address).catch((error) => {
      console.error("Failed to register wallet", error);
    });
  }, [address, isConnected]);

  return null;
}
