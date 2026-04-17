export default function ClientRoleIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="2.2"
        y="5.2"
        width="5.6"
        height="6.4"
        rx="1.1"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="16.2"
        y="5.2"
        width="5.6"
        height="6.4"
        rx="1.1"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M7.8 9.1L10.6 11.2C11.3 11.7 12.3 11.7 13 11.2L16.2 8.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M7 12.1L10 15.1C11.1 16.2 12.9 16.2 14 15.1L17 12.1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M11.1 13.2L12.9 15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
