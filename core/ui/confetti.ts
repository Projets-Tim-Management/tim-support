/**
 * Petit burst de confettis depuis une position précise (en coords écran).
 * Pur Canvas, zéro dépendance, ~1 s d'animation puis cleanup auto.
 *
 * Usage : burstAt(centerX, centerY)
 */

interface Particle {
  x:        number;
  y:        number;
  vx:       number;
  vy:       number;
  size:     number;
  rotation: number;
  rotSpeed: number;
  color:    string;
  shape:    "rect" | "circle";
  life:     number;
}

const COLORS = [
  "#fe5464", // primary rouge
  "#fcc35b", // processing jaune
  "#1bc181", // success vert
  "#4A90E2", // absence bleu
  "#9281C8", // unavailable violet
];

const GRAVITY = 0.22;
const DRAG    = 0.985;

export function burstAt(x: number, y: number, particleCount = 60): void {
  if (typeof window === "undefined") return;

  // Canvas overlay plein écran (pour que les particules puissent voler loin
  // sans être coupées par le conteneur du bouton).
  const canvas = document.createElement("canvas");
  canvas.style.position      = "fixed";
  canvas.style.inset         = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex        = "9999";
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return; }

  // Génération des particules — explosion radiale autour du point.
  const particles: Particle[] = [];
  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 7;
    particles.push({
      x,
      y,
      vx:       Math.cos(angle) * speed,
      vy:       Math.sin(angle) * speed - 3, // léger boost vers le haut
      size:     5 + Math.random() * 5,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.4,
      color:    COLORS[Math.floor(Math.random() * COLORS.length)],
      shape:    Math.random() > 0.5 ? "rect" : "circle",
      life:     3000,
    });
  }

  function frame() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vx       *= DRAG;
      p.vy       = p.vy * DRAG + GRAVITY;
      p.x       += p.vx;
      p.y       += p.vy;
      p.rotation += p.rotSpeed;
      p.life    -= 16;

      if (p.y > canvas.height + 50 || p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      if (p.shape === "rect") {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (particles.length > 0) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  }

  requestAnimationFrame(frame);
}
