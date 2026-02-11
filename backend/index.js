import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import http from "http";
import { createAgent, tool } from "langchain";
import { z } from "zod";

import uploadRoutes from "./routes/upload.js";
import uploadPdfRoutes from "./routes/uploadPdf.js";
import providerRoutes from "./routes/providers.js";
import validationRunRoutes from "./routes/validationRuns.js";
import issueRoutes from "./routes/issues.js";
import exportRoutes from "./routes/export.js";
import cronJobRoutes from "./routes/cron-jobs.js";
import { sendRunCompletionEmail } from "./services/agents/emailGenerationAgent.js";
import { supabase } from "./supabaseClient.js";
import { initializeCronJobs, stopAllCronJobs } from "./services/cronScheduler.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(express.static(path.join(__dirname, "../public")));

  app.use("/api/upload", uploadRoutes);
  app.use("/api/upload", uploadPdfRoutes);
  app.use("/api/providers", providerRoutes);
  app.use("/api/validation-runs", validationRunRoutes);
  app.use("/api/issues", issueRoutes);
  app.use("/api/directory", exportRoutes);
  app.use("/api/cron-jobs", cronJobRoutes);

  app.get("/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      uptime: process.uptime()
    });
  });

  app.get("/cron-job", (req, res) => {
    res.redirect(301, "/cron-jobs");
  });


  app.get("/issues/:id",async(req,res)=>{

    const {data,error} = await supabase.from("validation_issues").select("*").eq("provider_id",req.params.id);
    const {data:providerdata, error:providerissues} = await supabase.from("providers").select("*").eq("id",req.params.id).single();

    res.render("provider-issues.ejs",{issues:data,providerdata: providerdata});
  })

  app.get("/cron-jobs", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("cron_jobs")
        .select("*");

      if (error) {
        console.error("[Cron Jobs] Failed to load cron jobs", error.message || error);
        return res.render("cron-jobs", { crons: [], error: "Failed to load cron jobs." });
      }

      res.render("cron-jobs", { crons: data ?? [], error: null });
    } catch (err) {
      console.error("[Cron Jobs] Error fetching cron jobs", err);
      res.render("cron-jobs", { crons: [], error: "Failed to load cron jobs." });
    }
  });

  app.get("/", (req, res) => res.render("index"));
  app.get("/upload", (req, res) => res.render("upload"));
  app.get("/add-provider", (req, res) => res.render("add-provider-by-npi"));
  app.get("/providers", (req, res) => res.render("providers"));
  app.get("/provider/:id", (req, res) => res.render("provider", { providerId: req.params.id }));
  app.get("/runs", async (req, res) => {
    try {
        const { data, error } = await supabase
          .from("validation_runs")
          .select("*")
          .order("started_at", { ascending: false });

      if (error) {
        console.error('[Runs] Failed to load runs', error.message || error);
        return res.render("runs", { runs: [] });
      }

      res.render("runs", { runs: data });
    } catch (err) {
      console.error('[Runs] Error fetching runs', err);
      res.render("runs", { runs: [] });
    }
  });

  // Test endpoint to check if emails are working
  app.get("/debug/test-smtp", (req, res) => {
    try {
      console.log("\n========== [DEBUG SMTP TEST] ==========");
      console.log("[Debug SMTP] SMTP_HOST:", process.env.SMTP_HOST || 'NOT SET');
      console.log("[Debug SMTP] SMTP_PORT:", process.env.SMTP_PORT || 'NOT SET');
      console.log("[Debug SMTP] SMTP_USER:", process.env.SMTP_USER || 'NOT SET');
      console.log("[Debug SMTP] SMTP_PASSWORD set:", !!process.env.SMTP_PASSWORD);
      console.log("[Debug SMTP] SMTP_FROM:", process.env.SMTP_FROM || 'NOT SET');
      console.log("[Debug SMTP] ADMIN_EMAIL:", process.env.ADMIN_EMAIL || 'NOT SET');
      console.log("========== [END DEBUG] ==========\n");
      
      res.json({ 
        success: true, 
        message: "SMTP configuration loaded",
        env_vars: {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT,
          user: process.env.SMTP_USER,
          from: process.env.SMTP_FROM,
          admin_email: process.env.ADMIN_EMAIL
        }
      });
    } catch (err) {
      console.error("[Debug SMTP] Error:", err.message);
      res.status(500).json({ 
        error: err.message
      });
    }
  });

  return app;
}

export async function startServer({ port = process.env.PORT || 5000, host = "0.0.0.0" } = {}) {
  const app = createServer();
  const server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.on("error", (err) => {
      console.error("[Startup] Server failed to start:", err.message);
      reject(err);
    });
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      console.log(`[Startup] Server started on ${host}:${actualPort}`);
      resolve();
    });
  });

  // Initialize cron jobs after server starts
  await initializeCronJobs();

  return { app, server };
}

export async function stopServer(server) {
  if (!server) return;
  
  // Stop all cron jobs
  stopAllCronJobs();
  
  await new Promise((resolve) => {
    server.close(() => {
      console.log("[Shutdown] Server stopped");
      resolve();
    });
  });
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (isDirectRun) {
  startServer().then(() => {
    const port = process.env.PORT || 5000;
    console.log(`TrueLens server running on http://localhost:${port}`);
  }).catch((err) => {
    console.error('[Startup] Failed to start server:', err.message);
    process.exit(1);
  });
}
