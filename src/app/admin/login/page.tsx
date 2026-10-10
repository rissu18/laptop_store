import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sisselogimine" };

async function LoginFormWithNext({ searchParams }: PageProps<"/admin/login">) {
  const next = (await searchParams).next;
  return <LoginForm next={typeof next === "string" ? next : undefined} />;
}

export default function AdminLoginPage(props: PageProps<"/admin/login">) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-alt px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold">Admini sisselogimine</h1>
        <p className="mt-1 text-sm text-muted">Ainult poe haldajatele.</p>
        <Suspense fallback={<div className="mt-6 h-56" />}>
          <LoginFormWithNext {...props} />
        </Suspense>
      </div>
    </main>
  );
}
