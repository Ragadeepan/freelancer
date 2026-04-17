import { Link } from "react-router-dom";
import Button from "./Button.jsx";
import clsx from "../utils/clsx.js";
import { useAuth } from "../contexts/AuthContext.jsx";

export default function PageHeader({
  title,
  description,
  primaryAction,
  primaryTo,
  onPrimaryAction,
  primaryDisabled,
  primaryTitle,
  primaryVariant = "primary"
}) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  return (
    <div
      className={clsx(
        "flex flex-wrap items-stretch justify-between gap-4 sm:items-center",
        !isAdmin && "glass-card rounded-2xl p-5 reveal-up"
      )}
    >
      <div className="min-w-0 flex-1">
        <h3
          className={clsx(
            "font-display text-xl font-semibold sm:text-2xl",
            isAdmin ? "text-white" : "title-gradient"
          )}
        >
          {title}
        </h3>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-slate-400">{description}</p>
        )}
      </div>
      {primaryAction ? (
        primaryTo ? (
          <Link to={primaryTo} className="w-full self-stretch sm:w-auto sm:self-auto">
            <Button
              className="h-11 w-full sm:w-auto"
              variant={primaryVariant}
              disabled={primaryDisabled}
              title={primaryTitle}
            >
              {primaryAction}
            </Button>
          </Link>
        ) : (
          <Button
            className="h-11 w-full self-stretch sm:w-auto sm:self-auto"
            variant={primaryVariant}
            onClick={onPrimaryAction}
            disabled={primaryDisabled}
            title={primaryTitle}
          >
            {primaryAction}
          </Button>
        )
      ) : null}
    </div>
  );
}
