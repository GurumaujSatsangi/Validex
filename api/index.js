import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import serverless from "serverless-http";

import uploadRoutes from "../backend/routes/upload.js";
import uploadPdfRoutes from "../backend/routes/uploadPdf.js";
import providerRoutes from "../backend/routes/providers.js";
import validationRunRoutes from "../backend/routes/validationRuns.js";
import issueRoutes from "../backend/routes/issues.js";
import exportRoutes from "../backend/routes/export.js";
import { supabase } from "../backend/supabaseClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Views and static paths relative to project root on Vercel
const projectRoot = process.cwd();
app.set("view engine", "ejs");
app.set("views", path.join(projectRoot, "views"));

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets
app.use(express.static(path.join(projectRoot, "public")));

// API routes
app.use("/api/upload", uploadRoutes);
app.use("/api/upload", uploadPdfRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/validation-runs", validationRunRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api/directory", exportRoutes);

// Page routes
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
      console.error("Failed to load runs", error.message || error);
      return res.render("runs", { runs: [] });
    }

    res.render("runs", { runs: data });
  } catch (err) {
    console.error("Error fetching runs", err);
    res.render("runs", { runs: [] });
  }
});

export default serverless(app);
