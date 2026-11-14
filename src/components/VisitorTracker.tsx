import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "visitor_analytics_session";

function sessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export default function VisitorTracker() {
  const location = useLocation();
  const lastSent = useRef(0);

  useEffect(() => {
    if (location.pathname.startsWith("/3075554556")) return;
    const track = async () => {
      if (document.visibilityState === "hidden" || Date.now() - lastSent.current < 5000) return;
      lastSent.current = Date.now();
      try {
        await supabase.functions.invoke("visitor-analytics", {
          body: { action: "track", sessionId: sessionId(), path: `${location.pathname}${location.search}`, referrer: document.referrer },
        });
      } catch {
        // Analytics must never interrupt the customer experience.
      }
    };
    void track();
    const timer = window.setInterval(track, 15000);
    const onVisible = () => { if (document.visibilityState === "visible") void track(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [location.pathname, location.search]);

  return null;
}
