export const JOINED_SESSION_STORAGE_KEY = "joinedShoppingSession";
export const HOST_SESSION_STORAGE_KEY = "hostShoppingSession";

// The join_session webhook returns MySQL's naive datetime format
// ("YYYY-MM-DD HH:MM:SS"); the create_session webhook returns ISO. Normalize
// both to ms-since-epoch, treating naive strings as UTC (the server stores UTC).
export const parseExpiryMs = (value) => {
  if (!value) return 0;
  const str = String(value);
  const iso = /[TZ]/.test(str) ? str : `${str.replace(" ", "T")}Z`;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
};

// Reads a partner-join session from sessionStorage, if one is active. Returns
// `{code, week_start_date, expires_at}` or null. App.js writes this entry when
// a `#join/CODE` link resolves successfully.
export const readJoinedSession = () => {
  try {
    const raw = sessionStorage.getItem(JOINED_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.week_start_date) return null;
    if (parsed.expires_at && parseExpiryMs(parsed.expires_at) < Date.now()) {
      sessionStorage.removeItem(JOINED_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

// Reads the session the current user created as host (written by InviteModal
// after a successful create_session). Used for the presence indicator on the
// host's own device. Same shape as joined session.
export const readHostSession = () => {
  try {
    const raw = sessionStorage.getItem(HOST_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.expires_at && parseExpiryMs(parsed.expires_at) < Date.now()) {
      sessionStorage.removeItem(HOST_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};
