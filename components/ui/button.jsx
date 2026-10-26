import Link from "next/link";

const variantClasses = {
  primary: "ui-button--primary",
  dark: "ui-button--dark",
  secondary: "ui-button--secondary",
  quiet: "ui-button--quiet",
  "hero-outline": "ui-button--hero-outline",
};

const sizeClasses = {
  small: "ui-button--small",
  medium: "",
  large: "ui-button--large",
};

export function Button({
  href,
  variant = "primary",
  size = "medium",
  fullWidth = false,
  className = "",
  children,
  ...props
}) {
  const classes = [
    "ui-button",
    variantClasses[variant] ?? variantClasses.primary,
    sizeClasses[size] ?? sizeClasses.medium,
    fullWidth ? "ui-button--full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link className={classes} href={href} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} type="button" {...props}>
      {children}
    </button>
  );
}
