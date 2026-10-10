import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Ostukorv",
  robots: { index: false },
};

export default function CartPage() {
  return (
    <Container className="py-8 pb-16">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Ostukorv</h1>
      <CartView />
    </Container>
  );
}
