import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase/firebase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser || null);
      if (!nextUser) {
        setProfile(null);
        setLoading(false);
      } else {
        setLoading(true);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    let active = true;
    const profileRef = doc(db, "users", user.uid);

    const profileSeedTimeoutMs = 8000;
    const loadInitialProfile = async () => {
      try {
        const snapshot = await Promise.race([
          getDoc(profileRef),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("profile-load-timeout")), profileSeedTimeoutMs)
          )
        ]);
        if (active && snapshot && typeof snapshot.exists === "function") {
          setProfile(snapshot.exists() ? snapshot.data() : null);
        }
      } catch (error) {
        if (String(error?.message || "") !== "profile-load-timeout") {
          console.error("Failed to load initial profile", error);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadInitialProfile();

    const unsubscribe = onSnapshot(
      profileRef,
      (snapshot) => {
        if (!active) return;
        setProfile(snapshot.exists() ? snapshot.data() : null);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to subscribe to profile", error);
        if (!active) return;
        setProfile(null);
        setLoading(false);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      role: profile?.role,
      status: profile?.status
    }),
    [user, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
