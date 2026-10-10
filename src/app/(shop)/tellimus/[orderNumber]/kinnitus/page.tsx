import { CheckCircle2, Info } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { OrderDetails } from "@/components/orders/order-details";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { getDb, isDatabaseConfigured } from "@/server/db/client";
import { ORDER_ACCESS_COOKIE_PREFIX } from "@/server/orders/constants";
import { findOrderForConfirmation } from "@/server/orders/public-order";

export const metadata: Metadata = { title: "Tellimuse kinnitus", robots: { index: false, follow: false } };

/**
 * Kinnitusleht. Tellimus loetakse serverist (töötab ka pärast lehe värskendamist), aga AINULT koos
 * juurdepääsutokeniga, mis on tellimuse esitanud brauseri httpOnly küpsises. Ilma selleta (nt keegi muudab
 * URL-is numbrit) tellimust ei näidata — selleks on tellimuse otsing (number + e-post).
 */
async function Confirmation({ params }: PageProps<"/tellimus/[orderNumber]/kinnitus">) {
  const { orderNumber } = await params;
  const token = (await cookies()).get(`${ORDER_ACCESS_COOKIE_PREFIX}${orderNumber.toUpperCase()}`)?.value;
  const order = isDatabaseConfigured() ? await findOrderForConfirmation(getDb(), orderNumber, token) : null;

  if (!order) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-border bg-surface p-6 text-center">
        <h1 className="text-xl font-semibold">Tellimust ei saa siin näidata</h1>
        <p className="mt-2 text-sm text-muted">Kinnitusleht avaneb ainult samas brauseris, kus tellimus esitati. Tellimuse vaatamiseks kasuta tellimuse otsingut (tellimuse number + e-post).</p>
        <ButtonLink href="/tellimus" className="mt-6">
          Tellimuse otsing
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start gap-3">
        <CheckCircle2 className="mt-1 size-8 shrink-0 text-success" aria-hidden />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{order.isTest ? "Testtellimus loodud" : "Tellimus loodud"}</h1>
          <p className="mt-1 text-muted">
            Tellimuse number <strong className="font-mono text-text">{order.orderNumber}</strong>. Hoia see alles — tellimuse otsinguks on vaja numbrit ja e-posti.
          </p>
        </div>
      </div>
      {order.isTest && (
        <div role="note" className="mb-6 flex gap-3 rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm">
          <Info className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <p className="font-semibold">See on prototüübi testtellimus. Makset ei võetud ja tellimust ei täideta.</p>
        </div>
      )}
      <OrderDetails order={order} />
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/">Tagasi avalehele</ButtonLink>
        <Link href="/tellimus" className="inline-flex min-h-11 items-center px-2 text-sm text-muted hover:text-text">
          Tellimuse otsing
        </Link>
      </div>
    </div>
  );
}

export default function ConfirmationPage(props: PageProps<"/tellimus/[orderNumber]/kinnitus">) {
  return (
    <Container className="py-10 pb-16">
      <Suspense fallback={<div className="mx-auto h-96 max-w-3xl animate-pulse rounded-lg bg-surface-sunken" />}>
        <Confirmation {...props} />
      </Suspense>
    </Container>
  );
}
