
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { ECDSAKeys, Contact, Message, MessageFile } from '../types';
import { sign, verify, generateFingerprint } from '../services/cryptoService';
import { loadContacts as loadContactsFromStorage, loadMessages as loadMessagesFromStorage, saveMessages as saveMessagesToStorage } from '../services/storageService';
import { truncateKey, copyToClipboard } from '../utils/helpers';
import {
  ArrowLeftIcon, SendIcon, ShieldIcon, ShieldCheckIcon, ShieldAlertIcon, KeyIcon, QrCodeIcon,
  CopyIcon, CheckIcon, MoreVerticalIcon, Trash2Icon, LockIcon, PaperclipIcon, FileIcon,
  MicrophoneIcon, StopCircleIcon, XCircleIcon
} from '../components/Icons';

// --- Helper Functions ---
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

const getSupportedAudioMimeType = (): string | null => {
    const types = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/webm',
        'audio/ogg',
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return null;
};


// --- Message Sub-component ---
interface MessageBubbleProps {
  message: Message;
  contactPublicKey: string; // The contact's public key
  currentUserKey: string;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, contactPublicKey, currentUserKey }) => {
  const [isVerified, setIsVerified] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    const checkVerification = async () => {
      // Determine the objective sender and recipient keys for verification
      const messageSenderKey = message.sender === 'you' ? currentUserKey : contactPublicKey;
      const messageRecipientKey = message.sender === 'you' ? contactPublicKey : currentUserKey;
      
      const result = await verify(message, messageSenderKey, messageRecipientKey);
      if (isMounted) setIsVerified(result);
    };

    // Always try to verify messages that have a signature.
    if (message.signature) {
       checkVerification();
    }
    return () => { isMounted = false; };
  }, [message, contactPublicKey, currentUserKey]);

  const getStatus = () => {
    if (message.state === 'sending') return { text: 'Sending...', icon: <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div> };
    if (message.state === 'failed') return { text: 'Failed', icon: <ShieldAlertIcon className="w-3 h-3 text-red-400" /> };
    if (isVerified === null) return { text: 'Verifying...', icon: <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div> };
    if (isVerified) return { text: 'Verified', icon: <ShieldCheckIcon className="w-3 h-3 text-green-400" /> };
    return { text: 'Not Verified', icon: <ShieldAlertIcon className="w-3 h-3 text-yellow-400" /> };
  };
  
  const status = getStatus();

  const renderFile = (file: MessageFile) => {
    const fileType = file.type.split('/')[0];
    switch(fileType) {
        case 'image':
            return <img src={file.data} alt={file.name} className="rounded-lg max-w-full h-auto mt-2" />;
        case 'video':
            return <video src={file.data} controls className="rounded-lg max-w-full h-auto mt-2" />;
        case 'audio':
            return <audio src={file.data} controls className="w-full mt-2" />;
        default:
            return (
                <a href={file.data} download={file.name} className="flex items-center space-x-3 bg-white/10 p-3 rounded-lg mt-2 hover:bg-white/20 transition-colors">
                    <FileIcon className="w-8 h-8 text-gray-300" />
                    <div className="text-left"><p className="text-sm font-medium">{file.name}</p><p className="text-xs text-gray-400">{(file.size / 1024).toFixed(2)} KB</p></div>
                </a>
            );
    }
  }

  return (
    <div className={`flex ${message.sender === 'you' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl ${message.sender === 'you' ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white' : 'bg-white/10 backdrop-blur-md text-white border border-white/20'} ${message.state === 'sending' ? 'opacity-70' : ''}`}>
        {message.file && renderFile(message.file)}
        {message.content && <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${message.file ? 'mt-2' : ''}`}>{message.content}</p>}
        
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/20">
          <div className="flex items-center space-x-2 text-xs text-gray-300">{status.icon}<span>{status.text}</span></div>
          <LockIcon className="w-3 h-3 text-gray-400" title="Signature Attached" />
        </div>
      </div>
    </div>
  );
};


// --- Main Chat Page Component ---
const ChatPage: React.FC<{ keys: ECDSAKeys }> = ({ keys }) => {
  const { contactId } = useParams();
  const navigate = useNavigate();

  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  
  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [fingerprint, setFingerprint] = useState('');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

  useEffect(() => {
    if (!keys) return;
    try {
      const allContacts: Contact[] = loadContactsFromStorage(keys.publicKey);
      const currentContact = allContacts.find(c => c.id === Number(contactId));
      if (currentContact) {
        setContact(currentContact);
        const savedMessages = loadMessagesFromStorage(keys.publicKey, currentContact.id);
        setMessages(savedMessages);
      } else {
        navigate('/home');
      }
    } catch (e) { console.error("Failed to load chat data", e); navigate('/home'); }
  }, [contactId, navigate, keys]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  
  const saveMyMessages = (updatedMessages: Message[]) => {
      if (!contact || !keys) return;
      saveMessagesToStorage(keys.publicKey, contact.id, updatedMessages);
      setMessages(updatedMessages);
  }

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !attachment && !audioBlob) || !contact || !keys) return;

    const tempId = Date.now();
    let messageFile: MessageFile | undefined;

    // Prepare file data if it exists
    if (attachment) {
        const data = await fileToBase64(attachment);
        messageFile = { name: attachment.name, type: attachment.type, size: attachment.size, data };
    } else if (audioBlob) {
        const fileExtension = audioBlob.type.split('/')[1].split(';')[0];
        const fileName = `voice-message-${Date.now()}.${fileExtension}`;
        const data = await fileToBase64(new File([audioBlob], fileName, { type: audioBlob.type }));
        messageFile = { name: fileName, type: audioBlob.type, size: audioBlob.size, data };
    }

    const payloadForSigning: Pick<Message, 'content' | 'file' | 'timestamp'> = {
        content: newMessage.trim(),
        file: messageFile,
        timestamp: tempId,
    };

    // UI: Add a temporary sending message for the sender
    const tempMessage: Message = { 
        id: tempId, 
        contactId: contact.id,
        sender: 'you',
        ...payloadForSigning,
        signature: '', 
        state: 'sending' 
    };
    
    // Immediately update the sender's UI
    const messagesWithTemp = [...messages, tempMessage];
    saveMyMessages(messagesWithTemp);

    setNewMessage('');
    setAttachment(null);
    setAudioBlob(null);

    try {
        // Step 1: Sign the objective payload. Sender is you, recipient is the contact.
        const signature = await sign(payloadForSigning, keys.privateKey, keys.publicKey, contact.publicKey);
        
        // Step 2: Finalize the message for the SENDER's storage
        const finalSenderMessage: Message = { ...tempMessage, signature, state: 'sent' };
        // Update the temporary message in the sender's list to its final 'sent' state
        saveMyMessages(messagesWithTemp.map(m => m.id === tempId ? finalSenderMessage : m));
        
        // Step 3: "Deliver" the message to the RECIPIENT by saving it to their storage
        const recipientPublicKey = contact.publicKey;
        // The recipient needs to have the sender in their contacts to receive the message.
        const recipientContacts = loadContactsFromStorage(recipientPublicKey);
        const senderAsContactForRecipient = recipientContacts.find(c => c.publicKey === keys.publicKey);

        if (senderAsContactForRecipient) {
            // Create the message from the recipient's perspective using a spread for robustness.
            const recipientMessage: Message = {
                ...payloadForSigning,
                id: tempId,
                contactId: senderAsContactForRecipient.id,
                sender: 'them',
                signature: signature, 
                state: 'received',
            };

            // Add the new message to the recipient's message history for this contact
            const recipientMessages = loadMessagesFromStorage(recipientPublicKey, senderAsContactForRecipient.id);
            const updatedRecipientMessages = [...recipientMessages, recipientMessage];
            saveMessagesToStorage(recipientPublicKey, senderAsContactForRecipient.id, updatedRecipientMessages);
        }
        // If senderAsContactForRecipient is not found, the message is not "delivered."
        // This realistically simulates that both parties must have added each other to communicate.

    } catch (error) {
        console.error('Signing or delivery failed:', error);
        // If anything fails, update the message state to 'failed' in the sender's UI
        const failedMessage: Message = { ...tempMessage, state: 'failed' };
        saveMyMessages(messagesWithTemp.map(m => m.id === tempId ? failedMessage : m));
    }
};
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        if (file.size > MAX_FILE_SIZE) {
            alert(`File is too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
            return;
        }
        setAttachment(file);
        setAudioBlob(null);
    }
  };
  
  const handleStartRecording = async () => {
      const mimeType = getSupportedAudioMimeType();
      if (!mimeType) {
          alert("Your browser does not support the required audio recording formats.");
          return;
      }

      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
          const audioChunks: BlobPart[] = [];
          
          mediaRecorderRef.current.ondataavailable = event => { audioChunks.push(event.data); };
          
          mediaRecorderRef.current.onstop = () => {
              const audioBlob = new Blob(audioChunks, { type: mimeType });
              setAudioBlob(audioBlob);
              stream.getTracks().forEach(track => track.stop());
          };
          
          mediaRecorderRef.current.start();
          setIsRecording(true);
          setAttachment(null);
      } catch (err) {
          alert('Microphone access was denied. Please allow it in your browser settings.');
          console.error("Audio recording permission denied", err);
      }
  };

  const handleStopRecording = () => {
      if (mediaRecorderRef.current && isRecording) {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
      }
  };

  const handleShowVerification = async () => {
    if(!contact) return;
    const fp = await generateFingerprint(contact.publicKey);
    setFingerprint(fp);
    setShowVerificationModal(true);
  }

  const handleCopyToClipboard = async (text: string, item: string) => {
    if (await copyToClipboard(text)) {
      setCopiedItem(item);
      setTimeout(() => setCopiedItem(null), 2000);
    }
  };

  const clearChat = () => {
    if (confirm('Clear all messages for this contact? This cannot be undone.')) {
        saveMyMessages([]);
        setShowMenu(false);
    }
  }

  if (!contact) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading chat...</div>;

  const renderAttachmentPreview = () => {
    let preview = null;
    let name = '';
    let size = 0;

    if (attachment) {
        name = attachment.name;
        size = attachment.size;
        if (attachment.type.startsWith('image/')) {
            preview = <img src={URL.createObjectURL(attachment)} className="w-12 h-12 object-cover rounded-md" />;
        } else {
            preview = <FileIcon className="w-12 h-12 text-gray-400" />;
        }
    } else if (audioBlob) {
        name = 'Voice message';
        size = audioBlob.size;
        preview = <MicrophoneIcon className="w-12 h-12 text-red-400 p-2"/>;
    }

    if (!preview) return null;

    return (
        <div className="p-2 bg-gray-800/50 rounded-lg flex items-center space-x-3">
            {preview}
            <div className="flex-1 text-left"><p className="text-sm text-white truncate">{name}</p><p className="text-xs text-gray-400">{(size/1024).toFixed(1)} KB</p></div>
            <button onClick={() => { setAttachment(null); setAudioBlob(null); }} className="p-1 text-gray-400 hover:text-white rounded-full bg-gray-700/50"><XCircleIcon className="w-5 h-5"/></button>
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col font-sans text-white">
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10 flex-shrink-0 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 py-4"><div className="flex items-center justify-between">
          <div className="flex items-center space-x-4"><button onClick={() => navigate('/home')} className="p-2 -ml-2 hover:bg-white/10 rounded-lg transition-colors"><ArrowLeftIcon className="w-5 h-5 text-white" /></button><div className="flex items-center space-x-3"><div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center"><ShieldIcon className="w-5 h-5 text-white" /></div><div><h1 className="text-lg font-semibold text-white">{contact.nickname}</h1><div className="flex items-center space-x-2"><code className="text-xs text-gray-400 font-mono">{truncateKey(contact.publicKey, 12, 6)}</code></div></div></div></div>
          <div className="flex items-center space-x-2"><button onClick={handleShowVerification} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Verify key fingerprint"><KeyIcon className="w-5 h-5 text-gray-400" /></button><div className="relative"><button onClick={() => setShowMenu(!showMenu)} className="p-2 hover:bg-white/10 rounded-lg transition-colors"><MoreVerticalIcon className="w-5 h-5 text-gray-400" /></button>{showMenu && <div className="absolute right-0 top-12 bg-gray-800 rounded-lg border border-gray-700 shadow-xl z-10 w-48"><button onClick={clearChat} className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-700 transition-colors text-left"><Trash2Icon className="w-4 h-4 text-red-400" /><span className="text-white text-sm">Clear Messages</span></button></div>}</div></div>
        </div></div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-4xl mx-auto w-full"><div className="space-y-4">
        {messages.map((message) => <MessageBubble key={message.id} message={message} contactPublicKey={contact.publicKey} currentUserKey={keys.publicKey} />)}
        <div ref={messagesEndRef} />
      </div></main>

      <footer className="flex-shrink-0 bg-black/20 backdrop-blur-md border-t border-white/10 sticky bottom-0 z-10">
        <div className="max-w-4xl mx-auto px-4 pt-3 pb-4">
            { (attachment || audioBlob) && <div className="mb-2">{renderAttachmentPreview()}</div> }
            <div className="flex items-end space-x-3">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-colors"><PaperclipIcon className="w-5 h-5"/></button>
                <div className="flex-1 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20"><textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type your message..." className="w-full bg-transparent text-white placeholder-gray-400 px-4 py-3 resize-none focus:outline-none" rows={1}/></div>
                {isRecording ? (
                    <button onClick={handleStopRecording} className="p-3 bg-red-600 text-white rounded-2xl transition-all duration-200 animate-pulse"><StopCircleIcon className="w-5 h-5" /></button>
                ) : (newMessage.trim() || attachment || audioBlob) ? (
                    <button onClick={handleSendMessage} className="p-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl transition-all duration-200"><SendIcon className="w-5 h-5" /></button>
                ) : (
                    <button onClick={handleStartRecording} className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-colors"><MicrophoneIcon className="w-5 h-5" /></button>
                )}
            </div>
            <div className="flex items-center justify-center mt-2"><div className="flex items-center space-x-2 text-xs text-gray-400"><LockIcon className="w-3 h-3" /><span>Messages and files are digitally signed for integrity.</span></div></div>
        </div>
      </footer>

      {showVerificationModal && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"><div className="bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-white/20"><div className="flex items-center space-x-3 mb-4"><KeyIcon className="w-6 h-6 text-blue-400" /><h3 className="text-lg font-bold text-white">Key Verification</h3></div><div className="space-y-4"><div><label className="block text-sm font-medium text-gray-300 mb-2">{contact.nickname}'s Public Key</label><div className="flex items-center space-x-2"><code className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono break-all">{contact.publicKey}</code><button onClick={() => handleCopyToClipboard(contact.publicKey, 'verification')} className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">{copiedItem === 'verification' ? <CheckIcon className="w-4 h-4 text-white" /> : <CopyIcon className="w-4 h-4 text-white" />}</button></div></div><div><label className="block text-sm font-medium text-gray-300 mb-2">Key Fingerprint (SHA-256)</label><div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2"><code className="text-lg font-mono text-white tracking-wider">{fingerprint}</code></div></div><div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3"><p className="text-xs text-blue-200"><strong>Verify Authenticity:</strong> Compare this fingerprint with your contact through a separate secure channel (e.g., video call, in person) to prevent man-in-the-middle attacks.</p></div></div><div className="flex space-x-3 mt-6"><button onClick={() => setShowVerificationModal(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors">Close</button><button className="flex-1 bg-gray-500 text-white py-2 px-4 rounded-lg flex items-center justify-center space-x-2 opacity-50 cursor-not-allowed"><QrCodeIcon className="w-4 h-4" /><span>QR Code</span></button></div></div></div>}
    </div>
  );
};

export default ChatPage;
