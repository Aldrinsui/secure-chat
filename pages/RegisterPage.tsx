import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import { KeyIcon, DownloadIcon, CopyIcon, CheckIcon, ArrowRightIcon, EyeIcon, EyeOffIcon, ArrowLeftIcon } from '../components/Icons';
import { generateAndExportKeys, downloadKeyFile } from '../services/cryptoService';
import { truncateKey, copyToClipboard as copyUtil } from '../utils/helpers';
import type { ECDSAKeys } from '../types';
import { AlertType } from '../types';

interface RegisterPageProps {
    onKeysGenerated: (keys: ECDSAKeys) => void;
}

type CopiedKeyState = 'public' | 'private' | null;

const RegisterPage: React.FC<RegisterPageProps> = ({ onKeysGenerated }) => {
    const navigate = useNavigate();
    const [keys, setKeys] = useState<ECDSAKeys | null>(null);
    const [copiedKey, setCopiedKey] = useState<CopiedKeyState>(null);
    const [showPrivateKey, setShowPrivateKey] = useState(false);
    const [hasDownloaded, setHasDownloaded] = useState(false);

    useEffect(() => {
        const generate = async () => {
            const newKeys = await generateAndExportKeys();
            setKeys(newKeys);
        };
        generate();
    }, []);

    const handleCopyToClipboard = useCallback(async (text: string, keyType: CopiedKeyState) => {
        if (await copyUtil(text)) {
            setCopiedKey(keyType);
            setTimeout(() => setCopiedKey(null), 2500);
        } else {
            alert('Failed to copy key. Please try again.');
        }
    }, []);

    const handleDownload = () => {
        if (keys) {
            downloadKeyFile(keys);
            setHasDownloaded(true);
        }
    };

    if (!keys) {
        return (
            <Layout>
                <div className="flex flex-col items-center text-white">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
                    <p className="text-xl">Generating your secure identity...</p>
                </div>
            </Layout>
        );
    }
    
    return (
        <Layout>
            <div className="max-w-2xl w-full bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl animate-fade-in">
                 <button onClick={() => navigate('/')} className="flex items-center space-x-2 text-gray-300 hover:text-white mb-6 transition-colors">
                    <ArrowLeftIcon className="w-5 h-5" />
                    <span>Back to Home</span>
                </button>
                <div className="text-center mb-8">
                    <div className="mx-auto w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center mb-4">
                        <CheckIcon className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Your New Identity Is Ready</h1>
                    <p className="text-gray-300">Your cryptographic identity has been generated.</p>
                </div>

                {/* Public Key */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-semibold text-white flex items-center space-x-2"><KeyIcon className="w-5 h-5 text-blue-400" /><span>Public Key</span></h2><span className="text-xs text-gray-400 bg-gray-700/50 px-2 py-1 rounded">Safe to share</span></div>
                    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 flex items-center justify-between">
                        <code className="text-sm text-gray-300 font-mono break-all mr-4">{truncateKey(keys.publicKey, 24, 24)}</code>
                        <button onClick={() => handleCopyToClipboard(keys.publicKey, 'public')} className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex-shrink-0">
                            {copiedKey === 'public' ? <CheckIcon className="w-4 h-4 text-white" /> : <CopyIcon className="w-4 h-4 text-white" />}
                        </button>
                    </div>
                </div>

                {/* Private Key */}
                <div className="mb-8">
                     <div className="flex items-center justify-between mb-3"><h2 className="text-lg font-semibold text-white flex items-center space-x-2"><KeyIcon className="w-5 h-5 text-red-400" /><span>Private Key</span></h2><span className="text-xs text-red-400 bg-red-900/50 px-2 py-1 rounded">Keep Secret & Safe</span></div>
                    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                        <div className="flex items-center justify-between">
                           <code className="text-sm text-gray-300 font-mono break-all mr-4">{showPrivateKey ? truncateKey(keys.privateKey, 24, 24) : '•'.repeat(51)}</code>
                           <div className="flex items-center space-x-2 flex-shrink-0">
                                <button onClick={() => setShowPrivateKey(!showPrivateKey)} className="p-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors">
                                    {showPrivateKey ? <EyeOffIcon className="w-4 h-4 text-white"/> : <EyeIcon className="w-4 h-4 text-white"/>}
                                </button>
                                <button onClick={() => handleCopyToClipboard(keys.privateKey, 'private')} disabled={!showPrivateKey} className="p-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    {copiedKey === 'private' ? <CheckIcon className="w-4 h-4 text-white"/> : <CopyIcon className="w-4 h-4 text-white"/>}
                                </button>
                           </div>
                        </div>
                    </div>
                </div>

                <div className="mb-8">
                    <Alert type={AlertType.CRITICAL} title="Action Required: Back Up Your Key">
                        <p className="mb-2">You MUST download your key file and store it somewhere safe. We cannot recover it for you.</p>
                        <button onClick={handleDownload} className="w-full mt-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium py-2.5 px-4 rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 transform hover:scale-105">
                            <DownloadIcon className="w-4 h-4" />
                            <span>Download Key File</span>
                        </button>
                    </Alert>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                    <button 
                        onClick={() => onKeysGenerated(keys)}
                        disabled={!hasDownloaded}
                        className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 flex items-center justify-center space-x-2 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-green-600 disabled:hover:to-emerald-600"
                        title={!hasDownloaded ? "You must download your key file before continuing" : "Continue to the app"}
                    >
                        <span>Continue to App</span>
                        <ArrowRightIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </Layout>
    );
};

export default RegisterPage;
