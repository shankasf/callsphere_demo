// API Types for CallSphere Demo Dashboard

// =====================================================
// INDUSTRIES (multi-industry demo)
// =====================================================

export interface Industry {
  id: number | string;
  slug: string;
  name: string;
  tagline: string;
  greeting: string;
  accentColor: string;
  icon: string;
  sortOrder: number;
}

// =====================================================
// BUSINESS / LEAD INTELLIGENCE METRICS
// =====================================================

export interface BusinessIndustryRow {
  slug: string;
  name: string;
  calls: number;
  leads: number;
  avgLeadScore: number;
  pipelineValue: number;
  interestProfit: number;
  closeProfit: number;
}

export interface IntentBreakdownRow {
  intent: string;
  count: number;
}

export interface BusinessMetrics {
  calls_total: number;
  leads_total: number;
  avg_lead_score: number;
  lead_status_breakdown: { hot: number; warm: number; cold: number };
  pipeline_value: number;
  interest_profit: number;
  projected_close_profit: number;
  by_industry: BusinessIndustryRow[];
  intent_breakdown: IntentBreakdownRow[];
  funnel: { calls: number; engaged: number; leads: number; hot: number };
  ai_resolution_rate: number;
  escalation_rate: number;
  avg_duration_seconds: number;
  completed: number;
  failed: number;
  in_progress: number;
}

// =====================================================
// OVERVIEW & DASHBOARD
// =====================================================

export interface OverviewMetrics {
  total_calls: number;
  completed_calls: number;
  avg_call_duration_seconds: number;
  ai_resolution_rate_percent: number;
  active_sessions: number;
  total_tokens_today: number;
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  total_organizations: number;
  total_contacts: number;
  total_locations: number;
}

export interface DevicesByOrg {
  organization: string;
  device_count: number;
  online: number;
  offline: number;
}

export interface DevicesByOS {
  os_name: string;
  count: number;
}

// =====================================================
// CALLS
// =====================================================

export interface CallLog {
  id: number;
  call_id?: string;
  session_id?: string;
  call_sid?: string;
  caller_phone?: string;
  caller_name?: string;
  company_name?: string;
  organization_id?: number;
  started_at?: string;
  created_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  status: string;
  direction?: string;
  ai_resolution?: boolean;
  was_resolved?: boolean;
  escalated?: boolean;
  agent_type?: string;
  last_agent?: string;
  issue_category?: string;
  sentiment?: string;
  transcript?: string;
  call_summary?: string;
}

export interface HourlyCall {
  hour: number;
  count: number;
}

export interface ByAgent {
  agent_type: string;
  count: number;
}

export interface DailyCost {
  date: string;
  cost: number;
}

export interface CallMetrics {
  total_calls: number;
  completed_calls?: number;
  completed?: number;
  in_progress?: number;
  failed?: number;
  active_calls?: number;
  avg_duration_seconds: number;
  ai_resolution_rate: number;
  escalation_rate?: number;
  hourly_calls?: HourlyCall[];
  calls_by_hour?: HourlyCall[];
  by_agent?: ByAgent[];
  calls_by_agent?: ByAgent[];
  daily_costs?: DailyCost[];
}

// =====================================================
// TICKETS
// =====================================================

export interface Ticket {
  id: number;
  ticket_id?: number;
  subject?: string;
  issue_summary?: string;
  description?: string;
  status: string;
  priority: string;
  organization?: string;
  contact_name?: string;
  device_name?: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  requires_human_agent?: boolean;
}

export interface TicketsByPriority {
  priority: string;
  count: number;
}

export interface TicketMetrics {
  total_tickets: number;
  open_tickets: number;
  pending_tickets?: number;
  resolved_tickets?: number;
  critical_tickets?: number;
  escalated_tickets?: number;
  tickets_created_today?: number;
  avg_resolution_time_hours?: number;
  sla_compliance_percent?: number;
  tickets_by_priority?: TicketsByPriority[];
  open_by_priority?: TicketsByPriority[];
}

