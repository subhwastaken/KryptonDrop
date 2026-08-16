import Link from "next/link";

type Props = {
  children: string;
  size?: "md" | "sm";
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button";
};

export function LandingButton({
  href,
  children,
  size = "md",
  onClick,
  disabled,
}: Props) {
  const className = `landing-uiverse-btn${size === "sm" ? " landing-uiverse-btn--sm" : ""}`;
  const inner = <span>{children}</span>;

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {inner}
    </button>
  );
}
