import { Suspense } from "react";
import { View } from "./view";

export default function Page() {
  return (
    <Suspense fallback={<div className="h-dvh animate-pulse bg-sunken" aria-label="Loading workflow" />}>
      <View />
    </Suspense>
  );
}
