'use client';
import { useState, useEffect } from 'react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (session: any) => void;
  recommendedMode: 'tally' | 'mobile';
  tallyAvailable: boolean;
}

interface LoginCredentials {
  mobileNumber: string;
  password: string;
}

interface UserRegistration {
  mobileNumber: string;
  password: string;
  confirmPassword: string;
  companyName: string;
  businessType: string;
}

export function LoginModal({ 
  isOpen, 
  onClose, 
  onLoginSuccess, 
  recommendedMode, 
  tallyAvailable 
}: LoginModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginMode, setLoginMode] = useState<'tally' | 'mobile'>(recommendedMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [loginData, setLoginData] = useState<LoginCredentials>({
    mobileNumber: '',
    password: ''
  });

  const [registerData, setRegisterData] = useState<UserRegistration>({
    mobileNumber: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    businessType: ''
  });

  useEffect(() => {
    setLoginMode(recommendedMode);
  }, [recommendedMode]);

  const handleMobileLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate login form
    if (!loginData.mobileNumber.trim()) {
      setError('Mobile number is required');
      setLoading(false);
      return;
    }

    if (!/^[6-9]\d{9}$/.test(loginData.mobileNumber)) {
      setError('Please enter a valid 10-digit Indian mobile number');
      setLoading(false);
      return;
    }

    if (!loginData.password.trim()) {
      setError('Password is required');
      setLoading(false);
      return;
    }

    try {
      const response = await window.electronAPI.authLoginMobile(loginData);
      
      if (response.success) {
        setSuccess(response.message);
        onLoginSuccess(response.session);
        setTimeout(() => {
          onClose();
          setSuccess(null);
        }, 1000);
      } else {
        setError(response.message);
      }
    } catch (error) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTallyLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      // First check if Tally is connected
      const tallyStatus = await window.electronAPI.checkTallyConnection();
      
      if (!tallyStatus.connected) {
        setError('Tally is not connected. Please start Tally and try again, or use mobile login.');
        setLoading(false);
        return;
      }

      const response = await window.electronAPI.authLoginTally(tallyStatus.companyName || 'Unknown Company');
      
      if (response.success) {
        setSuccess(response.message);
        onLoginSuccess(response.session);
        setTimeout(() => {
          onClose();
          setSuccess(null);
        }, 1000);
      } else {
        setError(response.message);
      }
    } catch (error) {
      setError('Tally connection failed. Please use mobile login.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Enhanced validation
    if (!registerData.mobileNumber.trim()) {
      setError('Mobile number is required');
      setLoading(false);
      return;
    }

    if (!/^[6-9]\d{9}$/.test(registerData.mobileNumber)) {
      setError('Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9)');
      setLoading(false);
      return;
    }

    if (!registerData.password.trim()) {
      setError('Password is required');
      setLoading(false);
      return;
    }

    if (registerData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    if (registerData.password !== registerData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (registerData.companyName && registerData.companyName.length > 100) {
      setError('Company name must not exceed 100 characters');
      setLoading(false);
      return;
    }

    try {
      const response = await window.electronAPI.authRegister({
        mobileNumber: registerData.mobileNumber,
        password: registerData.password,
        companyName: registerData.companyName,
        businessType: registerData.businessType
      });
      
      if (response.success) {
        setSuccess(response.message);
        setMode('login');
        setLoginData({ mobileNumber: registerData.mobileNumber, password: '' });
      } else {
        setError(response.message);
      }
    } catch (error) {
      setError('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {mode === 'login' ? 'Login to TallyKaro' : 'Register New Account'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ✕
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
              {success}
            </div>
          )}

          {mode === 'login' ? (
            <div>
              {/* Login Mode Selector */}
              <div className="mb-6">
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setLoginMode('tally')}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                      loginMode === 'tally'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600'
                    } ${!tallyAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={!tallyAvailable}
                  >
                    🏢 Tally Mode
                    {!tallyAvailable && <div className="text-xs text-red-500">Not Available</div>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoginMode('mobile')}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                      loginMode === 'mobile'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600'
                    }`}
                  >
                    📱 Mobile Login
                  </button>
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  {loginMode === 'tally' 
                    ? 'Connect directly to your running Tally instance'
                    : 'Login with your mobile number to access stored data'
                  }
                </div>
              </div>

              {/* Tally Login */}
              {loginMode === 'tally' && (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${tallyAvailable ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-sm font-medium">
                        {tallyAvailable ? 'Tally Connected' : 'Tally Not Connected'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {tallyAvailable 
                        ? 'Click below to login with your Tally company data'
                        : 'Please start Tally software and ensure ODBC is enabled'
                      }
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleTallyLogin}
                    disabled={!tallyAvailable || loading}
                    className="w-full bg-gray-800 text-white py-3 px-4 rounded-lg hover:bg-gray-700 border-2 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                    style={{borderColor: '#ea580c'}}
                  >
                    {loading ? 'Connecting...' : '🏢 Login with Tally'}
                  </button>
                </div>
              )}

              {/* Mobile Login */}
              {loginMode === 'mobile' && (
                <form onSubmit={handleMobileLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      value={loginData.mobileNumber}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setLoginData({...loginData, mobileNumber: value});
                      }}
                      placeholder="Enter 10-digit mobile number"
                      className="w-full px-3 py-2 border-2 border-emerald-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                      maxLength={10}
                      required
                    />
                    {loginData.mobileNumber && !/^[6-9]\d{9}$/.test(loginData.mobileNumber) && (
                      <div className="text-red-500 text-xs mt-1">
                        Mobile number must be 10 digits starting with 6, 7, 8, or 9
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Password
                    </label>
                    <input
                      type="password"
                      value={loginData.password}
                      onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                      placeholder="Enter your password"
                      className="w-full px-3 py-2 border-2 border-emerald-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gray-800 text-white py-3 px-4 rounded-lg hover:bg-gray-700 border-2 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                    style={{borderColor: '#ea580c'}}
                  >
                    {loading ? 'Logging in...' : '📱 Login with Mobile'}
                  </button>
                </form>
              )}

              {/* Switch to Register */}
              <div className="mt-6 text-center">
                <span className="text-gray-600">Don't have an account? </span>
                <button
                  type="button"
                  onClick={() => {setMode('register'); setError(null); setSuccess(null);}}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  Register here
                </button>
              </div>
            </div>
          ) : (
            /* Registration Form */
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mobile Number *
                </label>
                <input
                  type="tel"
                  value={registerData.mobileNumber}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setRegisterData({...registerData, mobileNumber: value});
                  }}
                  placeholder="Enter 10-digit mobile number"
                  className="w-full px-3 py-2 border-2 border-emerald-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                  maxLength={10}
                  required
                />
                {registerData.mobileNumber && !/^[6-9]\d{9}$/.test(registerData.mobileNumber) && (
                  <div className="text-red-500 text-xs mt-1">
                    Mobile number must be 10 digits starting with 6, 7, 8, or 9
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password *
                </label>
                <input
                  type="password"
                  value={registerData.password}
                  onChange={(e) => setRegisterData({...registerData, password: e.target.value})}
                  placeholder="Minimum 6 characters"
                  className="w-full px-3 py-2 border-2 border-emerald-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password *
                </label>
                <input
                  type="password"
                  value={registerData.confirmPassword}
                  onChange={(e) => setRegisterData({...registerData, confirmPassword: e.target.value})}
                  placeholder="Re-enter your password"
                  className="w-full px-3 py-2 border-2 border-emerald-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  value={registerData.companyName}
                  onChange={(e) => {
                    const value = e.target.value.slice(0, 100);
                    setRegisterData({...registerData, companyName: value});
                  }}
                  placeholder="Your company name (optional)"
                  className="w-full px-3 py-2 border-2 border-emerald-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                  maxLength={100}
                />
                {registerData.companyName && registerData.companyName.length > 80 && (
                  <div className="text-yellow-600 text-xs mt-1">
                    {100 - registerData.companyName.length} characters remaining
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Business Type
                </label>
                <select
                  value={registerData.businessType}
                  onChange={(e) => setRegisterData({...registerData, businessType: e.target.value})}
                  className="w-full px-3 py-2 border-2 border-emerald-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  <option value="">Select business type (optional)</option>
                  <option value="trading">Trading</option>
                  <option value="manufacturing">Manufacturing</option>
                  <option value="services">Services</option>
                  <option value="retail">Retail</option>
                  <option value="wholesale">Wholesale</option>
                  <option value="construction">Construction</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gray-800 text-white py-3 px-4 rounded-lg hover:bg-gray-700 border-2 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
              >
                {loading ? 'Registering...' : 'Register Account'}
              </button>

              {/* Switch to Login */}
              <div className="mt-6 text-center">
                <span className="text-gray-600">Already have an account? </span>
                <button
                  type="button"
                  onClick={() => {setMode('login'); setError(null); setSuccess(null);}}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  Login here
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}