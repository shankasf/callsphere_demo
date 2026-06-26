import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '../components/layout';
import { MetricCard, Card, LoadingSpinner, EmptyState } from '../components/common';
import { dashboardApi } from '../services/api';
import { UserPlus, Phone, Building2, Search, Mail, User } from 'lucide-react';

export function ContactsPage() {
    const [searchQuery, setSearchQuery] = useState('');

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['dashboard-contacts'],
        queryFn: () => dashboardApi.getContacts(),
    });

    const contacts = data?.contacts || [];
    const metrics = data?.metrics;

    const filteredContacts = contacts.filter((contact) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            (contact.full_name || '').toLowerCase().includes(query) ||
            (contact.email || '').toLowerCase().includes(query) ||
            (contact.phone || '').toLowerCase().includes(query) ||
            (contact.organization?.org_name || '').toLowerCase().includes(query)
        );
    });

    if (isLoading) {
        return (
            <DashboardLayout title="Contacts" subtitle="Manage and lookup caller contacts">
                <LoadingSpinner size="lg" />
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout
            title="Contacts"
            subtitle="Manage and lookup caller contacts"
            onRefresh={() => refetch()}
        >
            <div className="fade-in space-y-6">
                {/* Top Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard
                        label="Total Contacts"
                        value={metrics?.total_contacts || contacts.length}
                        icon="user-plus"
                        color="primary"
                    />
                    <MetricCard
                        label="With Email"
                        value={metrics?.contacts_with_email || 0}
                        icon="mail"
                        color="blue"
                    />
                    <MetricCard
                        label="Total Calls"
                        value={metrics?.total_calls || 0}
                        icon="phone"
                        color="green"
                    />
                    <MetricCard
                        label="Organizations"
                        value={metrics?.unique_organizations || 0}
                        icon="users"
                        color="purple"
                    />
                </div>

                {/* Search */}
                <Card>
                    <div className="flex items-center gap-3">
                        <Search className="w-5 h-5 text-dark-400" />
                        <input
                            type="text"
                            placeholder="Search contacts by name, email, phone, or organization..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 bg-transparent border-none outline-none text-white placeholder-dark-400"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="text-dark-400 hover:text-white"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </Card>

                {/* Contacts Table */}
                <Card title={`Contacts (${filteredContacts.length})`}>
                    {filteredContacts.length === 0 ? (
                        <EmptyState
                            message={searchQuery ? 'No contacts match your search' : 'No contacts found'}
                            icon={<UserPlus className="w-12 h-12 text-dark-400" />}
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-dark-400 border-b border-dark-800">
                                        <th className="pb-3">Name</th>
                                        <th className="pb-3">Email</th>
                                        <th className="pb-3">Phone</th>
                                        <th className="pb-3">Organization</th>
                                        <th className="pb-3">Calls</th>
                                        <th className="pb-3">Last Contact</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredContacts.slice(0, 50).map((contact) => (
                                        <tr
                                            key={contact.id}
                                            className="border-b border-dark-800 hover:bg-dark-800/50"
                                        >
                                            <td className="py-3 pr-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-primary-600/20 flex items-center justify-center">
                                                        <User className="w-4 h-4 text-primary-400" />
                                                    </div>
                                                    <span className="font-medium">
                                                        {contact.full_name || 'Unknown'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-3 pr-4">
                                                {contact.email ? (
                                                    <div className="flex items-center gap-2 text-dark-300">
                                                        <Mail className="w-4 h-4 text-dark-500" />
                                                        {contact.email}
                                                    </div>
                                                ) : (
                                                    <span className="text-dark-500">-</span>
                                                )}
                                            </td>
                                            <td className="py-3 pr-4">
                                                {contact.phone ? (
                                                    <div className="flex items-center gap-2 text-dark-300">
                                                        <Phone className="w-4 h-4 text-dark-500" />
                                                        {contact.phone}
                                                    </div>
                                                ) : (
                                                    <span className="text-dark-500">-</span>
                                                )}
                                            </td>
                                            <td className="py-3 pr-4">
                                                {contact.organization ? (
                                                    <div className="flex items-center gap-2">
                                                        <Building2 className="w-4 h-4 text-blue-400" />
                                                        <span className="text-blue-400">
                                                            {contact.organization.org_name}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-dark-500">No org</span>
                                                )}
                                            </td>
                                            <td className="py-3 pr-4 font-mono">{contact.call_count || 0}</td>
                                            <td className="py-3 text-dark-400">
                                                {contact.last_contact
                                                    ? new Date(contact.last_contact).toLocaleDateString()
                                                    : contact.updated_at
                                                        ? new Date(contact.updated_at).toLocaleDateString()
                                                        : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                {/* Contact Cards */}
                {filteredContacts.length > 0 && filteredContacts.length <= 20 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredContacts.map((contact) => (
                            <Card key={contact.id} className="hover:border-primary-500/50 transition-colors">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-primary-600/20 flex items-center justify-center">
                                        <User className="w-6 h-6 text-primary-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">{contact.full_name || 'Unknown'}</h3>
                                        <p className="text-sm text-dark-400">
                                            {contact.organization?.org_name || 'No organization'}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2 text-sm">
                                    {contact.email && (
                                        <div className="flex items-center gap-2 text-dark-300">
                                            <Mail className="w-4 h-4 text-dark-500" />
                                            <span className="truncate">{contact.email}</span>
                                        </div>
                                    )}
                                    {contact.phone && (
                                        <div className="flex items-center gap-2 text-dark-300">
                                            <Phone className="w-4 h-4 text-dark-500" />
                                            {contact.phone}
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between pt-2 border-t border-dark-700">
                                        <span className="text-dark-400">Total Calls</span>
                                        <span className="font-mono">{contact.call_count || 0}</span>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
