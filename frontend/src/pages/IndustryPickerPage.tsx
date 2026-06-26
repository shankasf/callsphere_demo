import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Phone, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { industriesApi } from '../services/api';
import { useIndustry } from '../context/IndustryContext';
import { IndustryIcon, EmptyState } from '../components/common';
import type { Industry } from '../types';

// Landing page: pick an industry to drive the rest of the demo experience.
// Selecting a card persists the choice (context + localStorage) and routes
// into the dashboard with ?industry=<slug> reflected in the URL.
//
// Note: we intentionally do NOT gate entry behind an email form — the chat and
// voice agents themselves ask the visitor for their name + email in
// conversation and send the booking confirmation from there.
export function IndustryPickerPage() {
    const navigate = useNavigate();
    const { selectIndustry, slug: activeSlug } = useIndustry();

    const { data, isLoading, isError, refetch, isFetching } = useQuery({
        queryKey: ['industries'],
        queryFn: () => industriesApi.getAll(),
    });

    const industries: Industry[] = (data ?? [])
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const handleSelect = (industry: Industry) => {
        selectIndustry(industry);
        navigate(`/overview?industry=${encodeURIComponent(industry.slug)}`);
    };

    return (
        <div className="min-h-screen flex flex-col items-center px-4 py-12 sm:py-16">
            {/* Brand header */}
            <header className="text-center max-w-2xl mx-auto mb-10 sm:mb-14 fade-in">
                <div className="flex items-center justify-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center shadow-lg shadow-primary-500/20">
                        <Phone className="w-6 h-6 text-white" />
                    </div>
                    <span className="font-bold text-2xl bg-gradient-to-r from-primary-400 to-teal-300 bg-clip-text text-transparent">
                        CallSphere Demo
                    </span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                    Pick an industry to begin
                </h1>
                <p className="text-dark-400 mt-3 text-base sm:text-lg">
                    See how a CallSphere AI voice &amp; chat agent handles real calls, captures
                    leads, and books appointments — tailored to your business.
                </p>
            </header>

            {/* Content states */}
            <div className="w-full max-w-5xl">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-dark-400 gap-3">
                        <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
                        <p>Loading industries…</p>
                    </div>
                ) : isError ? (
                    <div className="glass rounded-2xl p-8 max-w-md mx-auto text-center">
                        <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                        <p className="text-dark-200 font-medium">Couldn’t load industries</p>
                        <p className="text-dark-400 text-sm mt-1">
                            The demo backend may still be starting up.
                        </p>
                        <button
                            onClick={() => refetch()}
                            className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-sm font-medium text-white transition-colors"
                        >
                            {isFetching ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : null}
                            Try again
                        </button>
                    </div>
                ) : industries.length === 0 ? (
                    <EmptyState message="No industries are configured yet." />
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 fade-in">
                        {industries.map((industry) => {
                            const accent = industry.accentColor || '#14b8a6';
                            const isActive = activeSlug === industry.slug;
                            return (
                                <button
                                    key={industry.slug}
                                    onClick={() => handleSelect(industry)}
                                    aria-label={`Start the ${industry.name} demo`}
                                    className="group relative text-left glass rounded-2xl p-5 sm:p-6 transition-all duration-150 hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-dark-950 min-h-[44px]"
                                    style={{
                                        borderColor: isActive ? accent : undefined,
                                    }}
                                >
                                    {/* Accent top bar */}
                                    <span
                                        className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
                                        style={{ backgroundColor: accent }}
                                        aria-hidden="true"
                                    />
                                    <div className="flex items-start gap-4">
                                        <div
                                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
                                            style={{
                                                backgroundColor: `${accent}22`,
                                                color: accent,
                                            }}
                                        >
                                            <IndustryIcon
                                                icon={industry.icon}
                                                slug={industry.slug}
                                                className="w-6 h-6"
                                            />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h2 className="text-lg font-semibold text-white truncate">
                                                {industry.name}
                                            </h2>
                                            <p className="text-sm text-dark-400 mt-1 line-clamp-2">
                                                {industry.tagline}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-5 flex items-center gap-1.5 text-sm font-medium text-dark-300 group-hover:text-white transition-colors">
                                        Start demo
                                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <footer className="mt-16 text-xs text-dark-500">
                Powered by CallSphere — AI voice &amp; chat agents for every industry.
            </footer>
        </div>
    );
}

export default IndustryPickerPage;
