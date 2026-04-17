import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";

export default function useFirestoreQuery(buildQuery, deps = [], initial = []) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const queryRef = buildQuery ? buildQuery() : null;
    if (!queryRef) {
      setData(initial);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => {
        if (Array.isArray(snapshot?.docs)) {
          const docs = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
          }));
          setData(docs);
        } else {
          setData(
            snapshot?.exists?.()
              ? { id: snapshot.id, ...snapshot.data() }
              : null
          );
        }
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
