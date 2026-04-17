import Button from "./Button.jsx";

export default function SelectFreelancerButton({
  proposalId,
  disabled = false,
  loading = false,
  onSelect
}) {
  return (
    <Button
      variant="primary"
      disabled={disabled || loading}
      onClick={() => onSelect?.(proposalId)}
    >
      {loading ? "Selecting..." : "Select Freelancer"}
    </Button>
  );
}
