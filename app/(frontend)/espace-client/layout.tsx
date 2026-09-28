import Image from "next/image";
import Link from "next/link";

/**
 * Châssis de l'espace client.
 *
 * La navigation du site est retirée de tout l'espace (voir ConditionalHeader) :
 * sans ce bandeau, le client se retrouverait sur des pages sans marque et sans
 * moyen de revenir — on ne sait plus chez qui on est. Il ne reprend donc que le
 * strict nécessaire, le logo, et laisse la navigation interne aux pages
 * elles-mêmes (« ← Mon espace », déconnexion).
 *
 * Le logo pointe vers le centre d'aide, seule destination qui ait du sens dans
 * les deux cas : connecté ou non.
 */
export default function EspaceClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Au-dessus du contenu : une page peut peindre un fondu jusque derrière
          le logo (voir la page « Signature ») sans le recouvrir. */}
      <div className="relative z-10 px-6 pt-8 sm:px-8">
        <Link href="/" className="inline-flex" aria-label="Centre d'aide TIM Management">
          <Image
            src="/logo-support.webp"
            alt="TIM Management"
            width={160}
            height={32}
            className="h-8 w-auto"
            // Hauteur fixée par la classe : la largeur doit suivre, sinon Next
            // signale une image déformée.
            style={{ width: "auto" }}
            priority
          />
        </Link>
      </div>
      {children}
    </>
  );
}
