import { app } from "./app";
import { config } from "./config";
import { initializeDatabase } from "./db/database";

const start = async () => {
  try {
    initializeDatabase();

    app.listen(config.port, () => {
      console.log(`Fabrknt Compliance QN Add-On running at http://localhost:${config.port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

start();
