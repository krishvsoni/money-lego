"use client";

import { useState } from "react";
import { TEMPLATE_FALLBACK_THUMBNAIL } from "@/lib/templates/types";

// The stored local thumbnail, 16:9. If it fails to load, a designed local fallback takes
// its place, so a card never shows a broken image.
export function TemplateThumbnail({ src, alt, priority = false, className = "" }: { src: string; alt: string; priority?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local SVGs; next/image adds nothing for vector art
    <img
      src={failed ? TEMPLATE_FALLBACK_THUMBNAIL : src}
      alt={alt}
      width={1280}
      height={720}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => !failed && setFailed(true)}
      className={`aspect-video w-full rounded-xl bg-[#0f1730] object-cover ${className}`}
    />
  );
}
