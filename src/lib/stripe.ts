// Stripe client — lazy-initialized so the server boots without Stripe
// credentials in local dev. Uses Checkout Sessions (not Payment Links)
// because Checkout Sessions accept inline price_data and don't require
// pre-created Product/Price objects — which is exactly what we want for
// Kris Jenner's close-asset flow where each deal gets a single-use URL.
import Stripe from "stripe";

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_API_KEY;
    if (!key) {
      throw new Error("[Stripe] STRIPE_API_KEY required");
    }
    _stripe = new Stripe(key);
  }
  return _stripe;
}

interface CreateCloseCheckoutInput {
  dealId: string;
  agencyLeadId: string;
  businessName: string;
  amountCents: number; // e.g., 250000 for $2,500.00
  productName?: string; // defaults to "FlyNerd Build Package — {businessName}"
  successUrl?: string;
  cancelUrl?: string;
}

/**
 * Create a single-use Stripe Checkout Session for post-call close.
 * Uses inline price_data so no pre-created Product/Price is required.
 * Returns the session URL the prospect clicks to pay.
 */
export async function createCloseCheckoutSession(
  input: CreateCloseCheckoutInput,
): Promise<{ sessionId: string; url: string }> {
  const stripe = getStripe();
  const productName =
    input.productName ?? `FlyNerd Build Package — ${input.businessName}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: productName },
          unit_amount: input.amountCents,
        },
        quantity: 1,
      },
    ],
    success_url:
      input.successUrl ??
      "https://flynerd.tech/thanks?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: input.cancelUrl ?? "https://flynerd.tech/",
    metadata: {
      dealId: input.dealId,
      agencyLeadId: input.agencyLeadId,
      businessName: input.businessName,
      source: "kris_jenner_close",
    },
  });

  if (!session.url) {
    throw new Error("[Stripe] Checkout session created without a URL");
  }

  return { sessionId: session.id, url: session.url };
}
