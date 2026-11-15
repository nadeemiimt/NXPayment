import { SiteHeader } from "@/components/site-header";
import { MerchantNav } from "@/components/merchant-nav";
import { NxAtmosphere } from "@/components/nx-atmosphere";

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen">
      <NxAtmosphere />
      <div className="relative z-10">
        <SiteHeader />
        <MerchantNav />
        <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-5">{children}</div>
      </div>
    </main>
  );
}
