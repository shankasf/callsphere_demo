import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    Phone,
    Mail,
    Lock,
    ArrowRight,
    Shield,
    Headphones,
    User,
    Sparkles,
    CheckCircle,
    AlertCircle,
    Loader2,
    Eye,
    EyeOff,
    KeyRound,
    MessageSquare
} from 'lucide-react';
import { useAuth } from '../context';
import { authApi } from '../services/api';
import clsx from 'clsx';

type LoginTab = 'admin' | 'agent' | 'requester';
type LoginStep = 'email' | 'otp' | 'password';
type AuthMethod = 'otp' | 'password';

const tabConfig: Record<LoginTab, {
    label: string;
    icon: React.FC<{ className?: string }>;
    description: string;
    gradient: string;
}> = {
    admin: {
        label: 'Administrator',
        icon: Shield,
        description: 'Full system access & configuration',
        gradient: 'from-purple-500 to-indigo-600',
    },
    agent: {
        label: 'Support Agent',
        icon: Headphones,
        description: 'Handle tickets & voice calls',
        gradient: 'from-blue-500 to-cyan-600',
    },
    requester: {
        label: 'Requester',
        icon: User,
        description: 'Submit and track support tickets',
        gradient: 'from-emerald-500 to-teal-600',
    },
};

export function LoginPage() {
    const navigate = useNavigate();
    const { login, isAuthenticated } = useAuth();

    const [activeTab, setActiveTab] = useState<LoginTab>('agent');
    const [authMethod, setAuthMethod] = useState<AuthMethod>('otp');
    const [step, setStep] = useState<LoginStep>('email');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [countdown, setCountdown] = useState(0);

    const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            navigate('/');
        }
    }, [isAuthenticated, navigate]);

    // Countdown timer for resend OTP
    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [countdown]);

    const config = tabConfig[activeTab];

    const handleTabChange = (tab: LoginTab) => {
        setActiveTab(tab);
        setStep('email');
        setEmail('');
        setPassword('');
        setOtp(['', '', '', '', '', '']);
        setError('');
        setSuccess('');
    };

    const handleAuthMethodChange = (method: AuthMethod) => {
        setAuthMethod(method);
        setStep('email');
        setPassword('');
        setOtp(['', '', '', '', '', '']);
        setError('');
        setSuccess('');
    };

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (authMethod === 'otp') {
                // Request OTP
                const response = await authApi.requestOTP(email);
                if (response.success) {
                    setSuccess('Verification code sent to your email');
                    setStep('otp');
                    setCountdown(60);
                    setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
                } else {
                    setError(response.message || 'Failed to send verification code');
                }
            } else {
                // Show password field
                setStep('password');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleOtpChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;

        const newOtp = [...otp];
        newOtp[index] = value.slice(-1);
        setOtp(newOtp);
        setError('');

        // Auto-focus next input
        if (value && index < 5) {
            otpInputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when complete
        if (newOtp.every(d => d) && newOtp.join('').length === 6) {
            handleOtpSubmit(newOtp.join(''));
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpInputRefs.current[index - 1]?.focus();
        }
    };

    const handleOtpSubmit = async (code?: string) => {
        const otpCode = code || otp.join('');
        if (otpCode.length !== 6) {
            setError('Please enter the complete 6-digit code');
            return;
        }

        setError('');
        setIsLoading(true);

        try {
            const response = await authApi.verifyOTP(email, otpCode);
            login(response.accessToken, response.user);
            setSuccess('Login successful! Redirecting...');
            // Navigate based on role
            const userRole = response.user.role;
            const redirectPath = userRole === 'requester' ? '/requester' : userRole === 'agent' ? '/agent' : '/overview';
            setTimeout(() => navigate(redirectPath), 500);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Invalid verification code');
            setOtp(['', '', '', '', '', '']);
            otpInputRefs.current[0]?.focus();
        } finally {
            setIsLoading(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const response = await authApi.login({ email, password });
            login(response.accessToken, response.user);
            setSuccess('Login successful! Redirecting...');
            // Navigate based on role
            const userRole = response.user.role;
            const redirectPath = userRole === 'requester' ? '/requester' : userRole === 'agent' ? '/agent' : '/overview';
            setTimeout(() => navigate(redirectPath), 500);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Invalid credentials');
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendOTP = async () => {
        if (countdown > 0) return;
        setError('');
        setIsLoading(true);

        try {
            const response = await authApi.requestOTP(email);
            if (response.success) {
                setSuccess('New verification code sent');
                setCountdown(60);
                setOtp(['', '', '', '', '', '']);
                otpInputRefs.current[0]?.focus();
            }
        } catch (err: any) {
            setError('Failed to resend code');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4 overflow-hidden relative">
            {/* Animated background */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-500/20 rounded-full blur-3xl animate-pulse" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
            </div>

            {/* Grid pattern */}
            <div
                className="absolute inset-0 opacity-[0.02]"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='m36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}
            />

            <div className="relative w-full max-w-lg">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 mb-4 shadow-2xl shadow-primary-500/30">
                        <Phone className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                        CallSphere Demo
                    </h1>
                    <p className="text-dark-400 mt-2 text-sm">AI Voice Agent Console</p>
                </div>

                {/* Login Card */}
                <div className="glass rounded-3xl overflow-hidden shadow-2xl">
                    {/* Role Tabs */}
                    <div className="flex border-b border-dark-700/50">
                        {(Object.keys(tabConfig) as LoginTab[]).map((tab) => {
                            const TabIcon = tabConfig[tab].icon;
                            const isActive = activeTab === tab;

                            return (
                                <button
                                    key={tab}
                                    onClick={() => handleTabChange(tab)}
                                    className={clsx(
                                        'flex-1 py-4 px-2 flex flex-col items-center gap-1.5 transition-all relative',
                                        isActive
                                            ? 'text-white'
                                            : 'text-dark-400 hover:text-dark-200'
                                    )}
                                >
                                    <TabIcon className="w-5 h-5" />
                                    <span className="text-xs font-medium">{tabConfig[tab].label}</span>
                                    {isActive && (
                                        <div className={clsx(
                                            'absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r',
                                            tabConfig[tab].gradient
                                        )} />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Form Content */}
                    <div className="p-8">
                        {/* Role Description */}
                        <div className="flex items-center gap-3 mb-4 p-4 rounded-xl bg-dark-800/50">
                            <div className={clsx(
                                'w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br',
                                config.gradient
                            )}>
                                <config.icon className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="font-semibold text-white">{config.label}</h2>
                                <p className="text-sm text-dark-400">{config.description}</p>
                            </div>
                        </div>

                        {/* Auth Method Toggle */}
                        {step === 'email' && (
                            <div className="flex gap-2 mb-6 p-1 bg-dark-800/50 rounded-xl">
                                <button
                                    onClick={() => handleAuthMethodChange('otp')}
                                    className={clsx(
                                        'flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all',
                                        authMethod === 'otp'
                                            ? 'bg-primary-500 text-white shadow-lg'
                                            : 'text-dark-400 hover:text-white'
                                    )}
                                >
                                    <MessageSquare className="w-4 h-4" />
                                    Email OTP
                                </button>
                                <button
                                    onClick={() => handleAuthMethodChange('password')}
                                    className={clsx(
                                        'flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all',
                                        authMethod === 'password'
                                            ? 'bg-primary-500 text-white shadow-lg'
                                            : 'text-dark-400 hover:text-white'
                                    )}
                                >
                                    <KeyRound className="w-4 h-4" />
                                    Password
                                </button>
                            </div>
                        )}

                        {/* Status Messages */}
                        {error && (
                            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-400 text-sm">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                {error}
                            </div>
                        )}
                        {success && (
                            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-emerald-400 text-sm">
                                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                                {success}
                            </div>
                        )}

                        {/* Email Step */}
                        {step === 'email' && (
                            <form onSubmit={handleEmailSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-dark-300 mb-2">
                                        Email Address
                                    </label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="you@company.com"
                                            required
                                            className="w-full pl-12 pr-4 py-3.5 bg-dark-800/50 border border-dark-600 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading || !email}
                                    className={clsx(
                                        'w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all',
                                        'bg-gradient-to-r hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed',
                                        config.gradient,
                                        'text-white shadow-lg'
                                    )}
                                >
                                    {isLoading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            Continue
                                            <ArrowRight className="w-5 h-5" />
                                        </>
                                    )}
                                </button>

                                <p className="text-center text-xs text-dark-400 mt-4">
                                    {authMethod === 'otp' ? (
                                        <>
                                            <Sparkles className="w-3 h-3 inline mr-1" />
                                            Secure passwordless login via email verification
                                        </>
                                    ) : (
                                        'Enter your credentials to access your account'
                                    )}
                                </p>
                            </form>
                        )}

                        {/* OTP Step */}
                        {step === 'otp' && (
                            <div className="space-y-6">
                                <div className="text-center">
                                    <p className="text-dark-300 text-sm">
                                        Enter the 6-digit code sent to
                                    </p>
                                    <p className="text-white font-medium mt-1">{email}</p>
                                </div>

                                <div className="flex justify-center gap-2">
                                    {otp.map((digit, index) => (
                                        <input
                                            key={index}
                                            ref={(el) => { otpInputRefs.current[index] = el; }}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handleOtpChange(index, e.target.value)}
                                            onKeyDown={(e) => handleOtpKeyDown(index, e)}
                                            className="w-12 h-14 text-center text-2xl font-bold bg-dark-800/50 border border-dark-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                        />
                                    ))}
                                </div>

                                <button
                                    onClick={() => handleOtpSubmit()}
                                    disabled={isLoading || otp.some(d => !d)}
                                    className={clsx(
                                        'w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all',
                                        'bg-gradient-to-r hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed',
                                        config.gradient,
                                        'text-white shadow-lg'
                                    )}
                                >
                                    {isLoading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            Verify & Sign In
                                            <CheckCircle className="w-5 h-5" />
                                        </>
                                    )}
                                </button>

                                <div className="flex items-center justify-between text-sm">
                                    <button
                                        onClick={() => setStep('email')}
                                        className="text-dark-400 hover:text-white transition-colors"
                                    >
                                        ← Change email
                                    </button>
                                    <button
                                        onClick={handleResendOTP}
                                        disabled={countdown > 0}
                                        className={clsx(
                                            'transition-colors',
                                            countdown > 0
                                                ? 'text-dark-500 cursor-not-allowed'
                                                : 'text-primary-400 hover:text-primary-300'
                                        )}
                                    >
                                        {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Password Step */}
                        {step === 'password' && (
                            <form onSubmit={handlePasswordSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-dark-300 mb-2">
                                        Email Address
                                    </label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                                        <input
                                            type="email"
                                            value={email}
                                            disabled
                                            className="w-full pl-12 pr-4 py-3.5 bg-dark-900/50 border border-dark-700 rounded-xl text-dark-300 cursor-not-allowed"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-dark-300 mb-2">
                                        Password
                                    </label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter your password"
                                            required
                                            minLength={6}
                                            className="w-full pl-12 pr-12 py-3.5 bg-dark-800/50 border border-dark-600 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading || !password}
                                    className={clsx(
                                        'w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all',
                                        'bg-gradient-to-r hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed',
                                        config.gradient,
                                        'text-white shadow-lg'
                                    )}
                                >
                                    {isLoading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            Sign In
                                            <ArrowRight className="w-5 h-5" />
                                        </>
                                    )}
                                </button>

                                <div className="flex items-center justify-between text-sm">
                                    <button
                                        type="button"
                                        onClick={() => setStep('email')}
                                        className="text-dark-400 hover:text-white transition-colors"
                                    >
                                        ← Back to email
                                    </button>
                                    <Link
                                        to="/forgot-password"
                                        className="text-primary-400 hover:text-primary-300 transition-colors"
                                    >
                                        Forgot password?
                                    </Link>
                                </div>
                            </form>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-xs text-dark-500 mt-8">
                    © 2025 CallSphere. AI voice &amp; chat agents for every industry.
                </p>
            </div>
        </div>
    );
}
