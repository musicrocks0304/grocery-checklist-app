import { useCallback, useState } from 'react';
import { readJoinedSession, readHostSession } from '../utils/shoppingSessions';

function readPartnerSession() {
  const joined = readJoinedSession();
  if (joined) return { ...joined, role: 'partner' };
  const hosted = readHostSession();
  return hosted ? { ...hosted, role: 'host' } : null;
}

export default function usePartnerSession() {
  const [partnerSession, setPartnerSession] = useState(readPartnerSession);
  const refreshPartnerSession = useCallback(() => {
    setPartnerSession(readPartnerSession());
  }, []);
  return { partnerSession, refreshPartnerSession };
}
