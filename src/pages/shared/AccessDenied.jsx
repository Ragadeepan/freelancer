import { Link, useNavigate } from "react-router-dom";
import Button from "../../components/Button.jsx";

export default function AccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center px-4 sm:px-6">
      <div className="glass-card w-full max-w-lg rounded-2xl p-6 text-center sm:p-8">
        <h1 className="font-display text-xl font-semibold text-white sm:text-2xl">
          Access denied
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          Your role does not have permission to view this workspace.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button className="w-full sm:w-auto" variant="ghost" onClick={() => navigate(-1)}>
            Back
          </Button>
          <Link to="/" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto" variant="ghost">Return home</Button>
          </Link>
          <Link to="/login" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">Login</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
