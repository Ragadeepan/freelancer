import { useEffect, useState } from "react";

export default function useAsyncData(loader, deps = [], initialValue = []) {
  const [data, setData] = useState(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    Promise.resolve()
      .then(() => loader())
      .then((result) => {
        if (!active) return;
        setData(result ?? initialValue);
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || "Failed to load data.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, deps);

  return { data, setData, loading, error };
}
