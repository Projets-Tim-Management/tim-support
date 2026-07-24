import type { Metadata } from "next";
import { searchArticles } from "@/lib/wordpress";
import ArticleCard from "@/components/ui/ArticleCard";
import SearchBar from "@/components/ui/SearchBar";
import Breadcrumb from "@/components/ui/Breadcrumb";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  return {
    title: q ? `Résultats pour "${q}"` : "Recherche",
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query ? await searchArticles(query, 15) : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Breadcrumb items={[{ label: "Recherche" }]} />

      <div className="mt-6 mb-8 max-w-2xl">
        <SearchBar defaultValue={query} />
      </div>

      {query ? (
        <>
          <p className="text-sm text-muted mb-6">
            {results.length === 0
              ? `Aucun résultat pour « ${query} »`
              : `${results.length} résultat${results.length > 1 ? "s" : ""} pour « ${query} »`}
          </p>

          {results.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-4xl">🔍</p>
              <p className="font-medium text-foreground">
                Aucun article trouvé
              </p>
              <p className="text-sm text-muted">
                Essayez avec des mots-clés différents ou{" "}
                <a
                  href="https://tim-management.co/contact"
                  className="text-primary underline"
                >
                  contactez le support
                </a>
                .
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="text-muted">
          Saisissez un terme pour lancer la recherche.
        </p>
      )}
    </div>
  );
}
