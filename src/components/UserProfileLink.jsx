import { Link } from "react-router-dom";

const asText = (value) => String(value || "").trim();

export default function UserProfileLink({
  userId,
  name,
  className = "text-sky-200 underline hover:text-sky-100",
  fallback = "Unknown user"
}) {
  const resolvedName = asText(name) || asText(userId) || fallback;
  const resolvedUserId = asText(userId);

  if (!resolvedUserId) {
    return <span className={className}>{resolvedName}</span>;
  }

  return (
    <Link
      to={`/users/${resolvedUserId}`}
      className={className}
      title={`View profile: ${resolvedName}`}
    >
      {resolvedName}
    </Link>
  );
}
