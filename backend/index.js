import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createAgent, tool } from "langchain";
import { z } from "zod";

import uploadRoutes from "./routes/upload.js";
import uploadPdfRoutes from "./routes/uploadPdf.js";
import providerRoutes from "./routes/providers.js";
import validationRunRoutes from "./routes/validationRuns.js";
import issueRoutes from "./routes/issues.js";
import exportRoutes from "./routes/export.js";
import { sendRunCompletionEmail } from "./services/agents/emailGenerationAgent.js";
import { supabase } from "./supabaseClient.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      console.error('Failed to load runs', error.message || error);
      return res.render("runs", { runs: [] });
    }

    res.render("runs", { runs: data });
  } catch (err) {
    console.error('Error fetching runs', err);
    res.render("runs", { runs: [] });
  }
});

// Test endpoint to check if emails are working
app.get("/debug/test-smtp", async (req, res) => {
  try {
    console.log("[Debug SMTP] SMTP_HOST:", process.env.SMTP_HOST);
    console.log("[Debug SMTP] SMTP_USER:", process.env.SMTP_USER);
    console.log("[Debug SMTP] SMTP_PASSWORD set:", !!process.env.SMTP_PASSWORD);
    
    const { data: runs } = await supabase
      .from("validation_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1);

    if (!runs || runs.length === 0) {
      return res.json({ error: "No validation runs found", smtp_config: { host: process.env.SMTP_HOST, user: process.env.SMTP_USER } });
    }

    await sendRunCompletionEmail(runs[0].id, ["test"]);
    res.json({ success: true, message: "Test email sent" });
  } catch (err) {
    console.error("[Debug SMTP] Error:", err.message);
    res.status(500).json({ error: err.message, smtp_host: process.env.SMTP_HOST });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`TrueLens server running on http://localhost:${PORT}`);
});
