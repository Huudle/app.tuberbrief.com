export const PLANS = {
  free: {
    name: "Free",
    description: "Perfect for getting started",
    price: {
      amount: 0,
      currency: "USD",
      interval: "month",
    },
    limit: 1,
    features: [
      "Up to 1 YouTube channel",
      "Daily digest notifications",
      "Full transcripts included",
      "Basic AI summary (1 sentence)",
    ],
  },
  basic: {
    name: "Basic",
    description: "For growing content creators",
    price: {
      amount: 5,
      currency: "USD",
      interval: "month",
    },
    limit: 5,
    features: [
      "Up to 5 YouTube channels",
      "Instant notifications",
      "Full transcripts included",
      "Advanced AI summary (Multiple sentences)",
      "Key points (bullet points)",
    ],
  },
  pro: {
    name: "Pro",
    description: "For serious content managers",
    price: {
      amount: 15,
      currency: "USD",
      interval: "month",
    },
    limit: 15,
    features: [
      "Up to 15 YouTube channels",
      "Instant notifications",
      "Full transcripts included",
      "Advanced AI summary (Multiple sentences)",
      "Key points (bullet points)",
      "Custom notification styles",
      "Webhooks",
      "Priority support",
    ],
  },
} as const;

export type UserPlan = keyof typeof PLANS;

// For backward compatibility
export const PLAN_LIMITS: Record<UserPlan, number> = {
  free: PLANS.free.limit,
  basic: PLANS.basic.limit,
  pro: PLANS.pro.limit,
};
