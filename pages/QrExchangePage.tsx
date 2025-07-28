import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import jsQR from 'jsqr';
import type { ECDSAKeys, Contact } from '../types';
import { AlertType } from '../types';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import { truncateKey, copyToClipboard } from '../utils/helpers';
import { loadContacts as loadContactsFromStorage, saveContacts as saveContactsToStorage } from '../services/storageService';
import { 
  QrCodeIcon, CameraIcon, CopyIcon, CheckIcon, UsersIcon, 
  XIcon, FingerprintIcon, ArrowLeftIcon 
} from '../components/Icons';

type View = 'my-qr' | 'scan' | 'confirm';

const QrExchangePage: React.FC<{ keys: ECDSAKeys }> = ({ keys }) => {
    const navigate = useNavigate();
    const [currentView, setCurrentView] = useState<View>('my-qr');
    const [copied, setCopied] = useState(false);
    const [cameraPermission, setCameraPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
    const [scannedKey, setScannedKey] = useState('');
    const [contacts, setContacts] = useState<Contact[]>([]);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationFrameId = useRef<number | null>(null);

    useEffect(() => {
        if (!keys) return;
        const savedContacts = loadContactsFromStorage(keys.publicKey);
        setContacts(savedContacts);
    }, [keys]);

    const handleCopyToClipboard = async (text: string) => {
        if (await copyToClipboard(text)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const stopScan = useCallback(() => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    const scanFrame = useCallback(() => {
        if (!videoRef.current || !canvasRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
            animationFrameId.current = requestAnimationFrame(scanFrame);
            return;
        }
        
        const canvas = canvasRef.current;
        const video = videoRef.current;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        
        if (context) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });

            if (code) {
                setScannedKey(code.data);
                setCurrentView('confirm');
                stopScan();
            }
        }
        animationFrameId.current = requestAnimationFrame(scanFrame);
    }, [stopScan]);

    const startScan = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play();
                    animationFrameId.current = requestAnimationFrame(scanFrame);
                };
            }
            setCameraPermission('granted');
        } catch (err) {
            setCameraPermission('denied');
        }
    }, [scanFrame]);
    
    useEffect(() => {
      if (currentView === 'scan' && cameraPermission === 'prompt') {
          startScan();
      }
      // Cleanup on component unmount
      return () => stopScan();
    }, [currentView, cameraPermission, startScan, stopScan]);


    const handleAddContact = () => {
        if (!keys) return;
        const isDuplicate = contacts.some(contact => contact.publicKey === scannedKey);
        if (isDuplicate) {
            navigate('/home');
            return;
        }
        const newContact: Contact = {
            id: Date.now(),
            publicKey: scannedKey,
            nickname: `Contact #${contacts.length + 1}`,
            addedAt: new Date().toISOString()
        };
        const updatedContacts = [...contacts, newContact];
        saveContactsToStorage(keys.publicKey, updatedContacts);
        navigate('/home');
    };

    const isScannedKeyDuplicate = contacts.some(c => c.publicKey === scannedKey);

    const renderMyQr = () => (
        <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl animate-fade-in">
            <div className="flex items-center mb-6">
                <button onClick={() => navigate('/home')} className="p-2 -ml-2 mr-2 hover:bg-white/10 rounded-full transition-colors"><ArrowLeftIcon className="w-5 h-5"/></button>
                <h1 className="text-2xl font-bold flex items-center"><QrCodeIcon className="w-6 h-6 mr-3"/>My Public Key</h1>
            </div>
            <div className="text-center p-4 bg-white rounded-xl mb-6 inline-block mx-auto"><QRCodeCanvas value={keys.publicKey} size={256} bgColor={"#ffffff"} fgColor={"#000000"} /></div>
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 mb-6">
                <p className="text-xs text-gray-400 font-mono break-all mb-3">{keys.publicKey}</p>
                <button onClick={() => handleCopyToClipboard(keys.publicKey)} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 px-4 flex items-center justify-center space-x-2 transition-colors">
                    {copied ? <CheckIcon className="w-5 h-5" /> : <CopyIcon className="w-5 h-5" />}
                    <span>{copied ? 'Copied!' : 'Copy Public Key'}</span>
                </button>
            </div>
            <button onClick={() => setCurrentView('scan')} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 flex items-center justify-center space-x-3 transform hover:scale-105">
                <CameraIcon className="w-5 h-5" /><span>Scan Contact's QR</span>
            </button>
        </div>
    );
    
    const renderScan = () => (
        <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl animate-fade-in">
             <div className="flex items-center mb-6">
                <button onClick={() => { stopScan(); setCurrentView('my-qr'); }} className="p-2 -ml-2 mr-2 hover:bg-white/10 rounded-full transition-colors"><ArrowLeftIcon className="w-5 h-5"/></button>
                <h1 className="text-2xl font-bold flex items-center"><CameraIcon className="w-6 h-6 mr-3"/>Scan QR Code</h1>
            </div>
            <div className="aspect-square bg-black rounded-lg overflow-hidden relative flex items-center justify-center">
                {cameraPermission === 'granted' && <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />}
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute inset-0 border-[40px] border-black/50 rounded-lg"></div>
                <div className="absolute w-2/3 h-2/3 border-2 border-white/50 rounded-lg animate-pulse"></div>
            </div>
            {cameraPermission === 'denied' && (
                 <div className="mt-6">
                    <Alert type={AlertType.CRITICAL} title="Camera Access Denied">
                        Please enable camera permissions in your browser settings to scan QR codes.
                    </Alert>
                </div>
            )}
        </div>
    );
    
    const renderConfirm = () => (
        <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold flex items-center"><UsersIcon className="w-6 h-6 mr-3"/>Confirm Contact</h1>
                <button onClick={() => setCurrentView('scan')} className="p-2 hover:bg-white/10 rounded-full transition-colors"><XIcon className="w-5 h-5"/></button>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 mb-6">
                <h3 className="text-sm font-medium text-gray-300 mb-2 flex items-center"><FingerprintIcon className="w-4 h-4 mr-2" />Public Key Scanned</h3>
                <p className="text-sm font-mono text-gray-400 break-all">{truncateKey(scannedKey, 16, 16)}</p>
            </div>
            {isScannedKeyDuplicate && (
                <div className="mb-6"><Alert type={AlertType.WARNING} title="Duplicate Contact">This public key is already in your contacts list.</Alert></div>
            )}
            <div className="mb-6"><Alert type={AlertType.CRITICAL} title="Verify Fingerprint">Always verify the key fingerprint through a separate, secure channel (e.g., in person) before trusting this contact.</Alert></div>
             <div className="flex flex-col sm:flex-row gap-4">
                <button onClick={() => setCurrentView('scan')} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-xl transition-all">Cancel</button>
                <button onClick={handleAddContact} className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-all flex items-center justify-center space-x-2">
                    <span>{isScannedKeyDuplicate ? 'Go Back' : 'Add Contact'}</span>
                </button>
            </div>
        </div>
    );

    return (
        <Layout>
            {currentView === 'my-qr' && renderMyQr()}
            {currentView === 'scan' && renderScan()}
            {currentView === 'confirm' && renderConfirm()}
        </Layout>
    );
};

export default QrExchangePage;
