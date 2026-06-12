import { startServer, startUploadWorker } from "./app.js";

if (process.env.WORKER_MODE === "upload") {
  startUploadWorker();
} else {
  startServer();
}
