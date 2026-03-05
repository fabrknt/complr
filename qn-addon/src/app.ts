import express from "express";
import cors from "cors";
import morgan from "morgan";
import { errorHandler } from "./middleware/error-handler";
import { requestId } from "./middleware/request-id";
import { healthcheckRouter } from "./routes/healthcheck";
import { provisionRouter } from "./routes/provision";
import { complianceRouter } from "./routes/compliance";
import { screeningRouter } from "./routes/screening";

export const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("combined"));
app.use(requestId);

app.use("/healthcheck", healthcheckRouter);
app.use("/provision", provisionRouter);
app.use("/v1", complianceRouter);
app.use("/v1/screen", screeningRouter);

app.use(errorHandler);
