
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import type { ECDSAKeys } from '../types';

interface ChatPlaceholderPageProps {
    keys: ECDSAKeys | null;
    onStartOver: () => void;
}

const ChatPlaceholderPage: React.FC<ChatPlaceholderPageProps> = ({ keys, onStartOver }) => {
    const navigate = useNavigate();

    useEffect(() => {
        if (!keys) {
            navigate('/');
        }
    }, [keys, navigate]);

    if (!keys) {
        return null;
    }

    return (
        <Layout>
            <div className="max-w-md w-full text-center bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl animate-fade-in">
                <h1 className="text-4xl font-bold text-white mb-4">Secure Chat</h1>
                <p className="text-gray-300 mb-6">
                    Welcome! Your secure session is active.
                </p>
                <div className="text-left bg-gray-800/50 rounded-lg p-4 border border-gray-700 mb-8 text-xs font-mono break-all">
                    <p className="text-green-400 mb-2">// Your Public Key (for this session)</p>
                    <p className="text-gray-400">{keys.publicKey}</p>
                </div>
                <p className="text-gray-400 mb-8">
                    The main application would be built here. You have successfully created and loaded your keys.
                </p>
                <button
                    onClick={onStartOver}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300"
                >
                    End Session & Start Over
                </button>
            </div>
        </Layout>
    );
};

export default ChatPlaceholderPage;
