import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function SectionHeader({ id, title, description, link }: { id: string; title: string; description?: string; link?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div>
        <h2 id={id} className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h2>
        {description && <p className="mt-1 text-muted">{description}</p>}
      </div>
      {link && (
        <Link href={link.href} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          {link.label}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}
