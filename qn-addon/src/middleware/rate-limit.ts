import rateLimit from "express-rate-limit";

export const standardRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many API requests, please try again later." },
  keyGenerator: (req) => {
    return (req.headers["x-quicknode-id"] as string) || req.ip || "unknown";
  },
});
