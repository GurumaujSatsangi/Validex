import express from "express";
import { supabase } from "../supabaseClient.js";
import { fetchProviderByNpi } from "../services/tools/npiClient.js";
import { runValidationForSingleProvider } from "../services/validationService.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const { status, search, limit } = req.query;

  let query = supabase
    .from("providers")
    .select("*, validation_issues(count)")
    .order("name");

  if (status) query = query.eq("status", status);
  if (limit) query = query.limit(Number(limit));
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const providers = data.map(p => ({
    ...p,
    issues_count: p.validation_issues[0]?.count || 0
  }));

  res.json({ providers });
});

router.get("/:id", async (req, res) => {
  const { data, error } = await supabase
    .from("providers")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) return res.status(500).json({ error: "Provider not found" });
  res.json(data);
});

router.get("/:id/issues", async (req, res) => {
  const { data, error } = await supabase
    .from("validation_issues")
    .select("*")
    .eq("provider_id", req.params.id);

  if (error) return res.status(500).json({ error: "Issues not found" });
  res.json({ issues: data });
});

// DELETE /api/providers/:id - remove provider and related data
router.delete('/:id', async (req, res) => {
  const providerId = req.params.id;

  try {
    const { error: issuesErr } = await supabase
      .from('validation_issues')
      .delete()
      .eq('provider_id', providerId);

    if (issuesErr) {
      console.error('Failed to delete validation issues for provider', providerId, issuesErr.message || issuesErr);
      return res.status(500).json({ error: 'Could not delete provider issues' });
    }

    const { error: sourcesErr } = await supabase
      .from('provider_sources')
      .delete()
      .eq('provider_id', providerId);

    if (sourcesErr) {
      console.error('Failed to delete provider sources', providerId, sourcesErr.message || sourcesErr);
      return res.status(500).json({ error: 'Could not delete provider sources' });
    }

    const { error: providerErr } = await supabase
      .from('providers')
      .delete()
      .eq('id', providerId);

    if (providerErr) {
      console.error('Failed to delete provider', providerId, providerErr.message || providerErr);
      return res.status(500).json({ error: 'Could not delete provider' });
    }

    res.status(204).send();
  } catch (err) {
    console.error('Unexpected error deleting provider', providerId, err);
    res.status(500).json({ error: 'Unexpected error deleting provider' });
  }
});

// DELETE /api/providers/delete-all - delete all providers and related data
router.delete('/delete-all', async (req, res) => {
  try {
    // Get all provider IDs first
    const { data: allProviders, error: fetchErr } = await supabase
      .from('providers')
      .select('id');

    if (fetchErr) {
      console.error('Failed to fetch providers:', fetchErr.message || fetchErr);
      return res.status(500).json({ error: 'Could not fetch providers' });
    }

    if (!allProviders || allProviders.length === 0) {
      // No providers to delete
      return res.status(204).send();
    }

    const providerIds = allProviders.map(p => p.id);

    // Delete all validation issues for all providers
    const { error: issuesErr } = await supabase
      .from('validation_issues')
      .delete()
      .in('provider_id', providerIds);

    if (issuesErr) {
      console.error('Failed to delete all validation issues:', issuesErr.message || issuesErr);
      return res.status(500).json({ error: 'Could not delete validation issues' });
    }

    // Delete all provider sources
    const { error: sourcesErr } = await supabase
      .from('provider_sources')
      .delete()
      .in('provider_id', providerIds);

    if (sourcesErr) {
      console.error('Failed to delete all provider sources:', sourcesErr.message || sourcesErr);
      return res.status(500).json({ error: 'Could not delete provider sources' });
    }

    // Delete all providers
    const { error: providersErr } = await supabase
      .from('providers')
      .delete()
      .in('id', providerIds);

    if (providersErr) {
      console.error('Failed to delete all providers:', providersErr.message || providersErr);
      return res.status(500).json({ error: 'Could not delete providers' });
    }

    res.status(204).send();
  } catch (err) {
    console.error('Unexpected error deleting all providers:', err);
    res.status(500).json({ error: 'Unexpected error deleting providers' });
  }
});

