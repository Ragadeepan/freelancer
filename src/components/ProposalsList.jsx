import EmptyState from "./EmptyState.jsx";
import ProposalCard from "./ProposalCard.jsx";
import SelectFreelancerButton from "./SelectFreelancerButton.jsx";

export default function ProposalsList({
  proposals = [],
  loading = false,
  canSelectFreelancer = false,
  selectedProposalId = "",
  selectingProposalId = "",
  onSelectFreelancer,
  page = 1,
  totalPages = 1,
  total = 0,
  onPageChange,
  showRank = true,
  emptyTitle = "No proposals yet",
  emptyDescription = "Freelancer proposals will appear here."
}) {
  if (loading) {
    return <EmptyState title="Loading proposals" description="Fetching proposals..." />;
  }

  if (!Array.isArray(proposals) || proposals.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-3">
      {proposals.map((proposal) => {
        const isSelected =
          String(selectedProposalId || "").trim() === String(proposal.id || "").trim() ||
          String(proposal.status || "").toLowerCase() === "selected";

        return (
          <div key={proposal.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <ProposalCard proposal={proposal} showRank={showRank} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {isSelected ? (
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                  Selected
                </span>
              ) : canSelectFreelancer ? (
                <SelectFreelancerButton
                  proposalId={proposal.id}
                  disabled={Boolean(selectedProposalId)}
                  loading={selectingProposalId === proposal.id}
                  onSelect={onSelectFreelancer}
                />
              ) : null}
            </div>
          </div>
        );
      })}

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
          <span>
            Showing page {page} of {totalPages} · {total} proposals
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange?.(page - 1)}
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange?.(page + 1)}
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
