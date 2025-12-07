import fs from 'fs';
import { sendToAzureOCR, pollOcr } from './services/tools/azureOcrClient.js';
import 'dotenv/config';

/**
 * Debug script to test OCR processing with a sample PDF
 * Usage: node debug-ocr.js <path-to-pdf>
 */

async function testOcr() {
  const pdfPath = process.argv[2];

  if (!pdfPath) {
    console.error('Usage: node debug-ocr.js <path-to-pdf>');
    process.exit(1);
  }

  if (!fs.existsSync(pdfPath)) {
    console.error(`File not found: ${pdfPath}`);
    process.exit(1);
  }

  try {
    console.log(`[Debug] Testing OCR with file: ${pdfPath}`);
    const pdfBuffer = fs.readFileSync(pdfPath);
    console.log(`[Debug] PDF size: ${pdfBuffer.length} bytes`);

    console.log('[Debug] Sending to Azure OCR...');
    const operationUrl = await sendToAzureOCR(pdfBuffer);
    console.log(`[Debug] Operation URL: ${operationUrl}`);

    console.log('[Debug] Polling for completion...');
    const result = await pollOcr(operationUrl);

    console.log('\n========== FULL OCR RESULT ==========');
    console.log(JSON.stringify(result, null, 2));
    console.log('====================================\n');

    // Analyze structure
    console.log('[Debug] Analyzing result structure:');
    if (result.analyzeResult) {
      console.log('  - Has analyzeResult: YES');
      if (result.analyzeResult.readResults) {
        console.log(`  - readResults array length: ${result.analyzeResult.readResults.length}`);
        
        for (let i = 0; i < result.analyzeResult.readResults.length; i++) {
          const page = result.analyzeResult.readResults[i];
          console.log(`  - Page ${i + 1}:`);
          console.log(`    - Lines: ${page.lines ? page.lines.length : 0}`);
          
          if (page.lines && page.lines.length > 0) {
            console.log(`    - First line text: "${page.lines[0].text}"`);
            console.log(`    - Line structure:`, Object.keys(page.lines[0]));
          }
        }
      }
    } else if (result.readResults) {
      console.log('  - Has readResults directly: YES');
      console.log(`  - readResults array length: ${result.readResults.length}`);
    } else {
      console.log('  - No recognized structure found!');
      console.log('  - Root keys:', Object.keys(result));
    }
  } catch (error) {
    console.error('[Debug] Error:', error.message || error);
    process.exit(1);
  }
}

testOcr();
