import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    Phone,
    Mail,
    Lock,
    ArrowRight,
    ArrowLeft,
    CheckCircle,
    AlertCircle,
    Loader2,
    Eye,
    EyeOff,
    KeyRound
} from 'lucide-react';
import { authApi } from '../services/api';
import clsx from 'clsx';

type ResetStep = 'email' | 'otp' | 'newPassword' | 'success';

export function ForgotPasswordPage() {
    const navigate = useNavigate();

    const [step, setStep] = useState<ResetStep>('email');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [countdown, setCountdown] = useState(0);

    const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Countdown timer for resend OTP
    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [countdown]);

    const handleEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const response = await authApi.forgotPassword(email);
            if (response.success) {
                setSuccess('Reset code sent to your email');
                setStep('otp');
                setCountdown(60);
                setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
            } else {
                setError(response.message || 'Failed to send reset code');
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

        // Auto-advance when complete
        if (newOtp.every(d => d) && newOtp.join('').length === 6) {
            setStep('newPassword');
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpInputRefs.current[index - 1]?.focus();
        }
    };

    const handleResendOTP = async () => {
        if (countdown > 0) return;
        setError('');
        setIsLoading(true);

        try {
            const response = await authApi.forgotPassword(email);
            if (response.success) {
                setSuccess('New reset code sent');
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

    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setIsLoading(true);

        try {
            const response = await authApi.resetPassword(email, otp.join(''), newPassword);
            if (response.success) {
                setStep('success');
            } else {
                setError(response.message || 'Failed to reset password');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to reset password');
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

                {/* Reset Card */}
                <div className="glass rounded-3xl overflow-hidden shadow-2xl">
                    {/* Header */}
                    <div className="p-6 border-b border-dark-700/50">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-amber-500 to-orange-600">
                                <KeyRound className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="font-semibold text-white">Reset Password</h2>
                                <p className="text-sm text-dark-400">
                                    {step === 'email' && 'Enter your email to receive a reset code'}
                                    {step === 'otp' && 'Enter the 6-digit code from your email'}
                                    {step === 'newPassword' && 'Create your new password'}
                                    {step === 'success' && 'Password reset complete!'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Form Content */}
                    <div className="p-8">
                        {/* Status Messages */}
                        {error && (
                            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-400 text-sm">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                {error}
                            </div>
                        )}
                        {success && step !== 'success' && (
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
                                    className="w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg"
                                >
                                    {isLoading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            Send Reset Code
                                            <ArrowRight className="w-5 h-5" />
                                        </>
                                    )}
                                </button>

                                <Link
                                    to="/login"
                                    className="w-full flex items-center justify-center gap-2 text-sm text-dark-400 hover:text-white transition-colors"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    Back to Login
                                </Link>
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
                                    onClick={() => setStep('newPassword')}
                                    disabled={otp.some(d => !d)}
                                    className="w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg"
                                >
                                    Continue
                                    <ArrowRight className="w-5 h-5" />
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

                        {/* New Password Step */}
                        {step === 'newPassword' && (
                            <form onSubmit={handlePasswordReset} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-dark-300 mb-2">
                                        New Password
                                    </label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="Enter new password"
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

                                <div>
                                    <label className="block text-sm font-medium text-dark-300 mb-2">
                                        Confirm Password
                                    </label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Confirm new password"
                                            required
                                            minLength={6}
                                            className="w-full pl-12 pr-12 py-3.5 bg-dark-800/50 border border-dark-600 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white transition-colors"
                                        >
                                            {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading || !newPassword || !confirmPassword}
                                    className="w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg"
                                >
                                    {isLoading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            Reset Password
                                            <CheckCircle className="w-5 h-5" />
                                        </>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setStep('otp')}
                                    className="w-full text-center text-sm text-dark-400 hover:text-white transition-colors"
                                >
                                    ← Back to code
                                </button>
                            </form>
                        )}

                        {/* Success Step */}
                        {step === 'success' && (
                            <div className="text-center space-y-6">
                                <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                                    <CheckCircle className="w-10 h-10 text-emerald-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-semibold text-white mb-2">Password Reset!</h3>
                                    <p className="text-dark-400 text-sm">
                                        Your password has been successfully reset. You can now login with your new password.
                                    </p>
                                </div>
                                <button
                                    onClick={() => navigate('/login')}
                                    className="w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-primary-500 to-purple-600 hover:opacity-90 text-white shadow-lg"
                                >
                                    Go to Login
                                    <ArrowRight className="w-5 h-5" />
                                </button>
                            </div>
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
