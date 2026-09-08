"use client";

import { useEffect, useState } from "react";

/**
 * Les noms de l'équipe TIM, chargés UNE FOIS pour tout l'écran.
 *
 * Le formulaire ne connaît que des identifiants : sans cette table, un fil de
 * discussion afficherait « 3 » à la place d'un prénom, et la barre d'un point
 * ne pourrait pas dire qui s'en occupe.
 *
 * La promesse est mémorisée au niveau du module : une fiche peut contenir vingt
 * points de checklist, chacun avec sa discussion — vingt composants qui
 * demandent la même liste ne doivent pas déclencher vingt appels.
 */

export type Person = {
  id: number | string;
  firstName?: string;
  lastName?: string;
  email?: string;
  /** Photo de profil, peuplée (depth=1) : on veut l'URL, pas l'identifiant. */
  avatar?: {
    url?: string;
    thumbnailURL?: string;
    sizes?: { thumbnail?: { url?: string } };
  } | null;
};

/** La plus petite image disponible : un avatar de 28 px n'a pas besoin de l'original. */
const avatarUrl = (p?: Person | null): string | undefined =>
  p?.avatar?.sizes?.thumbnail?.url ?? p?.avatar?.thumbnailURL ?? p?.avatar?.url ?? undefined;

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  /** Absente = on affiche les initiales. */
  avatar?: string;
};

export type Team = {
  /** id → nom, pour afficher un auteur ou des initiales. */
  map: Record<string, string>;
  /** La liste ordonnée, pour proposer quelqu'un dans un menu. */
  list: TeamMember[];
};

/** « Marie Dupont », sinon l'e-mail — jamais un identifiant brut. */
export const displayName = (p?: Person | null): string => {
  if (!p) return "";
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  return full || p.email || "";
};

/** Initiales pour les pastilles (« MD »). */
export const initialsOf = (name: string): string =>
  name
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const EMPTY: Team = { list: [], map: {} };

let cache: Promise<Team> | null = null;

/**
 * Seulement les rôles INTERNES : les comptes partenaires partagent la même
 * collection, et n'ont rien à faire dans une liste « qui s'en occupe » ni dans
 * « à qui je pose la question ».
 */
// `depth=1` pour que la photo de profil arrive avec son URL, et non en
// identifiant : c'est elle qu'on affiche à la place des initiales.
const QUERY =
  "/payload-api/users?limit=200&depth=1&sort=firstName" +
  "&where[roles][in]=super-admin,admin,support";

const load = (): Promise<Team> => {
  cache ??= fetch(QUERY, { credentials: "include" })
    .then((res) => (res.ok ? res.json() : { docs: [] }))
    .then((data: { docs?: Person[] }) => {
      const map: Record<string, string> = {};
      const list: TeamMember[] = [];
      for (const person of data?.docs ?? []) {
        const name = displayName(person);
        if (!name) continue;
        map[String(person.id)] = name;
        list.push({
          avatar: avatarUrl(person),
          email: person.email ?? "",
          id: String(person.id),
          name,
        });
      }
      return { list, map };
    })
    .catch(() => {
      // Un échec ne doit pas être mémorisé : la prochaine ouverture réessaiera.
      cache = null;
      return EMPTY;
    });
  return cache;
};

/** L'équipe, chargée une fois. Vide tant qu'elle n'est pas revenue — l'écran reste lisible. */
export const useTeam = (): Team => {
  const [team, setTeam] = useState<Team>(EMPTY);
  useEffect(() => {
    let active = true;
    void load().then((loaded) => {
      if (active) setTeam(loaded);
    });
    return () => {
      active = false;
    };
  }, []);
  return team;
};
