import { Router, Request, Response, NextFunction } from "express";
import { instanceLookup } from "../middleware/instance-lookup";
import { apiRateLimit } from "../middleware/rate-limit";
import { screenAddress, AddressScreeningResult } from "../services/compliance-service";

export const screeningRouter = Router();

screeningRouter.use(instanceLookup);
screeningRouter.use(apiRateLimit);

// POST /v1/screen/address — stateless address format detection + sanctions list check
screeningRouter.post("/address", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.body as { address: string };

    if (!address) {
      res.status(400).json({ error: "Missing required field: address" });
      return;
    }

    const result = await screenAddress(address);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// POST /v1/screen/batch — batch address screening (max 100)
screeningRouter.post("/batch", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { addresses } = req.body as { addresses: string[] };

    if (!addresses || !Array.isArray(addresses)) {
      res.status(400).json({ error: "Missing required field: addresses (array)" });
      return;
    }

    if (addresses.length > 100) {
      res.status(400).json({ error: "Maximum 100 addresses per batch" });
      return;
    }

    const results: AddressScreeningResult[] = await Promise.all(
      addresses.map((addr) => screenAddress(addr))
    );

    res.status(200).json({ results, count: results.length });
  } catch (error) {
    next(error);
  }
});
