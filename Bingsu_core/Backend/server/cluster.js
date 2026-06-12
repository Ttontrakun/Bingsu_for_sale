import cluster from "node:cluster";
import os from "node:os";

const workerCount = Number(process.env.WEB_CONCURRENCY || os.cpus().length);

if (cluster.isPrimary) {
  console.log(`Starting ${workerCount} web workers`);
  for (let i = 0; i < workerCount; i += 1) {
    cluster.fork();
  }
  cluster.on("exit", (worker) => {
    console.warn(`Worker ${worker.process.pid} exited. Restarting...`);
    cluster.fork();
  });
} else {
  import("./index.js");
}
