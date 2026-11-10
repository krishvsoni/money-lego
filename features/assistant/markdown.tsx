"use client";

import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// The assistant's replies as Markdown, styled for a narrow chat panel. Raw HTML is never
// rendered (react-markdown's default), links to this app stay in-app, and outside links open
// in a new tab without access to this page.

const components: Components = {
  p: ({ children }) => <p className="leading-relaxed [&:not(:first-child)]:mt-2">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <p className="mt-3 text-[0.9375rem] font-bold text-ink first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="mt-3 text-sm font-bold text-ink first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="mt-2.5 text-sm font-semibold text-ink first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 marker:text-ink-3 first:mt-0">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 marker:font-semibold marker:text-ink-3 first:mt-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed pl-0.5">{children}</li>,
  blockquote: ({ children }) => <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-ink-2">{children}</blockquote>,
  hr: () => <hr className="my-3 border-line" />,
  a: ({ href = "", children }) =>
    href.startsWith("/") ? (
      <Link href={href} className="font-medium text-[var(--brick-1)] underline underline-offset-2">
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--brick-1)] underline underline-offset-2">
        {children}
      </a>
    ),
  code: ({ children, className }) =>
    className ? (
      <code className={`${className} font-mono text-xs`}>{children}</code>
    ) : (
      <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.8125em] text-ink">{children}</code>
    ),
  pre: ({ children }) => <pre className="mt-2 overflow-x-auto rounded-lg bg-sunken p-2.5 text-xs leading-relaxed">{children}</pre>,
  table: ({ children }) => (
    <div className="mt-2 overflow-x-auto rounded-lg shadow-[0_0_0_1px_var(--line)]">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
  th: ({ children }) => <th className="border-b border-line px-2.5 py-1.5 text-left font-semibold whitespace-nowrap text-ink">{children}</th>,
  td: ({ children }) => <td className="num border-b border-line px-2.5 py-1.5 align-top text-ink-2 [tr:last-child_&]:border-b-0">{children}</td>,
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="min-w-0 text-sm text-ink [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
