
import React, { useState } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import type { ECDSAKeys } from './types';
import WelcomePage from './pages/WelcomePage';
import ChatHomePage from './pages/ChatHomePage';
import ChatPage from './pages/ChatPage';
import QrExchangePage from './pages/QrExchangePage';
import GroupChatPage from './pages/GroupChatPage';
import { wipeUserData } from './services/storageService';

const getKeysFromSession = (): ECDSAKeys | null => {
    const publicKey = sessionStorage.getItem('userPublicKey');
    const privateKey = sessionStorage.getItem('userPrivateKey');
    const timestamp = sessionStorage.getItem('userKeyTimestamp');
    if (publicKey && privateKey && timestamp) {
        return { publicKey, privateKey, timestamp };
    }
    return null;
};

function App(): React.ReactNode {
    const [keys, setKeys] = useState<ECDSAKeys | null>(getKeysFromSession());
    const navigate = useNavigate();

    const handleKeysGenerated = (generatedKeys: ECDSAKeys) => {
        sessionStorage.setItem('userPublicKey', generatedKeys.publicKey);
        sessionStorage.setItem('userPrivateKey', generatedKeys.privateKey);
        sessionStorage.setItem('userKeyTimestamp', generatedKeys.timestamp);
        setKeys(generatedKeys);
        navigate('/home');
    };
    
    const handleLogout = () => {
        // Clear session storage for keys only, preserving localStorage
        sessionStorage.removeItem('userPublicKey');
        sessionStorage.removeItem('userPrivateKey');
        sessionStorage.removeItem('userKeyTimestamp');
        
        setKeys(null);
        navigate('/');
    };

    const handleStartOver = () => {
        // Wipe data for the current user only
        if (keys) {
            wipeUserData(keys.publicKey);
        }

        // Clear session storage for keys
        sessionStorage.removeItem('userPublicKey');
        sessionStorage.removeItem('userPrivateKey');
        sessionStorage.removeItem('userKeyTimestamp');
        
        setKeys(null);
        navigate('/');
    };

    return (
        <Routes>
            {/* Unified Auth Route */}
            <Route path="/" element={!keys ? <WelcomePage onKeysGenerated={handleKeysGenerated} /> : <Navigate to="/home" replace />} />

            {/* Protected App Routes */}
            <Route path="/home" element={keys ? <ChatHomePage keys={keys} onStartOver={handleStartOver} onLogout={handleLogout}/> : <Navigate to="/" replace />} />
            <Route path="/chat/:contactId" element={keys ? <ChatPage keys={keys} /> : <Navigate to="/" replace />} />
            <Route path="/qr" element={keys ? <QrExchangePage keys={keys} /> : <Navigate to="/" replace />} />
            <Route path="/group/:groupId" element={keys ? <GroupChatPage keys={keys} /> : <Navigate to="/" replace />} />

            {/* Catch-all Redirect */}
            <Route path="*" element={<Navigate to={keys ? "/home" : "/"} replace />} />
        </Routes>
    );
}

export default App;
