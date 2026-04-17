import clsx from "../utils/clsx.js";

const SIZE_MAP = {
  sm: {
    shell: "h-8",
    icon: "h-full max-w-[116px]",
    text: "text-base"
  },
  md: {
    shell: "h-10",
    icon: "h-full max-w-[138px]",
    text: "text-lg"
  },
  lg: {
    shell: "h-12",
    icon: "h-full max-w-[164px]",
    text: "text-xl"
  }
};

export default function BrandLogo({
  name = "Growlanzer",
  size = "md",
  showText = false,
  className,
  textClassName,
  iconClassName
}) {
  const selectedSize = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <div className={clsx("inline-flex items-center gap-3", className)}>
      <img
        src="/brand/growlanzer-logo-v3.png"
        alt={`${name} logo`}
        className={clsx(
          "w-auto object-contain",
          selectedSize.shell,
          selectedSize.icon,
          iconClassName
        )}
      />
      {showText ? (
        <span
          className={clsx(
            "font-display font-semibold text-white",
            selectedSize.text,
            textClassName
          )}
        >
          {name}
        </span>
      ) : null}
    </div>
  );
}
