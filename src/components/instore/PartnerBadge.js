import React from "react";
import { Users } from "lucide-react";
import { parseExpiryMs } from "../../utils/shoppingSessions";

// Quiet sage pill announcing a live partner session. Text depends on role:
// the host doesn't yet know whether anyone has joined (would need a
// server-side join counter; out of scope for this pass), so it reads "Invite
// link active" rather than claiming a partner is present; the joining device
// knows a host list exists, so it reads "Shopping with partner".
export const PartnerBadge = ({ role, expiresAt }) => {
  const hoursLeft = expiresAt
    ? Math.max(0, Math.ceil((parseExpiryMs(expiresAt) - Date.now()) / 3_600_000))
    : null;
  const label = role === "host" ? "Invite link active" : "Shopping with partner";
  return (
    <div className="flex items-center justify-center mb-3">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-light border border-primary-border px-3 py-1 text-[12px] font-semibold text-primary">
        <Users size={12} strokeWidth={2.5} />
        <span>{label}</span>
        {hoursLeft !== null && hoursLeft > 0 && (
          <span className="text-primary/70 font-normal">· {hoursLeft}h left</span>
        )}
      </div>
    </div>
  );
};
