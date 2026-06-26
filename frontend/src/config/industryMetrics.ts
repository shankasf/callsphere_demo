// ============================================================================
// Per-industry "primary outcome" metric configuration.
//
// The demo agent scores every call/chat and stores a short free-text `intent`
// label on call_logs (e.g. "book_appointment", "request_quote"). For each
// industry we define the domain-relevant headline outcome and the set of
// intent substrings that count toward it. Matching is case-insensitive
// substring matching (see OverviewPage), so keep these short and lowercase.
//
// `getIndustryMetric(slug)` always returns a config — unknown/empty slugs fall
// back to a generic "Conversions" definition so the tile never goes blank.
// ============================================================================

export interface IndustryMetricConfig {
  /** Headline label for the domain KPI tile (e.g. "Appointments Booked"). */
  primaryLabel: string;
  /** Lowercase intent substrings that count toward this outcome. */
  matchIntents: string[];
}

export const DEFAULT_INDUSTRY_METRIC: IndustryMetricConfig = {
  primaryLabel: 'Conversions',
  matchIntents: ['book', 'schedule', 'appointment', 'demo', 'quote', 'reservation'],
};

export const INDUSTRY_METRICS: Record<string, IndustryMetricConfig> = {
  healthcare: {
    primaryLabel: 'Appointments Booked',
    matchIntents: ['appointment', 'book', 'schedule'],
  },
  real_estate: {
    primaryLabel: 'Showings Booked',
    matchIntents: ['showing', 'viewing', 'tour'],
  },
  hospitality: {
    primaryLabel: 'Reservations',
    matchIntents: ['reservation', 'booking', 'table', 'room'],
  },
  finance: {
    primaryLabel: 'Consults Booked',
    matchIntents: ['consult', 'advisor', 'appointment', 'application'],
  },
  home_services: {
    primaryLabel: 'Jobs Scheduled',
    matchIntents: ['quote', 'schedule', 'service', 'dispatch', 'booking'],
  },
  automotive: {
    primaryLabel: 'Appointments',
    matchIntents: ['service', 'test drive', 'appointment', 'booking'],
  },
  legal: {
    primaryLabel: 'Consultations',
    matchIntents: ['consult', 'intake', 'appointment'],
  },
  saas: {
    primaryLabel: 'Demos Booked',
    matchIntents: ['demo', 'trial', 'onboarding'],
  },
  dental: {
    primaryLabel: 'Appointments Booked',
    matchIntents: ['appointment', 'book', 'cleaning', 'schedule'],
  },
  insurance: {
    primaryLabel: 'Quotes & Claims',
    matchIntents: ['quote', 'claim', 'policy', 'application'],
  },
  logistics: {
    primaryLabel: 'Shipments Booked',
    matchIntents: ['quote', 'shipment', 'pickup', 'tracking', 'dispatch'],
  },
  behavioral_health: {
    primaryLabel: 'Sessions Booked',
    matchIntents: ['appointment', 'intake', 'session', 'consult'],
  },
  salon_spa: {
    primaryLabel: 'Bookings',
    matchIntents: ['booking', 'appointment', 'reservation', 'membership'],
  },
};

/**
 * Resolve the domain metric config for an industry slug. Falls back to the
 * generic "Conversions" definition for unknown/empty/'all' slugs.
 */
export function getIndustryMetric(slug?: string | null): IndustryMetricConfig {
  if (!slug || slug === 'all') return DEFAULT_INDUSTRY_METRIC;
  return INDUSTRY_METRICS[slug] ?? DEFAULT_INDUSTRY_METRIC;
}
