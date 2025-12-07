# PDF OCR Ingestion - Debugging Guide

## Issue: "Extracted 0 text blocks from OCR"

This error means the PDF is being sent to Azure Vision OCR API and returning successfully, but no text is being extracted.

### Possible Causes:

1. **PDF has no text content** - The PDF is either empty or contains only images (scanned document)
2. **OCR response structure mismatch** - Azure is returning data but our parser can't find it
3. **Azure OCR not processing the PDF correctly** - API might not be extracting text properly

### Steps to Debug:

#### Step 1: Check Azure Credentials
```powershell
# In your .env file, verify:
# - AZURE_VISION_ENDPOINT should be like: https://[region].api.cognitive.microsoft.com
# - AZURE_VISION_KEY should be your Azure Vision Key
# - The endpoint should NOT have a trailing slash (now handled by code)

# Format should be:
AZURE_VISION_ENDPOINT=https://scanned-pdf-parsing.cognitiveservices.azure.com
AZURE_VISION_KEY=your_key_here
```

#### Step 2: Create a Test PDF with Text
```powershell
# Option A: Use Python script (requires reportlab)
pip install reportlab
cd backend
python create_test_pdf.py
# This creates test_providers.pdf with sample providers

# Option B: Upload a PDF that definitely contains readable text
# Make sure the PDF has:
# - Provider names
# - NPI numbers (format: NPI: 1234567890)
# - Phone numbers (format: Phone: (555) 123-4567)
# - Addresses (format: Street address with number)
# - City, State, ZIP
```

#### Step 3: Test with Debug Logging
The backend now logs detailed information. When you upload a PDF:

1. Watch the backend terminal for these messages:
   ```
   [Azure OCR] Sending PDF to Azure Vision API...
   [Azure OCR] PDF Buffer size: XXXX bytes
   [Azure OCR] Operation started, polling URL: ...
   [Azure OCR] Status: succeeded
   [Azure OCR] Response data keys: [...]
   [PDF Ingestion] OCR Result keys: [...]
   [PDF Ingestion] Processing X pages
   [PDF Ingestion] Page has X lines
   [PDF Ingestion] Extracted X text blocks from OCR
   ```

2. If you see "Extracted 0 text blocks", the issue is in the response structure

#### Step 4: Check Azure Vision API Status
```powershell
# Test if Azure Vision API is accessible
$endpoint = "https://scanned-pdf-parsing.cognitiveservices.azure.com"
$key = "your_key_here"

$headers = @{
    "Ocp-Apim-Subscription-Key" = $key
}

Invoke-WebRequest -Uri "$endpoint/vision/v3.2/read/analyze" `
  -Method Post `
  -Headers $headers `
  -ContentType "application/pdf" `
  -Body @() `
  -ErrorAction SilentlyContinue
```

### Expected Log Output When Working:

```
[PDF Ingestion] Extracted 4 text blocks from OCR
[PDF Ingestion] First few text blocks: Dr. John Smith | NPI: 1234567890 | Phone: (555) 123-4567
[PDF Ingestion] Parsed 2 providers from OCR text
[PDF Ingestion] Successfully inserted 2 providers
[PDF Ingestion] Validation run created: abc-123-def
```

### If Still Not Working:

1. **Restart the server** after any .env changes:
   ```powershell
   Get-Process node | Stop-Process -Force
   npm start
   ```

2. **Check backend console** for detailed Azure errors

3. **Verify PDF is readable**:
   - Open the PDF in Adobe Reader or browser
   - Copy text manually - if you can't copy text, Azure can't read it either
   - Scanned PDFs (images) need manual OCR and won't work with this setup

4. **Test Azure credentials separately** using the PowerShell command above

### Provider Data Format for Best Results:

The parser looks for these patterns in the PDF text:

```
Dr. John Smith                          <- Provider name (first line)
NPI: 1234567890                         <- NPI (10 digits after "NPI:")
Phone: (555) 123-4567                   <- Phone number after "Phone:"
123 Main Street                         <- Address (contains number + street keyword)
New York, NY 10001                      <- City, State, ZIP
Cardiologist                            <- Specialty (optional)
```

Each provider should be separated by blank lines or delimiters.
