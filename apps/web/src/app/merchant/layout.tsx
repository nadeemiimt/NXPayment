import { SiteHeader } from "@/components/site-header";
import { MerchantNav } from "@/components/merchant-nav";

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <MerchantNav />
      <div className="mx-auto max-w-5xl px-5 pb-16 pt-6">{children}</div>
    </main>
  );
}
