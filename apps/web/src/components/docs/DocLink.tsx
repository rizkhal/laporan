import { ArrowUpRight } from "lucide-react";

export function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2 decoration-primary/30 hover:decoration-primary"
    >
      {children}
      <ArrowUpRight className="size-3" />
    </a>
  );
}
