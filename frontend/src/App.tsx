import { useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useSearchParams,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { AuthProvider, IndustryProvider, useIndustry } from './context';
import { VoiceWidget } from './components/voice';
import { ChatWidget } from './components/chat';
import { industriesApi } from './services/api';
import {
  IndustryPickerPage,
  OverviewPage,
  BusinessMetricsPage,
  ChatbotMetricsPage,
  CallsPage,
  LiveCallsPage,
  QualityMetricsPage,
  AnalyticsPage,
  CompliancePage,
  TicketsPage,
  DevicesPage,
  OrganizationsPage,
  ContactsPage,
  SystemPage,
  CostsPage,
} from './pages';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      refetchOnWindowFocus: true,
      retry: 2,
    },
  },
});

// Keeps the selected-industry context in sync with the ?industry= query param.
// If the URL carries a known slug we adopt it (e.g. deep links / shared demos).
function IndustryUrlSync() {
  const [searchParams] = useSearchParams();
  const { slug, selectIndustry } = useIndustry();
  const urlSlug = searchParams.get('industry');

  const { data: industries } = useQuery({
    queryKey: ['industries'],
    queryFn: () => industriesApi.getAll(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!urlSlug || urlSlug === 'all' || urlSlug === slug) return;
    const match = industries?.find((i) => i.slug === urlSlug);
    if (match) selectIndustry(match);
  }, [urlSlug, slug, industries, selectIndustry]);

  return null;
}

// Gate the dashboard behind an industry selection. Without one, send the user
// to the picker so the rest of the demo has an industry context to work with.
function RequireIndustry({ children }: { children: React.ReactNode }) {
  const { industry } = useIndustry();
  const location = useLocation();
  const urlSlug = new URLSearchParams(location.search).get('industry');

  // Allow rendering if either context or the URL already carries an industry —
  // IndustryUrlSync will promote the URL slug into context shortly after.
  if (!industry && !urlSlug) {
    return <Navigate to="/start" replace />;
  }
  return <>{children}</>;
}

// App Content - fully public, no authentication required
function AppContent() {
  const { industry } = useIndustry();
  const location = useLocation();

  // Hide the floating voice + chat widgets on the industry picker landing page.
  const onStartPage = location.pathname === '/start';

  return (
    <>
      <IndustryUrlSync />
      <Routes>
        {/* Industry picker landing */}
        <Route path="/start" element={<IndustryPickerPage />} />

        {/* Default → picker if no industry, else overview */}
        <Route
          path="/"
          element={<Navigate to={industry ? '/overview' : '/start'} replace />}
        />

        {/* Public Dashboard Routes (no auth) — require an industry selection */}
        <Route path="/overview" element={<RequireIndustry><OverviewPage /></RequireIndustry>} />
        <Route path="/business" element={<RequireIndustry><BusinessMetricsPage /></RequireIndustry>} />
        <Route path="/chatbot" element={<RequireIndustry><ChatbotMetricsPage /></RequireIndustry>} />
        <Route path="/calls" element={<RequireIndustry><CallsPage /></RequireIndustry>} />
        {/* Dedicated live-call monitor with real-time transcription. */}
        <Route path="/live" element={<RequireIndustry><LiveCallsPage /></RequireIndustry>} />
        <Route path="/quality" element={<RequireIndustry><QualityMetricsPage /></RequireIndustry>} />
        <Route path="/analytics" element={<RequireIndustry><AnalyticsPage /></RequireIndustry>} />
        <Route path="/compliance" element={<RequireIndustry><CompliancePage /></RequireIndustry>} />
        <Route path="/tickets" element={<RequireIndustry><TicketsPage /></RequireIndustry>} />
        <Route path="/devices" element={<RequireIndustry><DevicesPage /></RequireIndustry>} />
        <Route path="/organizations" element={<RequireIndustry><OrganizationsPage /></RequireIndustry>} />
        <Route path="/contacts" element={<RequireIndustry><ContactsPage /></RequireIndustry>} />
        <Route path="/system" element={<RequireIndustry><SystemPage /></RequireIndustry>} />
        <Route path="/costs" element={<RequireIndustry><CostsPage /></RequireIndustry>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Global Voice + Text Chat widgets (hidden on the /start picker page) */}
      {!onStartPage && <VoiceWidget />}
      {!onStartPage && <ChatWidget />}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <IndustryProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </IndustryProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
