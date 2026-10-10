import { AlertTriangle, ChevronRight, Inbox } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/class-names";

/** Admini ühised esitluskomponendid (serveri- ja kliendikomponentides kasutatavad, ilma olekuta). */

export interface Crumb {
  label: string;
  href?: string;
}

export function AdminBreadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Asukoht" className="mb-2 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link href="/admin" className="hover:text-text">
            Admin
          </Link>
        </li>
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-1">
            <ChevronRight className="size-3.5" aria-hidden />
            {item.href ? (
              <Link href={item.href} className="hover:text-text">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-text">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({ title, description, breadcrumbs, actions }: { title: string; description?: ReactNode; breadcrumbs?: Crumb[]; actions?: ReactNode }) {
  return (
    <div className="mb-6">
      {breadcrumbs && <AdminBreadcrumbs items={breadcrumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, description, actions, children, className }: { title?: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-lg border border-border bg-surface", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <div>
            {title && <h2 className="font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

type Tone = "success" | "warning" | "danger" | "neutral" | "info" | "primary";
const TONES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-sunken text-muted",
  info: "bg-info-soft text-text",
  primary: "bg-primary-soft text-primary",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONES[tone])}>{children}</span>;
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Aktiivne", tone: "success" },
  HIDDEN: { label: "Peidetud", tone: "warning" },
  ARCHIVED: { label: "Arhiveeritud", tone: "neutral" },
  DRAFT: { label: "Mustand", tone: "neutral" },
  DISABLED: { label: "Välja lülitatud", tone: "danger" },
  SCHEDULED: { label: "Ajastatud", tone: "info" },
  EXPIRED: { label: "Aegunud", tone: "warning" },
  MATCHED: { label: "Leitud", tone: "success" },
  NEEDS_REVIEW: { label: "Vajab ülevaatust", tone: "warning" },
  NOT_FOUND: { label: "Ei leitud", tone: "neutral" },
  ERROR: { label: "Viga", tone: "danger" },
  PENDING: { label: "Ootel", tone: "info" },
  INFO: { label: "INFO", tone: "info" },
  WARN: { label: "WARN", tone: "warning" },
  DEBUG: { label: "DEBUG", tone: "neutral" },
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Missing />;
  const known = STATUS[status] ?? (status === "ERROR" ? STATUS.ERROR : { label: status, tone: "neutral" as Tone });
  return <Badge tone={known.tone}>{known.label}</Badge>;
}

/** Puuduv väärtus — kunagi ei asendata väljamõeldud väärtusega. */
export function Missing({ label = "Puudub" }: { label?: string }) {
  return <span className="text-sm text-subtle italic">{label}</span>;
}

export function Value({ children }: { children: ReactNode }) {
  return children === null || children === undefined || children === "" ? <Missing /> : <>{children}</>;
}

export function MetricCard({ label, value, hint, href, tone }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "warning" | "danger" }) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className={cx("mt-1 text-2xl font-semibold tabular-nums", tone === "warning" && "text-warning", tone === "danger" && "text-danger")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </>
  );
  const className = "block rounded-lg border border-border bg-surface p-4";
  return href ? (
    <Link href={href} className={cx(className, "hover:border-border-strong hover:shadow-sm")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      <Inbox className="size-8 text-subtle" aria-hidden />
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Midagi läks valesti", description, errorId, action }: { title?: string; description?: ReactNode; errorId?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft px-6 py-10 text-center">
      <AlertTriangle className="size-8 text-danger" aria-hidden />
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {errorId && <p className="text-xs text-muted">Vea ID: <code>{errorId}</code></p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Laadin…" }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col gap-3" aria-label={label}>
      <div className="h-8 w-56 animate-pulse rounded bg-surface-sunken" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded bg-surface-sunken" />
      <div className="mt-4 h-64 animate-pulse rounded-lg bg-surface-sunken" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Kirjeldusloend (detailvaated). */
export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-muted">{item.label}</dt>
          <dd className="mt-0.5 break-words">
            <Value>{item.value}</Value>
          </dd>
        </div>
      ))}
    </dl>
  );
}
