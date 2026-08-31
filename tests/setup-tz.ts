/**
 * Le banc de test tourne en UTC, comme les fonctions Vercel.
 *
 * Sans cela, un poste réglé sur Paris rend n'importe quel oubli de `timeZone`
 * INVISIBLE : `toLocaleString` y donne spontanément la bonne heure, et le test
 * passe au vert pour une raison qui n'existe pas en production. C'est
 * exactement ce qui a laissé partir des confirmations de rendez-vous annonçant
 * 08:00 pour une session de 10:00 (parcours 9, constaté le 31/08/2026).
 *
 * Node relit `process.env.TZ` à chaque formatage : l'affecter ici suffit, et
 * couvre chaque worker de vitest, quel que soit le fuseau de la machine.
 */
process.env.TZ = "UTC";