// =====================================================
// DEVICES
// =====================================================

export interface Device {
  id: number;
  device_id?: number;
  device_name?: string;
  asset_name?: string;
  host_name?: string;
  device_type?: string;
  is_online: boolean;
  status?: 'ONLINE' | 'OFFLINE';
  organization?: { org_name: string };
  location?: string;
  os_type?: string;
  os_name?: string;
  os_version?: string;
  manufacturer?: string;
  model?: string;
  public_ip?: string;
  last_reported_time?: string;
  last_seen?: string;
  total_memory?: number;
}

export interface DeviceMetrics {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  devices_by_org: DevicesByOrg[];
  devices_by_os: DevicesByOS[];
}

// =====================================================
// ORGANIZATIONS
// =====================================================

export interface Organization {
  id: number;
  organization_id?: number;
  org_name: string;
  name?: string;
  industry?: string;
  status?: string;
  address?: string;
  u_e_code?: number;
  manager_name?: string;
  device_count?: number;
  contact_count?: number;
  location_count?: number;
  call_count?: number;
  created_at?: string;
}

export interface OrganizationMetrics {
  total_organizations: number;
  active_organizations: number;
  total_devices: number;
  total_contacts: number;
}

// =====================================================
// CONTACTS
// =====================================================

export interface Contact {
  id: number;
  contact_id?: number;
  full_name?: string;
  email?: string;
  phone?: string;
  organization?: { org_name: string };
  call_count?: number;
  last_contact?: string;
  updated_at?: string;
}

export interface ContactMetrics {
  total_contacts: number;
  contacts_with_email: number;
  total_calls: number;
  unique_organizations: number;
}

// =====================================================
// SYSTEM HEALTH
// =====================================================

export interface SystemAlert {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp?: string;
}

export interface SystemMetrics {
  status: string;
  uptime: string;
  active_sessions: number;
  requests_per_minute: number;
  error_rate_percent: number;
  db_connections: number;
  cpu_usage_percent: number;
  memory_usage_percent: number;
  disk_usage_percent: number;
  avg_response_time_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  api_status: string;
  db_status: string;
  ai_status: string;
  cache_status: string;
  version: string;
  environment: string;
  node_version: string;
  last_deploy: string;
  alerts: SystemAlert[];
}

export interface SystemHealth {
  cpu_usage_percent: number;
  memory_usage_percent: number;
  disk_usage_percent: number;
  api_latency_ms: number;
  uptime_percent: number;
  active_connections: number;
  error_rate_percent: number;
}

// =====================================================
// COSTS
// =====================================================

export interface CostByModel {
  model: string;
  tokens: number;
  cost: number;
}

export interface CostMetrics {
  cost_today: number;
  cost_week: number;
  cost_month: number;
  cost_total: number;
  tokens_today: number;
  tokens_week: number;
  tokens_month: number;
  tokens_total: number;
  calls_today: number;
  calls_week: number;
  calls_month: number;
  calls_total: number;
  avg_cost_per_call: number;
  roi_percent: number;
  input_tokens: number;
  output_tokens: number;
  input_cost: number;
  output_cost: number;
  savings: number;
  cost_reduction: number;
  human_agent_cost: number;
  ai_cost: number;
  daily_costs: DailyCost[];
  cost_by_model: CostByModel[];
  // Legacy fields
  total_cost_today?: number;
  total_cost_month?: number;
  total_tokens?: number;
  twilio_cost?: number;
  openai_cost?: number;
  cost_by_day?: DailyCost[];
}

// =====================================================
// AI / AGENT STATS
// =====================================================

export interface AgentStats {
  agent_type: string;
  usage_count: number;
  percentage: number;
  avg_duration_ms: number;
  tool_calls: number;
  handoffs: number;
}

// =====================================================
// AUTH
// =====================================================

