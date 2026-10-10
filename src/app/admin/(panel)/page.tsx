import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/server/auth/auth";

export const metadata: Metadata = { title: "Töölaud" };

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  return <PageHeader title="Töölaud" description={`Tere, ${admin.name}!`} />;
}
