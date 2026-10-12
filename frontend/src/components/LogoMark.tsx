/** Quantify mark — ascending sparkline in a soft squircle. */

type Props = {
  size?: number;
  /** When true, draws the dark tile behind the stroke (favicon / standalone). */
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
      {withTile ? (
        <rect width="32" height="32" rx="8" fill="#0c1014" />
      ) : null}
      {/* Soft baseline */}
      <path
        d="M7 22.5 H25"
        stroke="#4fd6a0"
        strokeOpacity="0.22"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      {/* Expressive equity path */}
      <path
        d="M7 20.5 L12.2 14.2 L16.4 17.6 L25 8.5"
        stroke="#4fd6a0"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Terminal spark */}
      <circle cx="25" cy="8.5" r="2.15" fill="#4fd6a0" />
    </svg>
  );
}
