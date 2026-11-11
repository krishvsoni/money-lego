// Always visible in the app: makes it unmistakable that PayPal calls go to the sandbox.
export function NetworkBadge() {
  const live = process.env.NEXT_PUBLIC_PAYPAL_ENVIRONMENT === "live";
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-semibold ${live ? "bg-danger-wash text-danger" : "bg-attention-wash text-attention"}`}
      title={live ? "Live PayPal: real money." : "PayPal Sandbox: test accounts and test money only."}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {live ? "Live" : "Sandbox"}
    </span>
  );
  
}