export interface User {
  id: number;
  email: string;
  fullName: string;
  role: 'admin' | 'agent' | 'requester';
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// =====================================================
// LIVE CALLS
// =====================================================

export interface LiveCallEvent {
  callSid: string;
  sessionId: string;
  status: 'ringing' | 'in-progress' | 'completed' | 'failed';
  from: string;
  to?: string;
  direction: 'inbound' | 'outbound';
  startedAt: string;
  callerName?: string;
  companyName?: string;
  agentType?: string;
  duration?: number;
  transcript?: TranscriptEntry[];
  agentHistory?: AgentEvent[];
  toolCalls?: LiveToolCall[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  aiResolution?: boolean;
}

export interface TranscriptEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface AgentEvent {
  agentName: string;
  action: string;
  timestamp: string;
  details?: string;
}

export interface LiveToolCall {
  name: string;
  success: boolean;
  timestamp: string;
  result?: string;
}

export interface LiveCallMetrics {
  activeCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  avgDuration: number;
  activeAgents: string[];
}

// =====================================================
// QUEUE & TRAFFIC METRICS
// =====================================================

export interface QueueMetrics {
  callsInQueue: number;
  longestWaitTime: number;
  avgWaitTime: number;
  callsStartedPerMinute: number;
  callsEndedPerMinute: number;
  serviceLevel: number; // % answered within X seconds
  asa: number; // Average Speed of Answer
  abandonRate: number;
  shortAbandonRate: number;
  callbackOfferedRate: number;
  callbackAcceptedRate: number;
  blockedRate: number;
  failureRate: number;
}

// =====================================================
// HANDOFF & STAFFING METRICS
// =====================================================

export interface HandoffMetrics {
  agentsOnline: number;
  agentsAvailable: number;
  agentsBusy: number;
  agentsAway: number;
  aiToHumanHandoffRate: number;
  handoffLatency: number;
  ringTime: number;
  connectTime: number;
  transferRate: number;
  warmTransferSuccessRate: number;
  postHandoffResolutionRate: number;
  handoffReasons: HandoffReason[];
}

export interface HandoffReason {
  reason: string;
  count: number;
  percentage: number;
}

// =====================================================
// CALL QUALITY METRICS
// =====================================================

export interface CallQualityMetrics {
  packetLossInbound: number;
  packetLossOutbound: number;
  jitter: number;
  rtt: number;
  latency: number;
  mos: number; // Mean Opinion Score
  audioLevelHealth: number;
  oneWayAudioRate: number;
  deadAirTime: number;
  silenceTime: number;
  callsBelowQualityThreshold: number;
  qualityAlerts: QualityAlert[];
}

export interface QualityAlert {
  type: 'packet_loss' | 'jitter' | 'latency' | 'audio' | 'mos';
  severity: 'warning' | 'critical';
  message: string;
  timestamp: string;
}

// =====================================================
// LATENCY & RESPONSIVENESS METRICS
// =====================================================

export interface LatencyMetrics {
  endToEndTurnLatency: number;
  asrLatency: number;
  llmLatencyFirstToken: number;
  llmLatencyFullResponse: number;
  ttsLatency: number;
  bargeInLatency: number;
  vadDelay: number;
  endpointingDelay: number;
  interruptionRate: number;
  streamReconnects: number;
  streamDrops: number;
}

// =====================================================
// ASR METRICS
// =====================================================

export interface ASRMetrics {
  transcriptConfidenceAvg: number;
  transcriptConfidenceDistribution: ConfidenceDistribution[];
  wordErrorRateProxy: number;
  noSpeechDetectedRate: number;
  partialTranscriptChurnRate: number;
  diarizationErrorRate: number;
  languageDetectionAccuracy: number;
  noiseScore: number;
  outOfVocabularyRate: number;
  profanityMaskingRate: number;
}

export interface ConfidenceDistribution {
  range: string;
  percentage: number;
}

// =====================================================
// NLU / ROUTING METRICS
// =====================================================

export interface NLUMetrics {
  intentMatchRate: number;
  fallbackRate: number;
  noMatchRate: number;
  entityExtractionSuccessRate: number;
  slotFillCompletionRate: number;
  misrouteRate: number;
  repromptRate: number;
  topConfusionPairs: ConfusionPair[];
}

export interface ConfusionPair {
  intentA: string;
  intentB: string;
  confusionRate: number;
}

// =====================================================
// CONVERSATION FLOW METRICS
// =====================================================

export interface ConversationFlowMetrics {
  taskCompletionRate: number;
  taskCompletionByJourney: JourneyMetric[];
  dropOffByStep: FunnelStep[];
  turnsPerCall: number;
  avgTimeToResolution: number;
  repeatedQuestionRate: number;
  recoveryRateAfterFallback: number;
  repairSuccessRate: number;
  toolFailureRate: number;
  webhookFailureRate: number;
  timeoutRate: number;
  retryRate: number;
}

export interface JourneyMetric {
  journey: string;
  completionRate: number;
  avgDuration: number;
}

export interface FunnelStep {
  step: string;
  dropOffRate: number;
  avgTimeSpent: number;
}

// =====================================================
// CUSTOMER EXPERIENCE METRICS
// =====================================================

export interface CustomerExperienceMetrics {
  csat: number;
  ces: number; // Customer Effort Score
  nps: number;
  sentimentScoreAvg: number;
  sentimentScoreMin: number;
  negativeSentimentSpikeRate: number;
  complaintKeywordRate: number;
  agentHelpfulThumbsUp: number;
  agentHelpfulThumbsDown: number;
  escalationRequestedRate: number;
}

// =====================================================
// SUPPORT EFFECTIVENESS METRICS
// =====================================================

export interface SupportEffectivenessMetrics {
  aht: number; // Average Handle Time
  talkTime: number;
  holdTime: number;
  acwTime: number; // After-call work
  fcr: number; // First Call Resolution
  repeatCallRate: number;
  transferRate: number;
  reopenRate: number;
  callbackResolutionRate: number;
}

// =====================================================
// BUSINESS OUTCOMES METRICS
// =====================================================

export interface BusinessOutcomesMetrics {
  conversionRate: number;
  abandonRateAtKeySteps: KeyStepAbandon[];
  revenuePerCall: number;
  revenuePerSession: number;
  costPerResolvedCase: number;
  deflectionRate: number; // AI resolved without human
  containmentRate: number; // Fully automated
  assistedRate: number; // Human involved
  failureRate: number;
  slaComplianceByIssueType: SLACompliance[];
  backlogCreated: number;
  backlogResolved: number;
}

export interface KeyStepAbandon {
  step: string;
  abandonRate: number;
}

export interface SLACompliance {
  issueType: string;
  complianceRate: number;
}

// =====================================================
// PLATFORM RELIABILITY METRICS
// =====================================================

export interface PlatformReliabilityMetrics {
  uptime: number;
  errorRate4xx: number;
  errorRate5xx: number;
  timeoutRate: number;
  retryRate: number;
  circuitBreakerTrips: number;
  dependencyLatency: DependencyLatency[];
  queueDepth: number;
  tokenUsage: number;
  ttsCharacters: number;
  ttsSeconds: number;
  asrMinutes: number;
  costPerCall: number;
  costPerResolution: number;
  rateLimitHits: number;
  modelFallbackUsage: number;
  regionFailoverEvents: number;
}

export interface DependencyLatency {
  service: string;
  latency: number;
  status: 'healthy' | 'degraded' | 'down';
}

// =====================================================
// COMPLIANCE & SECURITY METRICS
// =====================================================

export interface ComplianceMetrics {
  policyTriggerRate: number;
  redactionSuccessRate: number;
  consentCapturedRate: number;
  verificationPassRate: number;
  verificationFailRate: number;
  fraudFlagsRate: number;
  auditCoverage: number;
  retentionCompliance: number;
  deletionCompliance: number;
}

export interface SecurityMetrics {
  adminLogins: number;
  permissionChanges: number;
  apiKeyUsageAnomalies: number;
  suspiciousIpCount: number;
  geoAnomalies: number;
  dataExportEvents: number;
}

// =====================================================
// API RESPONSES
// =====================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  skip: number;
  take: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}
