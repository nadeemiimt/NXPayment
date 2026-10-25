import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 70% 10%, rgba(0,201,177,0.2), transparent 55%), linear-gradient(to top, rgba(7,24,32,0.06), transparent 40%)",
        }}
      />
      <SiteHeader />
      <section className="mx-auto flex min-h-[78vh] w-full max-w-5xl flex-col justify-center px-5 pb-16 pt-6">
        <p className="nx-rise mb-3 font-mono text-xs font-medium uppercase tracking-[0.28em] text-[var(--nx-accent-dark)]">
          Payment software · not a PSP
        </p>
        <h1 className="nx-rise font-display max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight text-[var(--nx-ink)] sm:text-6xl md:text-7xl">
          NXPayment
        </h1>
        <p
          className="nx-rise mt-5 max-w-xl text-lg text-[var(--nx-muted)] sm:text-xl"
          style={{ animationDelay: "80ms" }}
        >
          UPI that settles straight into the merchant&apos;s own VPA — SimpleCheckout for
          buyers, Confirm for merchants, tally when the day ends.
        </p>
        <div className="nx-rise mt-10 flex flex-wrap gap-3" style={{ animationDelay: "140ms" }}>
          <Button asChild size="lg">
            <Link href="/checkout">Open buyer checkout</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/merchant">Merchant console</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
