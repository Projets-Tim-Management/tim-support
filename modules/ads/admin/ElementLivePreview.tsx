"use client";

import { Player } from "@remotion/player";
import { useMemo } from "react";

import { Pub } from "@/remotion/Pub";
import { isElementType } from "@/modules/ads/video/elements";
import { previewScore } from "@/modules/ads/video/preview-score";
import { buildRenderProps } from "@/modules/ads/video/props";

import type { AtelierContext } from "./useAtelierContext";

/**
 * L'aperçu EN DIRECT d'un élément (atelier des éléments) : le même moteur que
 * les vidéos, joué dans le navigateur avec les réglages en cours — enregistrés
 * ou non. On voit la coche passer de ronde à carrée avant d'enregistrer, sans
 * rendu ni coût.
 */
export function ElementLivePreview({ ctx, base, id, params }: { ctx: AtelierContext; base: string; id: number; params: Record<string, unknown> }) {
  const props = useMemo(() => {
    if (!isElementType(base)) return null;
    const score = previewScore(base, id, ctx.rush?.id ?? null, ctx.fact?.id ?? null);
    return buildRenderProps(score, {
      format: "9x16",
      style: ctx.style,
      kit: ctx.kit,
      appearance: ctx.appearance,
      cta: "En savoir plus",
      rushes: ctx.rush ? new Map([[ctx.rush.id, { url: ctx.rush.url, width: ctx.rush.width, height: ctx.rush.height, framing: null }]]) : new Map(),
      facts: ctx.fact ? new Map([[ctx.fact.id, { statement: ctx.fact.statement, source: ctx.fact.source }]]) : new Map(),
      logoAnimated: ctx.logo,
      variants: new Map([[id, { type: base, params }]]),
      faces: ctx.faces,
    });
  }, [ctx, base, id, params]);
  if (!props) return null;
  const frames = Math.max(1, props.shots.reduce((t, s) => t + s.frames, 0));
  return (
    <Player
      component={Pub}
      inputProps={props}
      durationInFrames={frames}
      compositionWidth={props.width}
      compositionHeight={props.height}
      fps={props.fps}
      loop
      autoPlay
      controls
      acknowledgeRemotionLicense
      style={{ width: 270, height: 480, borderRadius: 8, overflow: "hidden" }}
    />
  );
}
