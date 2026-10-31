export default function Mark({
  size = 22,
  withPlate = true,
}: {
  size?: number;
  withPlate?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="flex-none"
    >
      {withPlate && <rect width="32" height="32" rx="7" fill="#1e6b4f" />}
      <path
        d="M13.5 7.5c-2.8 0-4.7 2.2-4.7 4.8v13.7M13.5 7.5c3.9 0 6.7 2.6 6.7 6.3s-2.8 6.3-6.7 6.3H9M19 7.5v18.5M23 7.5v18.5"
        stroke={withPlate ? "#faf7f1" : "#1e6b4f"}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
