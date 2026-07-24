import { Suspense } from "react";
import { getFeatureCategories } from "@/lib/wordpress";
import FeatureSidebar from "@/components/features/FeatureSidebar";
import MobileSidebarTrigger from "@/components/features/MobileSidebarTrigger";
import { ActiveCategoryProvider } from "@/components/features/active-category-context";

export default async function FeaturesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = await getFeatureCategories();

  return (
    <ActiveCategoryProvider>
      <div className="flex items-start">

        {/* Sidebar — masquée sur mobile (< lg), sticky sous le header sur desktop.
            Scroll interne uniquement si la liste dépasse la hauteur du viewport. */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-border bg-white sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="p-4 pt-6">
            <Suspense>
              <FeatureSidebar categories={categories} />
            </Suspense>
          </div>
        </aside>

        {/* Contenu — flow normal, le scroll appartient à la page (donc le footer
            est atteignable en bas), pas à un sous-conteneur. */}
        <div className="flex-1 min-w-0">
          {/* Petite icône + "Voir tout" — discrète, juste au-dessus du fil
              d'Ariane. Marge négative en bas pour "manger" l'espace ajouté par
              le py-10 / py-8 des pages enfant et garder un look serré.
              ⚠️ Pas de backdrop-blur ici : ça créerait un containing block qui
              empêcherait le drawer fixed de couvrir le viewport. */}
          <div className="lg:hidden px-4 pt-3 -mb-6 relative z-10">
            <Suspense>
              <MobileSidebarTrigger categories={categories} />
            </Suspense>
          </div>

          {children}
        </div>

      </div>
    </ActiveCategoryProvider>
  );
}
