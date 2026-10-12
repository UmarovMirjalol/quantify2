/** Quantify mark — geometric lightning bolt (Supabase-adjacent energy, own shape). */

type Props = {
  size?: number;
  /** Dark tile behind the bolt (favicon / standalone). */
  withTile?: boolean;
  className?: string;
};

export function LogoMark({ size = 16, withTile = false, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {withTile ? <rect width="32" height="32" rx="8" fill="#0c1014" /> : null}
      {/* Bold geometric bolt — one solid glyph, reads at 16px */}
      <path
        d="M18.6 4.2 L9.4 17.35 H15.1 L12.85 27.8 L23.35 13.9 H17.55 L18.6 4.2 Z"
        fill="#4fd6a0"
      />
    </svg>
  );
}
