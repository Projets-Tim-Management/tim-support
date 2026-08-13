"use client";

import { useFormFields } from "@payloadcms/ui";
import { useEffect, useMemo, useState } from "react";

import { formatSlot, generateSlots } from "@/modules/marketing/lib/scheduling";

/**
 * Aperçu des créneaux produits par les règles de disponibilité.
 *
 * Régler une durée, un battement et un délai minimum sans voir le résultat,
 * c'est régler à l'aveugle : on découvre trop tard qu'on propose deux créneaux
 * par jour, ou aucun. L'aperçu se recalcule à chaque changement, avec le MÊME
 * code que celui qui sert le client — pas une approximation d'affichage.
 */
export function SchedulingPreview() {
  const rules = useFormFields(([fields]) => ({
    enabled: fields["scheduling.enabled"]?.value as boolean | undefined,
    mode: fields["scheduling.mode"]?.value as string | undefined,
    bookingUrl: fields["scheduling.bookingUrl"]?.value as string | undefined,
    weekdays: fields["scheduling.weekdays"]?.value as string[] | undefined,
    startTime: fields["scheduling.startTime"]?.value as string | undefined,
    endTime: fields["scheduling.endTime"]?.value as string | undefined,
    durationMin: fields["scheduling.durationMin"]?.value as number | undefined,
    bufferMin: fields["scheduling.bufferMin"]?.value as number | undefined,
    minNoticeHours: fields["scheduling.minNoticeHours"]?.value as number | undefined,
    horizonDays: fields["scheduling.horizonDays"]?.value as number | undefined,
  }));

  // `Date.now()` est lu après le montage : impur pendant le rendu, et source de
  // divergence entre le HTML du serveur et celui du client.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => setNowMs(Date.now()), []);

  const slots = useMemo(
    () => (nowMs == null ? [] : generateSlots({ rules, nowMs })),
    [rules, nowMs],
  );

  if (rules.enabled === false) {
    return (
      <p className="jr-prev jr-prev--off">
        Aucun créneau ne sera proposé au client : le rendez-vous se cale hors de l&apos;outil.
      </p>
    );
  }

  if (rules.mode === "lien") {
    return rules.bookingUrl?.trim() ? (
      <p className="jr-prev">
        Le client sera renvoyé vers <strong>{rules.bookingUrl}</strong>. TIM ne connaîtra pas la
        date retenue&nbsp;: renseignez-la sur la phase de test pour qu&apos;elle apparaisse dans le
        parcours.
      </p>
    ) : (
      <p className="jr-prev jr-prev--ko">
        Mode « lien externe » sans lien : le client n&apos;aura <strong>aucun moyen de réserver</strong>.
        Renseignez l&apos;URL de votre outil ci-dessus.
      </p>
    );
  }

  if (nowMs == null) return <p className="jr-prev">Calcul des créneaux…</p>;

  if (slots.length === 0) {
    return (
      <p className="jr-prev jr-prev--ko">
        Ces règles ne produisent <strong>aucun créneau</strong>. Vérifiez les horaires (la fin doit
        suivre le début), la durée et les jours travaillés.
      </p>
    );
  }

  // Un jour suffit à juger le rythme ; le total dit la capacité.
  const firstDay = slots[0].slice(0, 10);
  const sameDay = slots.filter((s) => s.slice(0, 10) === firstDay);

  return (
    <div className="jr-prev">
      <p className="jr-prev__head">
        <strong>{slots.length}</strong> créneaux proposés au client sur la période, dont{" "}
        <strong>{sameDay.length}</strong> le premier jour.
      </p>
      <ul className="jr-prev__list">
        {slots.slice(0, 6).map((s) => (
          <li key={s}>{formatSlot(s)}</li>
        ))}
      </ul>
      {slots.length > 6 && <p className="jr-prev__more">…et {slots.length - 6} autres.</p>}
    </div>
  );
}
