export default function AuthInputIcon({ type = "user", className = "h-4 w-4" }) {
  if (type === "email") {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="3.5" y="6.5" width="17" height="11" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4.8 8L12 13.2L19.2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "password") {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="5.5" y="10.2" width="13" height="9.3" rx="2.1" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8.5 10.2V8.4C8.5 6.47 10.07 4.9 12 4.9C13.93 4.9 15.5 6.47 15.5 8.4V10.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="12" cy="14.8" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5.2 18C6.6 15.8 9 14.6 12 14.6C15 14.6 17.4 15.8 18.8 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
