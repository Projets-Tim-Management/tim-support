"use client";

import type { ReactNode } from "react";

import AssistantWidget from "@/admin/assistant/AssistantWidget";

/**
 * Monte l'assistant (bulle en bas à droite) sur toute l'admin, via
 * `admin.components.providers`. Rend `children` tel quel.
 */
export default function Assistant({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AssistantWidget />
    </>
  );
}
