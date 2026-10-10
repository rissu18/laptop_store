import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout/checkout-view";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = { title: "Kassa", robots: { index: false, follow: false } };

export default function CheckoutPage() {
  return (
    <Container className="py-8 pb-16">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Kassa</h1>
      <CheckoutView />
    </Container>
  );
}
