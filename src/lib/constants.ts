export const PLANS = {
  free: {
    name: "Free",
    description: "Perfect for getting started",
    price: {
      amount: 0,
      currency: "USD",
      interval: "month",
    },
    limit: 3,
    features: [
      "Up to 3 YouTube channels",
      "Daily digest notifications",
      "Advanced AI summary",
    ],
  },
  basic: {
    name: "Basic",
    description: "For power YouTube users/content creators",
    price: {
      amount: 5,
      currency: "USD",
      interval: "month",
    },
    limit: 10,
    features: [
      "Up to 10 YouTube channels",
      "Advanced AI summary",
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
    limit: 35,
    features: [
      "Up to 35 YouTube channels",
      "Advanced AI summary",
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
