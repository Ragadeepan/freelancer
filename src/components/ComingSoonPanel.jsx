import EmptyState from "./EmptyState.jsx";
import PageHeader from "./PageHeader.jsx";

export default function ComingSoonPanel({
  title,
  description,
  emptyTitle = "Coming soon",
  emptyDescription,
  primaryAction,
  primaryTo,
  primaryVariant = "ghost"
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        primaryAction={primaryAction}
        primaryTo={primaryTo}
        primaryVariant={primaryVariant}
      />
      <EmptyState
        title={emptyTitle}
        description={
          emptyDescription ||
          `${title} is under preparation and will be available soon.`
        }
      />
    </>
  );
}
