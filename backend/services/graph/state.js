/**
 * Shared state definition for the LangGraph workflow
 * All agents read and mutate this deterministically
 */

export const StateAnnotation = {
  // Input provider data (immutable after workflow start)
  providerId: String,
  inputData: {
    name: String,
    npi: String,
    address: String,
    phone: String,
    website: String,
    specialty: String,
    state: String,
  },

  // Data Validation Agent outputs
  validatedFields: Array,
  validationDiscrepancies: Array,
  validationSources: Array,
  npiLookupResult: Object,
  licensingBoardResult: Object,
  websiteScrapingResult: Object,
  phoneVerificationResult: Object,

  // Information Enrichment Agent outputs
  enrichedProviderProfile: {
    services: Array,
    telemedicineAvailable: Boolean,
    languagesSpoken: Array,
    additionalSpecialties: Array,
  },
  geoCoordinates: {
    latitude: Number,
    longitude: Number,
    confidence: Number,
  },
  poiMetadata: {
    businessName: String,
    formattedAddress: String,
    phone: String,
    website: String,
    ratingScore: Number,
    reviewCount: Number,
  },
  educationDetails: {
    medicalSchool: String,
    residency: String,
    boardCertifications: Array,
  },
  geoSpecialtyAnalysis: {
    coverageAreas: Array,
    practiceType: String,
  },

  // Quality Assurance Agent outputs
  fieldConfidenceScores: Object,
  overallConfidenceScore: Number,
  needsHumanReview: Boolean,
  reviewSeverity: String, // 'LOW' | 'MEDIUM' | 'HIGH'
  priorityScore: Number,
  anomalyDetection: {
    isDetected: Boolean,
    anomalies: Array,
    fraudRisk: String, // 'LOW' | 'MEDIUM' | 'HIGH'
  },
  crossSourceComparison: Object,

  // Directory Management Agent outputs
  directoryStatus: String, // 'PUBLISHED' | 'NEEDS_REVIEW' | 'REJECTED'
  alerts: Array,
  reviewerTasks: Array,
  validationReports: Array,
  webDirectoryEntry: Object,
  mobileAppFeed: Object,
  complianceReportUri: String,

  // Workflow metadata
  workflowId: String,
  startTime: Date,
  endTime: Date,
  workflowStatus: String, // 'STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  errorLog: Array,
};

/**
 * Initialize state with input data and defaults
 */
export function initializeState(providerId, inputData) {
  return {
    // Input
    providerId,
    inputData: {
      name: inputData.name || null,
      npi: inputData.npi || null,
      address: inputData.address || null,
      phone: inputData.phone || null,
      website: inputData.website || null,
      specialty: inputData.specialty || null,
      state: inputData.state || null,
    },

    // Data Validation
    validatedFields: [],
    validationDiscrepancies: [],
    validationSources: [],
    npiLookupResult: null,
    licensingBoardResult: null,
    websiteScrapingResult: null,
    phoneVerificationResult: null,

    // Information Enrichment
    enrichedProviderProfile: {
      services: [],
      telemedicineAvailable: null,
      languagesSpoken: [],
      additionalSpecialties: [],
    },
    geoCoordinates: {
      latitude: null,
      longitude: null,
      confidence: null,
    },
    poiMetadata: {
      businessName: null,
      formattedAddress: null,
      phone: null,
      website: null,
      ratingScore: null,
      reviewCount: null,
    },
    educationDetails: {
      medicalSchool: null,
      residency: null,
      boardCertifications: [],
    },
    geoSpecialtyAnalysis: {
      coverageAreas: [],
      practiceType: null,
    },

    // Quality Assurance
    fieldConfidenceScores: {},
    overallConfidenceScore: null,
    needsHumanReview: null,
    reviewSeverity: null,
    priorityScore: null,
    anomalyDetection: {
      isDetected: false,
      anomalies: [],
      fraudRisk: 'LOW',
    },
    crossSourceComparison: {},

    // Directory Management
    directoryStatus: null,
    alerts: [],
    reviewerTasks: [],
    validationReports: [],
    webDirectoryEntry: null,
    mobileAppFeed: null,
    complianceReportUri: null,

    // Metadata
    workflowId: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    startTime: new Date(),
    endTime: null,
    workflowStatus: 'STARTED',
    errorLog: [],
  };
}
