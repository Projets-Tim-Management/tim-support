import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getCategoryBySlug,
  getArticlesByCategory,
  getAllCategorySlugs,
} from "@/lib/wordpress";
import ArticleCard from "@/components/ui/ArticleCard";
import Breadcrumb from "@/components/ui/Breadcrumb";

export const revalidate = 3600;

export async function generateStaticParams() {
  const slugs = await getAllCategorySlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};
  return {
    title: `${category.name} – Centre d'aide TIM`,
    description:
      category.description ||
      `Tous les guides sur ${category.name} dans TIM Management.`,
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [category, articles] = await Promise.all([
    getCategoryBySlug(slug),
    (async () => {
      const cat = await getCategoryBySlug(slug);
      if (!cat) return [];
      return getArticlesByCategory(cat.id, 20);
    })(),
  ]);

  if (!category) notFound();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Breadcrumb items={[{ label: category.name }]} />

      <header className="mt-6 mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          {category.name}
        </h1>
        {category.description && (
          <p className="mt-2 text-muted">{category.description}</p>
        )}
        <p className="mt-1 text-sm text-muted">
          {category.count} article{category.count > 1 ? "s" : ""}
        </p>
      </header>

      {articles.length === 0 ? (
        <p className="text-muted">Aucun article dans cette catégorie.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  );
}
