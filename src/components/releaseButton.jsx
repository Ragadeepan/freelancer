import Button from "./Button.jsx";

export default function ReleaseButton({
  onClick,
  disabled = false,
  loading = false,
  children = "Review & Release"
}) {
  return (
    <Button variant="primary" onClick={onClick} disabled={disabled || loading}>
      {loading ? "Releasing..." : children}
    </Button>
  );
}
