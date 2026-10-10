import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function NotFound() {
  return (
    <Container className="flex flex-col items-center py-24 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Lehte ei leitud</h1>
      <p className="mt-2 max-w-md text-muted">See toode võib olla juba müüdud või aadress on vale.</p>
      <div className="mt-8 flex gap-3">
        <ButtonLink href="/sulearvutid">Vaata sülearvuteid</ButtonLink>
        <ButtonLink href="/" variant="outline">
          Avalehele
        </ButtonLink>
      </div>
    </Container>
  );
}
