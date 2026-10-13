/** Quantify mark — big simple bolt, close to the original zigzag energy. */

type Props = {
  size?: number;
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
      <path
        d="M19 5 L10 16.5 H15.4 L13 27 L23.2 14.2 H17.6 L19 5 Z"
        fill="#4fd6a0"
      />
    </svg>
  );
}
