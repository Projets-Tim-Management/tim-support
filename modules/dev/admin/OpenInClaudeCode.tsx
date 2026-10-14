"use client";

import { useDocumentInfo, useFormFields } from "@payloadcms/ui";

import { CopyForClaudeCode } from "./CopyForClaudeCode";

/** Sur une demande de développement : la consigne à coller dans Claude Code, et la marche à suivre. */
export function OpenInClaudeCode() {
  const { id } = useDocumentInfo();
  const title = useFormFields(([f]) => f?.title?.value as string | undefined);
  if (!id) return null;
  return <CopyForClaudeCode dev={{ id, title: title ?? "" }} />;
}
