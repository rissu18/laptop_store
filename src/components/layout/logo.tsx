import Link from "next/link";

export function Logo({ name }: { name: string }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md" aria-label={`${name} – avaleht`}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--c-primary)" />
        <rect x="7" y="9" width="18" height="11" rx="1.5" fill="none" stroke="var(--c-on-primary)" strokeWidth="2" />
        <path d="M5 23h22" stroke="var(--c-on-primary)" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <span className="text-lg font-bold tracking-tight">{name}</span>
    </Link>
  );
}
