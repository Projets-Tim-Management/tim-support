import { NextResponse } from "next/server";
import { getSession } from "@/modules/partner/lib/session";
import { redeemReward } from "@/modules/partner/lib/partner";

// Échange de points contre une récompense.
// L'identité du partenaire vient de la session JWT (jamais du corps de la
// requête) : impossible de dépenser les points d'autrui.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { code: "unauthorized", message: "Connectez-vous depuis l'app pour échanger des points." },
      { status: 401 }
    );
  }

  let rewardId = 0;
  try {
    const body = await req.json();
    rewardId = Number(body?.reward_id);
  } catch {
    /* corps invalide → rewardId reste 0 */
  }

  if (!Number.isInteger(rewardId) || rewardId <= 0) {
    return NextResponse.json(
      { code: "invalid_reward", message: "Récompense invalide." },
      { status: 400 }
    );
  }

  const { status, data } = await redeemReward(session.email, rewardId);
  return NextResponse.json(data, { status });
}
