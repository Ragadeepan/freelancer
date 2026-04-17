import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";

export default function useFirestoreDoc(buildRef, deps = [], initial = null) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const docRef = buildRef ? buildRef() : null;
    if (!docRef) {
      setData(initial);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        setData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
        setLoading(false);
      },
      (err) => {
        setError(err?.message || "Failed to load data.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, deps);

  return { data, setData, loading, error };
}
