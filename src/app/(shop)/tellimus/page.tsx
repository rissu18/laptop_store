import type { Metadata } from "next";
import { OrderLookupForm } from "@/components/orders/order-lookup-form";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = { title: "Tellimuse otsing", robots: { index: false } };

/** Tellimuse otsing tellimuse numbri + e-posti järgi (kliendikontot pole vaja). */
export default function OrderLookupPage() {
  return (
    <Container className="py-12 pb-16">
      <OrderLookupForm />
    </Container>
  );
}
