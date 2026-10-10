import Image from "next/image";
import Link from "next/link";
import logo from "../../../public/brand/logo.png";

/** Poe logo (läbipaistva taustaga PNG, Next.js teeb sellest WebP/AVIF variandid). */
export function Logo({ name }: { name: string }) {
  return (
    <Link href="/" className="flex shrink-0 items-center rounded-md" aria-label={`${name} – avaleht`}>
      <Image src={logo} alt={name} priority sizes="(min-width: 768px) 220px, 170px" className="h-7 w-auto sm:h-8 md:h-9" />
    </Link>
  );
}