// POST /api/providers/add-by-npi - Add provider by NPI and run validation
router.post('/add-by-npi', async (req, res) => {
  const { npi } = req.body;

  console.log(`[Providers API] Add by NPI request received:`, npi);

  try {
    // Validate NPI input
    if (!npi || typeof npi !== 'string') {
      return res.status(400).json({ error: 'NPI is required and must be a string' });
    }

    const cleanNpi = npi.trim();
    
    if (!/^\d{10}$/.test(cleanNpi)) {
      return res.status(400).json({ error: 'Invalid NPI format. Must be exactly 10 digits.' });
    }

    // Check if provider already exists
    const { data: existingProvider } = await supabase
      .from('providers')
      .select('id, name')
      .eq('npi_id', cleanNpi)
      .single();

    if (existingProvider) {
      console.log(`[Providers API] Provider with NPI ${cleanNpi} already exists`);
      return res.status(409).json({ 
        error: 'Provider already exists',
        providerId: existingProvider.id,
        providerName: existingProvider.name
      });
    }

    // Fetch provider data from NPI Registry
    let providerData;
    try {
      providerData = await fetchProviderByNpi(cleanNpi);
    } catch (err) {
      console.error(`[Providers API] Failed to fetch NPI data:`, err.message);
      return res.status(404).json({ error: err.message });
    }

    // Insert provider into database
    const { data: newProvider, error: insertErr } = await supabase
      .from('providers')
      .insert({
        npi_id: providerData.npi_id,
        name: providerData.name,
        phone: providerData.phone,
        email: providerData.email,
        address_line1: providerData.address_line1,
        city: providerData.city,
        state: providerData.state,
        zip: providerData.zip,
        speciality: providerData.speciality,
        license_number: providerData.license_number,
        license_state: providerData.license_state,
        license_status: providerData.license_status,
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertErr) {
      console.error(`[Providers API] Failed to insert provider:`, insertErr.message);
      return res.status(500).json({ error: 'Failed to insert provider into database' });
    }

    const providerId = newProvider.id;
    console.log(`[Providers API] Provider created successfully:`, providerId);

    // Insert NPI data as provider_source
    const { error: sourceErr } = await supabase
      .from('provider_sources')
      .insert({
        provider_id: providerId,
        source_type: 'NPI_API',
        raw_data: {
          isFound: true,
          npi: providerData.npi_id,
          name: providerData.name,
          phone: providerData.phone,
          speciality: providerData.speciality,
          address: {
            address_1: providerData.address_line1,
            address_2: providerData.address_line2,
            city: providerData.city,
            state: providerData.state,
            postal_code: providerData.zip
          },
          license: providerData.license_number,
          raw: providerData.npi_raw_data
        }
      });

    if (sourceErr) {
      console.error(`[Providers API] Failed to insert provider source:`, sourceErr.message);
      // Don't fail the request, just log
    }

    // Run validation workflow asynchronously
    console.log(`[Providers API] Starting validation for provider ${providerId}`);
    
    // Run validation in background and send response immediately
    runValidationForSingleProvider(providerId)
      .then(runId => {
        console.log(`[Providers API] Validation completed for provider ${providerId}, run ${runId}`);
      })
      .catch(err => {
        console.error(`[Providers API] Validation failed for provider ${providerId}:`, err.message);
      });

    // Return success response immediately
    res.status(201).json({
      success: true,
      message: 'Provider added successfully. Validation started.',
      providerId: providerId,
      providerName: newProvider.name,
      npi: cleanNpi
    });

  } catch (err) {
    console.error('[Providers API] Unexpected error in add-by-npi:', err);
    res.status(500).json({ error: 'Unexpected server error' });
  }
});

export default router;
