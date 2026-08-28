"use client";

import { useEffect } from "react";

/**
 * Deux manques de l'écran de connexion de Payload, corrigés sur place.
 *
 * 1. LE GESTIONNAIRE DE MOTS DE PASSE NE PROPOSAIT RIEN. Payload pose bien
 *    `autocomplete="email"` sur l'identifiant, mais RIEN sur le mot de passe.
 *    Or les navigateurs ne reconnaissent un formulaire de connexion — et donc
 *    n'offrent d'enregistrer — que sur le couple `username` + `current-password`.
 *    On pose les deux attributs sur les champs existants.
 *
 * 2. ON NE POUVAIT PAS RELIRE CE QU'ON TAPAIT. Un mot de passe long saisi à
 *    l'aveugle, refusé, ressaisi à l'aveugle : au bout de cinq essais le compte
 *    est bloqué dix minutes. Un bouton permet de l'afficher.
 *
 * POURQUOI PAR LE DOM plutôt qu'en remplaçant l'écran de connexion : cet écran
 * porte la soumission, la redirection et la gestion d'erreurs de Payload. En
 * réécrire une copie pour deux attributs et un bouton, c'est reprendre à notre
 * charge un code de sécurité que la bibliothèque maintient déjà. On se contente
 * donc de compléter le rendu, sans rien intercepter.
 *
 * Ce composant est volontairement TOLÉRANT : si Payload change son balisage, il
 * ne trouve pas ses champs et ne fait rien. Il ne casse jamais la connexion.
 */
export default function LoginEnhancements() {
  useEffect(() => {
    const form = document.querySelector("form.login__form") ?? document.querySelector("form");
    if (!form) return;

    const password = form.querySelector<HTMLInputElement>('input[type="password"]');
    const identifier = form.querySelector<HTMLInputElement>('input[type="email"], input[name="username"]');
    if (!password) return;

    identifier?.setAttribute("autocomplete", "username");
    password.setAttribute("autocomplete", "current-password");

    // Le bouton vit dans le champ, à droite. Le conteneur doit donc être un
    // repère de positionnement — il ne l'est pas par défaut.
    const holder = password.parentElement;
    if (!holder || holder.querySelector(".tim-eye")) return;
    if (getComputedStyle(holder).position === "static") holder.style.position = "relative";
    password.style.paddingRight = "2.75rem";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "tim-eye";
    button.setAttribute("aria-label", "Afficher le mot de passe");
    button.innerHTML = EYE;

    const toggle = () => {
      const shown = password.type === "text";
      password.type = shown ? "password" : "text";
      button.innerHTML = shown ? EYE : EYE_OFF;
      button.setAttribute("aria-label", shown ? "Afficher le mot de passe" : "Masquer le mot de passe");
      // Le curseur revient en fin de saisie : basculer l'affichage ne doit pas
      // faire perdre sa place.
      password.focus();
      const end = password.value.length;
      password.setSelectionRange(end, end);
    };
    button.addEventListener("click", toggle);
    holder.appendChild(button);

    return () => {
      button.removeEventListener("click", toggle);
      button.remove();
    };
  }, []);

  return null;
}

/* Icônes en ligne : le composant écrit dans le DOM, il ne rend pas de JSX. */
const EYE =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';

const EYE_OFF =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.8A17.7 17.7 0 0 0 2 13s3.6 7 10 7a9.7 9.7 0 0 0 4.5-1.1"/><path d="m3 3 18 18"/><path d="M9.9 10.1a3 3 0 0 0 4.2 4.2"/></svg>';
