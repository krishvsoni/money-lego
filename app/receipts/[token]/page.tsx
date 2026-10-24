import { Suspense } from "react";
import { View } from "./view";

export default function Page() {
  return (
    <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-sunken" aria-label="Loading" />}>
      <View />
    </Suspense>
  );
}
