import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

// POST: Create a new cron job
router.post("/", async (req, res) => {
  try {
    const { frequency } = req.body;

    // Validate frequency
    const validExpressions = {
      "0 * * * *": true,      // Hourly
      "0 0 * * *": true,      // Daily
      "0 0 * * 0": true,      // Weekly
      "0 0 1 * *": true,      // Monthly
      "0 0 1 1 *": true       // Yearly
    };

    if (!frequency || !validExpressions[frequency]) {
      return res.status(400).json({ error: "Invalid frequency provided" });
    }

    // Insert into cron_jobs table
    const { data, error } = await supabase
      .from("cron_jobs")
      .insert([
        {
          expression: frequency,
          status: "ACTIVE",
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) {
      console.error("[Cron Jobs] Failed to create cron job", error.message || error);
      return res.status(500).json({ error: "Failed to schedule cron job" });
    }

    res.status(201).json({ 
      success: true, 
      message: "Cron job scheduled successfully",
      data: data[0]
    });
  } catch (err) {
    console.error("[Cron Jobs] Error creating cron job", err);
    res.status(500).json({ error: "Failed to schedule cron job" });
  }
});

// DELETE: Delete a cron job
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Cron job ID is required" });
    }

    // Delete from cron_jobs table
    const { error } = await supabase
      .from("cron_jobs")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[Cron Jobs] Failed to delete cron job", error.message || error);
      return res.status(500).json({ error: "Failed to delete cron job" });
    }

    res.status(200).json({ 
      success: true, 
      message: "Cron job deleted successfully" 
    });
  } catch (err) {
    console.error("[Cron Jobs] Error deleting cron job", err);
    res.status(500).json({ error: "Failed to delete cron job" });
  }
});

export default router;