
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import { ArrowLeftIcon, LogInIcon } from '../components/Icons';
import { validateKeys } from '../services/cryptoService';
import type { ECDSAKeys } from '../types';
import { AlertType } from '../types';

const LoginPage: React.FC<{ onKeysGenerated: (keys: ECDSAKeys) => void }> = ({ onKeysGenerated }) => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [publicKey, setPublicKey] = useState('');
    const [privateKey, setPrivateKey] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleLoginClick = async () => {
        setIsLoading(true);
        setError(null);
        
        const keysToValidate = { 
            publicKey: publicKey.trim(), 
            privateKey: privateKey.trim() 
        };

        if (!keysToValidate.publicKey || !keysToValidate.privateKey) {
            setError("Both Public and Private keys are required.");
            setIsLoading(false);
            return;
        }

        try {
            const isValid = await validateKeys(keysToValidate);
            if (isValid) {
                const keys: ECDSAKeys = {
                    privateKey: keysToValidate.privateKey,
                    publicKey: keysToValidate.publicKey,
                    timestamp: new Date().toISOString()
                };
                onKeysGenerated(keys);
            } else {
                setError("Login Failed: The Private Key is invalid or does not correspond to the Public Key. Please check the keys and try again.");
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to process keys.";
            setError(`Login Failed: ${message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setError(null);

        try {
            const fileContent = await file.text();
            const parsedData = JSON.parse(fileContent);
            
            if (parsedData.privateKey && typeof parsedData.privateKey === 'string') {
                setPrivateKey(parsedData.privateKey);
            } else {
                throw new Error("Invalid key file. The file must be a JSON object containing a 'privateKey' field.");
            }
        } catch(err) {
             const message = err instanceof Error ? err.message : "Failed to parse key file. Ensure it is valid JSON.";
             setError(message);
        }

        if (event.target) {
            event.target.value = '';
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    return (
        <Layout>
            <div className="max-w-xl w-full bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl animate-fade-in">
                <button onClick={() => navigate('/')} className="flex items-center space-x-2 text-gray-300 hover:text-white mb-6 transition-colors">
                    <ArrowLeftIcon className="w-5 h-5" />
                    <span>Back to Home</span>
                </button>
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Login to SecureChat</h1>
                    <p className="text-gray-300">Enter your keys to access your account.</p>
                </div>
                
                {error && (
                    <div className="mb-6">
                        <Alert type={AlertType.CRITICAL} title="Login Error">
                            {error}
                        </Alert>
                    </div>
                )}

                <div className="space-y-6">
                    <div>
                        <label htmlFor="public-key-area" className="block text-sm font-medium text-gray-300 mb-2">Public Key</label>
                        <textarea
                            id="public-key-area"
                            value={publicKey}
                            onChange={(e) => setPublicKey(e.target.value)}
                            placeholder="Paste your public key here..."
                            className="w-full h-24 bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 font-mono text-xs"
                            spellCheck="false"
                            required
                        />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-2">
                             <label htmlFor="private-key-area" className="block text-sm font-medium text-gray-300">Private Key</label>
                             <button onClick={handleUploadClick} className="text-sm text-blue-400 hover:text-blue-300 hover:underline">
                                Upload from file
                             </button>
                             <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileSelected}
                                accept=".json"
                                className="hidden"
                                aria-hidden="true"
                            />
                        </div>
                        <textarea
                            id="private-key-area"
                            value={privateKey}
                            onChange={(e) => setPrivateKey(e.target.value)}
                            placeholder="Paste your private key here, or upload it."
                            className="w-full h-32 bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 font-mono text-xs"
                            spellCheck="false"
                            required
                        />
                    </div>
                </div>

                <div className="mt-8">
                    <button
                        onClick={handleLoginClick}
                        disabled={isLoading || !publicKey.trim() || !privateKey.trim()}
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
        </Layout>
    );
};

export default LoginPage;
