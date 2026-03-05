import { Router, Request, Response } from "express";

export const healthcheckRouter = Router();

healthcheckRouter.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "complr-qn-addon",
    timestamp: new Date().toISOString(),
  });
});
