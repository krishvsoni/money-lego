import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

// "Back to the workflow": a raised black key whose arrow loops around on hover, leaving out
// the left edge and coming back in from the right, the way "back" feels. Pressing sinks the
// key into the page (its floor shadow collapses as it travels down).
export function BackButton({ href, children = "Back to the workflow" }: { href: string; children?: string }) {
  return (
    <Link href={href} className="back-button group">
      <span className="back-button-arrows" aria-hidden>
        <ArrowLeftIcon weight="bold" size={15} className="back-button-arrow" />
        <ArrowLeftIcon weight="bold" size={15} className="back-button-arrow back-button-arrow-next" />
      </span>
      <span className="back-button-label">{children}</span>
    </Link>
  );
}
