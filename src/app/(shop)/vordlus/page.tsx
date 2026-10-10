import type { Metadata } from "next";
import { CompareTable } from "@/components/compare/compare-table";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Toodete võrdlus",
  robots: { index: false },
};

export default function ComparePage() {
  return (
    <Container className="py-8 pb-16">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Toodete võrdlus</h1>
      <CompareTable />
    </Container>
  );
}
