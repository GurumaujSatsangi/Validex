import axios from 'axios';

const AZURE_VISION_ENDPOINT = process.env.AZURE_VISION_ENDPOINT;
const AZURE_VISION_KEY = process.env.AZURE_VISION_KEY;
const API_VERSION = 'v3.2';

/**
 * Send PDF to Azure Vision Read API for OCR processing
 * @param {Buffer} pdfBuffer - PDF file as buffer
 * @returns {Promise<String>} Operation URL for polling
 */
export async function sendToAzureOCR(pdfBuffer) {
  if (!AZURE_VISION_ENDPOINT || !AZURE_VISION_KEY) {
    throw new Error('Azure Vision API credentials not configured. Set AZURE_VISION_ENDPOINT and AZURE_VISION_KEY in .env');
  }

  try {
    // Remove trailing slash from endpoint if present
    const endpoint = AZURE_VISION_ENDPOINT.replace(/\/$/, '');
    const url = `${endpoint}/vision/${API_VERSION}/read/analyze`;

    console.info('[Azure OCR] Sending PDF to Azure Vision API...');
    console.info('[Azure OCR] Endpoint:', AZURE_VISION_ENDPOINT);
    console.info('[Azure OCR] API Version:', API_VERSION);
    console.info('[Azure OCR] URL:', url);
    console.info('[Azure OCR] PDF Buffer size:', pdfBuffer.length, 'bytes');

    const response = await axios.post(url, pdfBuffer, {
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_VISION_KEY,
        'Content-Type': 'application/pdf'
      },
      timeout: 30000
    });

    console.info('[Azure OCR] Response status:', response.status);
    console.info('[Azure OCR] Response headers:', Object.keys(response.headers));

    // Azure returns the operation URL in the 'operation-location' header
    const operationUrl = response.headers['operation-location'];

    if (!operationUrl) {
      console.error('[Azure OCR] Response headers:', response.headers);
      throw new Error('No operation-location header in response from Azure Vision API');
    }

    console.info('[Azure OCR] Operation started, polling URL:', operationUrl);
    return operationUrl;
  } catch (error) {
    console.error('[Azure OCR] Error sending PDF to Azure:', error.message || error);
    
    if (error.response) {
      console.error('[Azure OCR] Response status:', error.response.status);
      console.error('[Azure OCR] Response data:', JSON.stringify(error.response.data).substring(0, 300));
    }
    
    if (error.response?.status === 401) {
      throw new Error('Azure Vision API authentication failed. Check AZURE_VISION_KEY');
    }
    
    if (error.response?.status === 404) {
      throw new Error('Azure Vision endpoint not found. Check AZURE_VISION_ENDPOINT');
    }

    throw new Error(`Azure Vision API error: ${error.message || error}`);
  }
}

/**
 * Poll Azure Vision OCR operation until completion
 * @param {String} operationUrl - The operation URL returned by sendToAzureOCR
 * @param {Number} maxPolls - Maximum number of polls (default 300 = 5 minutes with 1s interval)
 * @returns {Promise<Object>} Final OCR result with readResults
 */
export async function pollOcr(operationUrl, maxPolls = 300) {
  let pollCount = 0;
  const pollInterval = 1000; // 1 second

  console.info('[Azure OCR] Starting poll for OCR completion...');

  while (pollCount < maxPolls) {
    try {
      const response = await axios.get(operationUrl, {
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_VISION_KEY
        },
        timeout: 10000
      });

      const status = response.data.status;

      if (status === 'succeeded') {
        console.info('[Azure OCR] OCR processing completed successfully');
        console.info('[Azure OCR] Response data keys:', Object.keys(response.data));
        
        // Log the analyzeResult if it exists
        if (response.data.analyzeResult) {
          console.info('[Azure OCR] analyzeResult keys:', Object.keys(response.data.analyzeResult));
          if (response.data.analyzeResult.readResults) {
            console.info('[Azure OCR] readResults count:', response.data.analyzeResult.readResults.length);
            if (response.data.analyzeResult.readResults.length > 0) {
              const firstPage = response.data.analyzeResult.readResults[0];
              console.info('[Azure OCR] First page keys:', Object.keys(firstPage));
              console.info('[Azure OCR] First page lines count:', firstPage.lines ? firstPage.lines.length : 0);
              if (firstPage.lines && firstPage.lines.length > 0) {
                console.info('[Azure OCR] First line keys:', Object.keys(firstPage.lines[0]));
                console.info('[Azure OCR] First line text:', firstPage.lines[0].text);
              }
            }
          }
        }
        
        return response.data;
      }

      if (status === 'failed') {
        console.error('[Azure OCR] OCR processing failed');
        throw new Error('Azure Vision OCR processing failed');
      }

      // Status is 'notStarted' or 'running', continue polling
      console.info('[Azure OCR] Status:', status, '- Polling again in 1 second... (Attempt', pollCount + 1, '/', maxPolls, ')');

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      pollCount++;
    } catch (error) {
      if (error.message.includes('Azure Vision OCR processing failed')) {
        throw error;
      }

      console.error('[Azure OCR] Error polling OCR status:', error.message || error);
      
      // Retry on network errors
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        pollCount++;
        continue;
      }

      throw new Error(`Azure Vision OCR poll error: ${error.message || error}`);
    }
  }

  throw new Error('Azure Vision OCR processing timed out after 5 minutes');
}
