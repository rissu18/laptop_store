import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { ToastProvider } from "@/components/admin/toast";
import { LoadingState } from "@/components/admin/ui";
import { requireAdmin } from "@/server/auth/auth";

/** Admini sisu sõltub alati sessioonist (päringu ajal) — staatilist eelrenderdust siin ei kasutata. */
export const instant = false;

async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <ToastProvider>
      <AdminShell user={{ name: admin.name, email: admin.email }}>{children}</AdminShell>
    </ToastProvider>
  );
}

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="p-8">
          <LoadingState />
        </div>
      }
    >
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}
