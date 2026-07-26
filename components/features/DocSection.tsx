import Image from "next/image";
import type { DocSection as DocSectionType, MediaDocItem, WPMedia } from "@/core/lib/types";
import ImageCarousel from "./ImageCarousel";

type AcfImage = WPMedia | Record<string, unknown> | null | undefined;

/** Normalise une image ACF peu importe le format retourné (objet WP, objet ACF brut, ou URL string). */
function imgSrc(img: AcfImage): string {
  if (!img || typeof img === "string") return "";
  const o = img as Record<string, unknown>;
  if (typeof o.source_url === "string" && o.source_url) return o.source_url;
  if (typeof o.url === "string" && o.url) return o.url;
  return "";
}

function imgAlt(img: AcfImage): string {
  if (!img || typeof img === "string") return "";
  const o = img as Record<string, unknown>;
  return (typeof o.alt_text === "string" ? o.alt_text : "") || (typeof o.alt === "string" ? o.alt : "");
}

function imgWidth(img: AcfImage): number {
  if (!img || typeof img === "string") return 800;
  const o = img as Record<string, unknown>;
  const details = o.media_details as Record<string, unknown> | undefined;
  return (typeof details?.width === "number" ? details.width : 0) || (typeof o.width === "number" ? o.width : 0) || 800;
}

function imgHeight(img: AcfImage): number {
  if (!img || typeof img === "string") return 450;
  const o = img as Record<string, unknown>;
  const details = o.media_details as Record<string, unknown> | undefined;
  return (typeof details?.height === "number" ? details.height : 0) || (typeof o.height === "number" ? o.height : 0) || 450;
}

function MediaBlock({ items }: { items: MediaDocItem[] }) {
  if (!items?.length) return null;

  return (
    <div className="flex flex-col gap-4">
      {items.map((item, i) => {
        if (item.acf_fc_layout === "img" && item.img) {
          const src = imgSrc(item.img);
          if (!src) return null;
          // Les GIF doivent être servis "bruts" — next/image les ré-encode
          // sinon, ce qui casse l'animation ou la limite à une seule passe.
          const isAnimated = /\.gif(\?|$)/i.test(src);
          return (
            <div key={i} className="rounded-lg border border-border bg-surface flex items-center justify-center p-3">
              <Image
                src={src}
                alt={imgAlt(item.img)}
                width={imgWidth(item.img)}
                height={imgHeight(item.img)}
                unoptimized={isAnimated}
                className="w-auto h-auto max-w-full max-h-[510px] object-contain rounded-md border-1 border-black"
              />
            </div>
          );
        }

        if (item.acf_fc_layout === "galerie" && item.galerie?.length) {
          const carouselImages = item.galerie
            .map((img) => ({ src: imgSrc(img), alt: imgAlt(img), width: imgWidth(img), height: imgHeight(img) }))
            .filter((img) => !!img.src);
          return <ImageCarousel key={i} images={carouselImages} />;
        }

        if (item.acf_fc_layout === "editeur" && item.editeur) {
          return (
            <div
              key={i}
              className="wp-content text-sm bg-surface rounded-lg p-4 border border-border"
              dangerouslySetInnerHTML={{ __html: item.editeur }}
            />
          );
        }

        if (item.acf_fc_layout === "fichier" && item.fichier) {
          const sizeKb = item.fichier.filesize
            ? `${Math.round(item.fichier.filesize / 1024)} Ko`
            : null;

          return (
            <a
              key={i}
              href={item.fichier.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-md border border-border hover:border-border hover:bg-surface transition-colors"
            >
              <span className="text-xl">📎</span>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-foreground truncate">
                  {item.fichier.filename}
                </span>
                {sizeKb && (
                  <span className="text-xs text-muted">{sizeKb}</span>
                )}
              </div>
            </a>
          );
        }

        return null;
      })}
    </div>
  );
}

export default function DocSection({ section, index }: { section: DocSectionType; index: number }) {
  const mediaRight = (section.media_position ?? "Droite") === "Droite";
  const hasMedia   = section.media_doc?.length > 0;

  // En fragment plutôt qu'en `flex flex-col` : un conteneur flex établit son
  // propre formatting context et NE wrappe PAS autour des floats voisins.
  // Le fragment laisse les blocs (h3 + .wp-content) s'écouler nativement
  // autour de l'image flottée.
  const textBlock = (
    <>
      {section.title_doc && (
        <h3 className="text-lg font-semibold text-foreground mb-3">
          {section.title_doc}
        </h3>
      )}
      {section.description_doc && (
        <div
          className="wp-content text-sm leading-relaxed text-foreground"
          dangerouslySetInnerHTML={{ __html: section.description_doc }}
        />
      )}
    </>
  );

  const mediaBlock = hasMedia ? (
    <MediaBlock items={section.media_doc} />
  ) : null;

  return (
    <div className={`py-8 ${index > 0 ? "border-t border-border" : ""} after:block after:clear-both after:content-['']`}>
      {hasMedia ? (
        <>
          {/* Mobile : empilé. Desktop : image flottée, texte qui s'enroule
              et passe sous l'image quand il dépasse. La marge `me-/ms-` est
              gérée en logical properties pour suivre `mediaRight`. */}
          <div className={`media-float-wrap ${mediaRight ? "media-right" : "media-left"} mb-6 lg:mb-3 lg:max-w-[50%] lg:w-1/2`}>
            {mediaBlock}
          </div>
          {textBlock}
        </>
      ) : (
        textBlock
      )}
    </div>
  );
}
