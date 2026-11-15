import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { NxLogo } from "@/components/nx-logo";
import { NxAtmosphere } from "@/components/nx-atmosphere";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <NxAtmosphere />
      <div className="relative z-10">
        <SiteHeader />
        <section className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-5xl flex-col justify-center px-4 pb-16 pt-4 sm:px-5 sm:pt-6">
          <div className="nx-rise mb-6 flex items-center gap-4 sm:mb-8">
            <NxLogo size={64} />
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[var(--nx-accent)]">
              Payment software · not a PSP
            </p>
          </div>
          <h1 className="nx-rise font-display max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight text-[var(--nx-ink)] sm:text-6xl md:text-7xl">
            NXPayment
          </h1>
          <p
            className="nx-rise mt-5 max-w-xl text-lg text-[var(--nx-muted)] sm:text-xl"
            style={{ animationDelay: "80ms" }}
          >
            UPI that settles straight into the merchant&apos;s own VPA — SimpleCheckout for
            buyers, Confirm for merchants, tally when the day ends.
          </p>
          <div
            className="nx-rise mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
            style={{ animationDelay: "140ms" }}
          >
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/checkout">Open buyer checkout</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href="/merchant">Merchant console</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
