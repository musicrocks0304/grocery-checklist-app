import { useCallback, useState } from "react";
import { ENDPOINTS, apiJson } from "../config/api";
import { resolveScreenFromHash, LEGACY_REDIRECT, VALID_SCREENS } from "../utils/screenRoute";

const extractJoinCode = () => resolveScreenFromHash(window.location.hash).join || null;
const JOINED_SESSION_STORAGE_KEY = "joinedShoppingSession";

export default function useHashRoute({ hasUnsavedChangesRef }) {
  const [joinState, setJoinState] = useState(() => (extractJoinCode() ? "joining" : "idle"));
  const [joinError, setJoinError] = useState(null);
  const [currentScreen, setCurrentScreen] = useState(() => resolveScreenFromHash(window.location.hash).screen || "home");

  const navigateToScreen = useCallback((screen) => {
    const target = LEGACY_REDIRECT[screen] || screen;
    if (hasUnsavedChangesRef.current) {
      const confirmed = window.confirm("You have unsaved changes that will be lost. Are you sure you want to leave?");
      if (!confirmed) return;
      hasUnsavedChangesRef.current = false;
    }
    setCurrentScreen(target);
    window.history.pushState({ screen: target }, "", `#${target}`);
    document.querySelector('main')?.scrollTo(0, 0);
  }, [hasUnsavedChangesRef]);

  const resolveJoin = useCallback(() => {
    const code = extractJoinCode();
    if (!code) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(ENDPOINTS.joinSession);
        url.searchParams.append("code", code);
        const data = await apiJson(url.toString(), { method: "GET", headers: { Accept: "application/json" }, timeout: 8000, retries: 1 });
        if (cancelled) return;
        if (data.found && data.week_start_date) {
          sessionStorage.setItem(JOINED_SESSION_STORAGE_KEY, JSON.stringify({ code: data.code, week_start_date: data.week_start_date, expires_at: data.expires_at }));
          setJoinState("idle");
          setCurrentScreen("shop");
          window.history.replaceState({ screen: "shop" }, "", "#shop");
        } else {
          setJoinError("That invite is invalid or expired.");
          setJoinState("error");
        }
      } catch (err) {
        if (cancelled) return;
        setJoinError("Couldn't reach the server — check your connection and try again.");
        setJoinState("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const listenForRoutes = useCallback(() => {
    const initialRoute = resolveScreenFromHash(window.location.hash);
    if (!initialRoute.join) window.history.replaceState({ screen: initialRoute.screen }, "", `#${initialRoute.screen}`);
    const handleRouteChange = (event) => {
      const stateScreen = event?.state?.screen;
      if (stateScreen) {
        const next = VALID_SCREENS.includes(stateScreen) ? resolveScreenFromHash(stateScreen).screen : "home";
        setCurrentScreen((prev) => (prev === next ? prev : next));
        document.querySelector('main')?.scrollTo(0, 0);
        return;
      }
      const route = resolveScreenFromHash(window.location.hash);
      if (route.join) {
        window.location.reload();
        return;
      }
      window.history.replaceState({ screen: route.screen }, "", `#${route.screen}`);
      setCurrentScreen((prev) => (prev === route.screen ? prev : route.screen));
      document.querySelector('main')?.scrollTo(0, 0);
    };
    window.addEventListener("popstate", handleRouteChange);
    window.addEventListener("hashchange", handleRouteChange);
    return () => {
      window.removeEventListener("popstate", handleRouteChange);
      window.removeEventListener("hashchange", handleRouteChange);
    };
  }, []);

  const goHomeFromJoin = useCallback(() => {
    setJoinState("idle");
    setJoinError(null);
    window.history.replaceState({ screen: "home" }, "", "#home");
    setCurrentScreen("home");
  }, []);

  return { currentScreen, joinState, joinError, navigateToScreen, goHomeFromJoin, resolveJoin, listenForRoutes };
}
