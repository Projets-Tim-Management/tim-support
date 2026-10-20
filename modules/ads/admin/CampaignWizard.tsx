"use client";

import { toast, useConfig } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { draftFromDoc, emptyDraft, resumeStep, stepData, stepProblems, suggestedRunObjective, WIZARD_STEPS, type StepKey, type WizardDraft } from "@/modules/ads/lib/campaign-wizard";

import { CampaignWizardView, type AgentPreview, type Option } from "./CampaignWizardView";
import { postAdmin } from "./post-admin";

/**
 * Nouvelle campagne, pas à pas (demande de Charlie, 20/10/2026). Ce composant
 * tient l'état et les enregistrements ; CampaignWizardView dessine. « Suivant »
 * enregistre l'étape — la première crée le brouillon —, si bien qu'une fenêtre
 * fermée se rouvre à la première étape incomplète. Ce qui est obligatoire vient
 * de lib/campaign-wizard. La dernière étape relit tout et lance (ou non) l'agent.
 */

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  const data = (await res.json().catch(() => ({}))) as T & { errors?: { message?: string; data?: { errors?: { message?: string }[] } }[]; error?: string };
  if (!res.ok) throw new Error(data.errors?.[0]?.data?.errors?.[0]?.message || data.errors?.[0]?.message || data.error || `Erreur ${res.status}`);
  return data;
}

export function CampaignWizard({ campaignId, onClose }: { campaignId: number | string | null; onClose: () => void }) {
  const router = useRouter();
  // L'API REST de Payload est servie sous `routes.api` (« /payload-api ») : /api/* appartient aux routes du site.
  const rest = useConfig().config.routes.api;
  const [d, setD] = useState<WizardDraft>(emptyDraft);
  const [step, setStep] = useState<StepKey>("bases");
  const [loaded, setLoaded] = useState(false);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [facts, setFacts] = useState<Option[]>([]);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [preview, setPreview] = useState<AgentPreview | null>(null);
  const [runObjective, setRunObjective] = useState("");
  const [capEur, setCapEur] = useState("2");

  // Ce qu'on choisit (comptes, preuves) et, pour une reprise, la campagne elle-même.
  useEffect(() => {
    let alive = true;
    void Promise.all([
      api<{ docs: { id: number; name: string; status?: string }[] }>(`${rest}/ad-accounts?limit=50&depth=0`),
      api<{ docs: { id: number; statement: string }[] }>(`${rest}/ad-facts?limit=200&depth=0&where[active][equals]=true`),
      campaignId != null ? api<Record<string, unknown>>(`${rest}/ad-campaigns/${encodeURIComponent(String(campaignId))}?depth=0`) : Promise.resolve(null),
    ])
      .then(([acc, f, doc]) => {
        if (!alive) return;
        const usable = acc.docs.filter((a) => a.status !== "archive");
        setAccounts(usable.map((a) => ({ id: a.id, label: a.name })));
        setFacts(f.docs.map((x) => ({ id: x.id, label: x.statement })));
        const draft = doc ? draftFromDoc(doc as never) : { ...emptyDraft(), account: usable.length === 1 ? usable[0].id : null };
        setD(draft);
        const at = doc ? resumeStep(draft) : "bases";
        if (at === "verifier") setRunObjective(suggestedRunObjective(draft));
        setStep(at);
        setLoaded(true);
      })
      .catch((e: Error) => toast.error(e.message));
    return () => {
      alive = false;
    };
  }, [campaignId, rest]);

  // Échap ferme la fenêtre ; ce qui est enregistré est gardé.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // À l'étape « Vérifier » : ce que le passage coûterait au plus, et ce qui bloquerait.
  useEffect(() => {
    if (step !== "verifier" || d.id == null) return;
    const t = setTimeout(() => {
      api<{ preview: AgentPreview }>(`/api/admin/ads/campaigns/${encodeURIComponent(String(d.id))}/agent?cap=${encodeURIComponent(capEur)}`)
        .then((r) => setPreview(r.preview))
        .catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(t);
  }, [step, d.id, capEur]);

  const set = <K extends keyof WizardDraft>(k: K, v: WizardDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const index = WIZARD_STEPS.findIndex((s) => s.key === step);

  const show = (to: StepKey) => {
    setTried(false);
    if (to === "verifier" && !runObjective) setRunObjective(suggestedRunObjective(d));
    setStep(to);
  };

  /** Avancer enregistre l'étape en cours (la première crée le brouillon) ; reculer, non. */
  const go = async (to: number) => {
    if (to > index) {
      setTried(true);
      if (stepProblems(step, d).length) return;
      setBusy(true);
      try {
        const data = stepData(step, d);
        if (d.id == null) {
          const r = await api<{ doc: { id: number } }>(`${rest}/ad-campaigns`, { method: "POST", body: JSON.stringify(data) });
          set("id", r.doc.id);
        } else if (Object.keys(data).length) {
          await api(`${rest}/ad-campaigns/${encodeURIComponent(String(d.id))}`, { method: "PATCH", body: JSON.stringify(data) });
        }
      } catch (e) {
        toast.error((e as Error).message);
        return;
      } finally {
        setBusy(false);
      }
    }
    show(WIZARD_STEPS[to].key);
  };

  const finish = async (launch: boolean) => {
    if (d.id == null) return;
    setBusy(true);
    try {
      if (launch) {
        await postAdmin(`/api/admin/ads/campaigns/${encodeURIComponent(String(d.id))}/agent`, { objective: runObjective, capEur: Number(capEur) });
        toast.success("Campagne créée, agent lancé.");
      } else toast.success("Campagne créée.");
      onClose();
      router.push(`/admin/collections/ad-campaigns/${encodeURIComponent(String(d.id))}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <CampaignWizardView
      resuming={campaignId != null}
      d={d}
      set={set}
      step={step}
      loaded={loaded}
      busy={busy}
      tried={tried}
      accounts={accounts}
      facts={facts}
      preview={preview}
      runObjective={runObjective}
      setRunObjective={setRunObjective}
      capEur={capEur}
      setCapEur={setCapEur}
      onGo={(i) => void go(i)}
      onEdit={show}
      onFinish={(launch) => void finish(launch)}
      onClose={onClose}
    />,
    document.body,
  );
}
