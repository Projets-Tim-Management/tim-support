"use client";

import { useRowLabel } from "@payloadcms/ui";

import { TEAM_EMAILS } from "@/core/lib/team-emails";

/**
 * Le libellé d'une ligne du réglage « E-mails de l'équipe » : l'e-mail et ce
 * qui le déclenche, au lieu du générique « E-mail 01 ».
 */
export function TeamEmailRowLabel() {
  const { data } = useRowLabel<{ email?: string; roles?: string[] }>();
  const e = TEAM_EMAILS.find((x) => x.key === data?.email);
  if (!e) return <span>E-mail</span>;
  return (
    <span>
      <strong>
        {e.group} — {e.label}
      </strong>
      <span style={{ marginLeft: "0.6rem", opacity: 0.7, fontWeight: 400 }}>{e.when}</span>
    </span>
  );
}
