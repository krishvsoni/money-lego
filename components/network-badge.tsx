export function NetworkBadge() {
  const mainnet = process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet-beta";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        mainnet ? "bg-success-wash text-success" : "bg-attention-wash text-attention"
      }`}
      title={mainnet ? "Real funds. Transactions are final." : "Test network. Tokens have no value."}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {mainnet ? "Mainnet" : "Devnet"}
    </span>
  );
}
