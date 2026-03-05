import { Request, Response, NextFunction } from "express";
import { config } from "../config";

export function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
  const [username, password] = credentials.split(":");

  if (username !== config.qnBasicAuthUsername || password !== config.qnBasicAuthPassword) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  next();
}
