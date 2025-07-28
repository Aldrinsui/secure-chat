
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldIcon, KeyIcon, LogInIcon, DownloadIcon, CopyIcon, CheckIcon,
  ArrowRightIcon, EyeIcon, EyeOffIcon, ArrowLeftIcon
} from '../components/Icons';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import { generateAndExportKeys, validateKeys, downloadKeyFile, downloadPublicKeyFile } from '../services/cryptoService';
import { truncateKey, copyToClipboard } from '../utils/helpers';
import type { ECDSAKeys } from '../types';
import { AlertType } from '../types';

interface WelcomePageProps {
  onKeysGenerated: (keys: ECDSAKeys) => void;
}

type View = 'start' | 'generate' | 'login';
type CopiedKeyState = 'public' | 'private' | null;

const WelcomePage: React.FC<WelcomePageProps> = ({ onKeysGenerated }) => {
  const [view, setView] = useState<View>('start');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generation state
  const [generatedKeys, setGeneratedKeys] = useState<ECDSAKeys | null>(null);
  const [copiedKey, setCopiedKey] = useState<CopiedKeyState>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [hasDownloaded, setHasDownloaded] = useState(false);

  // Login state
  const [loginPublicKey, setLoginPublicKey] = useState('');
  const [loginPrivateKey, setLoginPrivateKey] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const resetLoginState = () => {
    setError(null);
    setLoginPublicKey('');
    setLoginPrivateKey('');
    setIsLoading(false);
  }

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const keys = await generateAndExportKeys();
      setGeneratedKeys(keys);
      setView('generate');
    } catch (err) {
      setError('Key generation failed. Your browser may not support the required functions.');
      setView('start');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    try {
      const content = await file.text();
      const keyData = JSON.parse(content);

      if (keyData.publicKey && keyData.privateKey) {
        setLoginPublicKey(keyData.publicKey);
        setLoginPrivateKey(keyData.privateKey);
      } else {
        throw new Error("Invalid key file. The file must be a JSON object containing 'publicKey' and 'privateKey' fields.");
      }
    } catch (err) {
      setError(`Key import failed. Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (event.target) event.target.value = '';
    }
  };
  
  const handleManualLogin = async () => {
    if (!loginPublicKey.trim() || !loginPrivateKey.trim()) {
        setError("Both Public and Private keys are required.");
        return;
    }
    
    setIsLoading(true);
    setError(null);

    const keysToValidate = { publicKey: loginPublicKey.trim(), privateKey: loginPrivateKey.trim() };

    try {
        if (await validateKeys(keysToValidate)) {
            onKeysGenerated({
                publicKey: keysToValidate.publicKey,
                privateKey: keysToValidate.privateKey,
                timestamp: new Date().toISOString()
            });
        } else {
            setError("Invalid key pair. The Public and Private Keys do not match or are malformed. Please check your keys and try again.");
        }
    } catch (err) {
      setError(`Login failed. An unexpected error occurred. Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }

  const handleCopyToClipboard = useCallback(async (text: string, keyType: CopiedKeyState) => {
    if (await copyToClipboard(text)) {
      setCopiedKey(keyType);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);
  
  const handleDownload = () => {
    if (generatedKeys) {
      downloadKeyFile(generatedKeys);
      setHasDownloaded(true);
    }
  };

  const renderStartView = () => (
    <div className="max-w-4xl w-full text-center">
      <div className="mx-auto w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-4 shadow-lg">
        <ShieldIcon className="w-10 h-10 text-white" />
      </div>
      <h1 className="text-4xl font-bold text-white mb-2">Secure, Decentralized Communication</h1>
      <p className="text-gray-300 mb-12 leading-relaxed">Your identity is your key. You are in complete control.</p>
      
      {error && <div className="mb-8 max-w-2xl mx-auto"><Alert type={AlertType.CRITICAL} title="Operation Error">{error}</Alert></div>}

      <div className="grid md:grid-cols-2 gap-8 text-left">
        <button onClick={handleGenerate} disabled={isLoading} className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-2xl flex flex-col transition-all duration-300 hover:bg-white/10 hover:border-white/20 text-left">
          <KeyIcon className="w-8 h-8 text-blue-400 mb-4"/>
          <h2 className="text-2xl font-bold mb-2 text-white">New User?</h2>
          <p className="text-gray-300 mb-6 flex-grow">Generate a unique, secure cryptographic identity. No email or phone number required.</p>
          <span className="mt-auto w-full bg-blue-600 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center space-x-3">{isLoading ? 'Generating...' : 'Generate New Identity'}</span>
        </button>
        <button onClick={() => { setView('login'); resetLoginState(); }} disabled={isLoading} className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-2xl flex flex-col transition-all duration-300 hover:bg-white/10 hover:border-white/20 text-left">
          <LogInIcon className="w-8 h-8 text-green-400 mb-4"/>
          <h2 className="text-2xl font-bold mb-2 text-white">Existing User?</h2>
          <p className="text-gray-300 mb-6 flex-grow">Access your account by importing your previously saved key file or entering your keys manually.</p>
          <span className="mt-auto w-full bg-slate-700/50 border border-slate-600 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center space-x-3">Login with Keys</span>
        </button>
      </div>
      <div className="mt-12 max-w-2xl mx-auto"><Alert type={AlertType.WARNING} title="You Are In Control">We don't store your keys. If you lose your key file, access to your identity cannot be recovered.</Alert></div>
    </div>
  );
  
  const renderLoginView = () => (
    <div className="max-w-xl w-full bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl animate-fade-in">
        <button onClick={() => setView('start')} className="flex items-center space-x-2 text-gray-300 hover:text-white mb-6 transition-colors">
            <ArrowLeftIcon className="w-5 h-5" />
            <span>Back</span>
        </button>
        <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Login with Keys</h1>
            <p className="text-gray-300">Enter your keys manually or upload your key file.</p>
        </div>
        
        {error && <div className="mb-6"><Alert type={AlertType.CRITICAL} title="Login Error">{error}</Alert></div>}

        <div className="space-y-6">
            <div>
                <label htmlFor="public-key-area" className="block text-sm font-medium text-gray-300 mb-2">Public Key</label>
                <textarea
                    id="public-key-area"
                    value={loginPublicKey}
                    onChange={(e) => setLoginPublicKey(e.target.value)}
                    placeholder="Paste your public key here..."
                    className="w-full h-24 bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 font-mono text-xs"
                    spellCheck="false"
                />
            </div>
            <div>
                <label htmlFor="private-key-area" className="block text-sm font-medium text-gray-300 mb-2">Private Key</label>
                <textarea
                    id="private-key-area"
                    value={loginPrivateKey}
                    onChange={(e) => setLoginPrivateKey(e.target.value)}
                    placeholder="Paste your private key here..."
                    className="w-full h-32 bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 font-mono text-xs"
                    spellCheck="false"
                />
            </div>
        </div>

        <p className="text-center text-sm text-gray-400 my-4">or</p>
        
        <input type="file" ref={fileInputRef} onChange={handleLoginFileSelect} accept=".json" className="hidden" aria-hidden="true"/>
        <button onClick={() => fileInputRef.current?.click()} className="w-full bg-slate-700/50 border border-slate-600 text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center space-x-3 hover:bg-slate-600/50 transition-colors">
            <span>Upload Key File (populates fields)</span>
        </button>
        
        <div className="mt-8">
            <button
                onClick={handleManualLogin}
                disabled={isLoading || !loginPublicKey.trim() || !loginPrivateKey.trim()}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 flex items-center justify-center space-x-3 transform hover:scale-105"
            >
                {isLoading ? (
                    <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Verifying...</span>
                    </>
                ) : (
                    <>
                        <LogInIcon className="w-5 h-5" />
                        <span>Login</span>
                    </>
                )}
            </button>
        </div>
    </div>
  );

  const renderGenerateView = () => {
    if (!generatedKeys) return null;
    return (
      <div className="max-w-2xl w-full bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl">
        <button onClick={() => setView('start')} className="flex items-center space-x-2 text-gray-300 hover:text-white mb-6 transition-colors"><ArrowLeftIcon className="w-5 h-5" /><span>Back</span></button>
        <div className="text-center mb-8"><h1 className="text-3xl font-bold text-white">Your New Identity Is Ready</h1></div>
        
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-semibold text-white flex items-center space-x-2"><KeyIcon className="w-5 h-5 text-blue-400" /><span>Public Key (Shareable)</span></h2></div>
          <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 flex items-center justify-between">
              <code className="text-sm text-gray-300 font-mono break-all mr-2">{truncateKey(generatedKeys.publicKey, 16, 16)}</code>
              <div className="flex items-center space-x-2">
                <button onClick={() => downloadPublicKeyFile(generatedKeys.publicKey)} className="p-2 bg-slate-600 hover:bg-slate-700 rounded-lg"><DownloadIcon className="w-4 h-4 text-white" /></button>
                <button onClick={() => handleCopyToClipboard(generatedKeys.publicKey, 'public')} className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg">{copiedKey === 'public' ? <CheckIcon className="w-4 h-4 text-white" /> : <CopyIcon className="w-4 h-4 text-white" />}</button>
              </div>
          </div>
        </div>
        
        <div className="mb-8">
            <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-semibold text-white flex items-center space-x-2"><KeyIcon className="w-5 h-5 text-red-400" /><span>Private Key (Secret)</span></h2></div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 flex items-center justify-between">
                <code className="text-sm text-gray-300 font-mono break-all mr-2">{showPrivateKey ? truncateKey(generatedKeys.privateKey, 16, 16) : '•'.repeat(35)}</code>
                <div className="flex items-center space-x-2">
                    <button onClick={() => setShowPrivateKey(!showPrivateKey)} className="p-2 bg-gray-600 hover:bg-gray-500 rounded-lg"><EyeOffIcon className={`w-4 h-4 text-white ${!showPrivateKey && 'hidden'}`}/><EyeIcon className={`w-4 h-4 text-white ${showPrivateKey && 'hidden'}`}/></button>
                    <button onClick={() => handleCopyToClipboard(generatedKeys.privateKey, 'private')} disabled={!showPrivateKey} className="p-2 bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50"><CopyIcon className="w-4 h-4 text-white"/></button>
                </div>
            </div>
        </div>

        <div className="mb-8"><Alert type={AlertType.CRITICAL} title="Action Required: Back Up Your Key"><p className="mb-3">You MUST download your full key file. We cannot recover it for you.</p><button onClick={handleDownload} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center space-x-2"><DownloadIcon className="w-4 h-4" /><span>Download Full Key File</span></button></Alert></div>
        
        <button onClick={() => onKeysGenerated(generatedKeys)} disabled={!hasDownloaded} className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-green-600" title={!hasDownloaded ? "You must download your key file before continuing" : ""}><span>Continue to App</span><ArrowRightIcon className="w-5 h-5" /></button>
      </div>
    );
  };
  
  return (
    <Layout>
      <div className="w-full animate-fade-in flex items-center justify-center">
        {view === 'start' && renderStartView()}
        {view === 'generate' && renderGenerateView()}
        {view === 'login' && renderLoginView()}
      </div>
    </Layout>
  );
};

export default WelcomePage;
