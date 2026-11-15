import { cn } from "@/lib/utils";

type NxLogoProps = {
  size?: number;
  className?: string;
  title?: string;
};

/**
 * Distinct NX mark: ink tile, geometric N, teal X-node + payment arc.
 * Reads clearly from 28px upward.
 */
export function NxLogo({ size = 32, className, title = "NXPayment" }: NxLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      role="img"
      aria-label={title}
    >
      <rect width="40" height="40" rx="11" fill="var(--nx-ink)" />
      {/* Bold N */}
      <path
        d="M10 29V11h4.2l7.6 11.8V11H26v18h-4.2L14.2 17.2V29H10Z"
        fill="var(--nx-paper)"
      />
      {/* Teal signal node (X hint) */}
      <circle cx="30.5" cy="13" r="3.4" fill="var(--nx-accent)" />
      <path
        d="M28.4 13h4.2M30.5 10.9v4.2"
        stroke="var(--nx-paper)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Soft payment arc */}
      <path
        d="M11 32c6.8 1.4 13.8 1.4 20.5 0"
        stroke="var(--nx-accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

type NxBrandProps = {
  size?: number;
  className?: string;
  wordmarkClassName?: string;
  showTagline?: boolean;
};

export function NxBrand({
  size = 32,
  className,
  wordmarkClassName,
  showTagline = false,
}: NxBrandProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <NxLogo size={size} />
      <span className="flex min-w-0 flex-col leading-none">
        <span
          className={cn(
            "font-display font-semibold tracking-tight text-[var(--nx-ink)]",
            wordmarkClassName ?? "text-xl sm:text-2xl"
          )}
        >
          NXPayment
        </span>
        {showTagline && (
          <span className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--nx-muted)]">
            direct UPI
          </span>
        )}
      </span>
    </span>
  );
}
