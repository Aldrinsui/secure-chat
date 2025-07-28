
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { ECDSAKeys, Group, GroupMessage, MessageFile, GroupUpdate } from '../types';
import { truncateKey, copyToClipboard, resizeImage } from '../utils/helpers';
import { signGroupMessage, verifyGroupMessage } from '../services/cryptoService';
import { 
    loadGroups as loadGroupsFromStorage, 
    saveGroups as saveGroupsToStorage,
    loadGroupMessages as loadGroupMessagesFromStorage,
    saveGroupMessages as saveGroupMessagesToStorage
} from '../services/storageService';
import { 
    UsersIcon, PlusIcon, InfoIcon, SendIcon, ShieldIcon, KeyIcon, CopyIcon, CheckIcon, 
    AlertTriangleIcon, ArrowLeftIcon, ShieldCheckIcon, ShieldAlertIcon,
    PaperclipIcon, FileIcon, CalendarIcon, BarChart3Icon, XCircleIcon, CameraIcon
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

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const GroupDp: React.FC<{ group: Group; sizeClass: string; textClass?: string }> = ({ group, sizeClass, textClass = 'text-xl' }) => {
    if (group.displayPicture) {
        return <img src={group.displayPicture} alt={group.name} className={`${sizeClass} rounded-full object-cover`} />;
    }
    const firstLetter = group.name.charAt(0).toUpperCase() || '?';
    // Simple hash function for color generation
    const colorIndex = group.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 5;
    const colors = ['bg-purple-600', 'bg-blue-600', 'bg-green-600', 'bg-pink-600', 'bg-indigo-600'];
    
    return (
        <div className={`${sizeClass} ${colors[colorIndex]} rounded-full flex items-center justify-center`}>
            <span className={`font-bold ${textClass}`}>{firstLetter}</span>
        </div>
    );
};

// --- Message Sub-component ---
const GroupMessageBubble: React.FC<{ 
    message: GroupMessage; 
    allMessages: GroupMessage[];
    currentUserKey: string;
    onVote: (pollId: number, optionIndex: number) => void;
}> = ({ message, allMessages, currentUserKey, onVote }) => {
    const [isVerified, setIsVerified] = useState<boolean | null>(null);
    const isYou = message.senderKey === currentUserKey;

    useEffect(() => {
        let isMounted = true;
        verifyGroupMessage(message).then(result => {
            if (isMounted) setIsVerified(result);
        });
        return () => { isMounted = false; };
    }, [message]);
    
    const status = useMemo(() => {
        if (isVerified === null) return { text: 'Verifying...', icon: <ShieldIcon className="w-3 h-3 text-yellow-400 animate-pulse" /> };
        if (isVerified) return { text: 'Verified', icon: <ShieldCheckIcon className="w-3 h-3 text-green-400" /> };
        return { text: 'Not Verified', icon: <ShieldAlertIcon className="w-3 h-3 text-red-400" /> };
    }, [isVerified]);
    
    const renderFile = (file: MessageFile) => {
        const fileType = file.type.split('/')[0];
        switch(fileType) {
            case 'image': return <img src={file.data} alt={file.name} className="rounded-lg max-w-full h-auto mt-2" />;
            case 'video': return <video src={file.data} controls className="rounded-lg max-w-full h-auto mt-2" />;
            case 'audio': return <audio src={file.data} controls className="w-full mt-2" />;
            default: return (
                <a href={file.data} download={file.name} className="flex items-center space-x-3 bg-white/10 p-3 rounded-lg mt-2 hover:bg-white/20 transition-colors">
                    <FileIcon className="w-8 h-8 text-gray-300" />
                    <div className="text-left"><p className="text-sm font-medium">{file.name}</p><p className="text-xs text-gray-400">{(file.size / 1024).toFixed(2)} KB</p></div>
                </a>
            );
        }
    }

    const renderEvent = (event: NonNullable<GroupMessage['event']>) => (
        <div className="bg-purple-900/50 border border-purple-500/50 rounded-lg p-3 mt-2">
            <div className="flex items-center space-x-2 mb-2 text-purple-300"><CalendarIcon className="w-4 h-4" /><h4 className="font-bold text-white">{event.title}</h4></div>
            <p className="text-sm text-gray-300 mb-2">{event.description}</p>
            <div className="text-xs text-gray-400 space-y-1">
                <p><strong>Time:</strong> {new Date(event.eventTime).toLocaleString()}</p>
                {event.location && <p><strong>Location:</strong> {event.location}</p>}
            </div>
        </div>
    );

    const renderPoll = (poll: NonNullable<GroupMessage['poll']>) => {
        const votes = allMessages.filter(m => m.type === 'pollVote' && m.pollVote?.pollId === message.id);
        const userVote = votes.find(v => v.senderKey === currentUserKey);
        const voteCounts = poll.options.map((_, index) => votes.filter(v => v.pollVote?.optionIndex === index).length);
        const totalVotes = votes.length;

        return (
            <div className="bg-indigo-900/50 border border-indigo-500/50 rounded-lg p-3 mt-2">
                <div className="flex items-center space-x-2 mb-3 text-indigo-300"><BarChart3Icon className="w-4 h-4" /><h4 className="font-bold text-white">{poll.question}</h4></div>
                <div className="space-y-2">
                    {poll.options.map((option, index) => {
                        const percentage = totalVotes > 0 ? (voteCounts[index] / totalVotes) * 100 : 0;
                        return (
                            <button key={index} onClick={() => !userVote && onVote(message.id, index)} disabled={!!userVote} className="w-full text-left rounded-lg overflow-hidden relative p-2 transition-colors disabled:cursor-not-allowed bg-gray-800/50 hover:bg-gray-700/50 disabled:hover:bg-gray-800/50">
                                <div style={{ width: `${percentage}%` }} className="absolute left-0 top-0 bottom-0 bg-indigo-500/50 transition-all duration-500"></div>
                                <div className="relative flex justify-between items-center text-sm">
                                    <span className="text-white">{option}</span>
                                    <span className="text-gray-300 text-xs">{voteCounts[index]}</span>
                                </div>
                                {userVote?.pollVote?.optionIndex === index && <div className="absolute inset-0 border-2 border-green-400 rounded-lg"></div>}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    if (message.type === 'pollVote') return null; // Don't render votes directly

    if (message.type === 'group_update') {
        return (
            <div className="text-center text-xs text-gray-400 my-2 italic">
                {truncateKey(message.senderKey, 8, 4)} updated the group picture.
            </div>
        );
    }

    return (
        <div className={`flex ${isYou ? 'justify-end' : 'justify-start'}`}>
            <div className={`rounded-lg p-3 max-w-sm ${isYou ? 'bg-gradient-to-r from-blue-600 to-purple-600' : 'bg-gray-800/60'}`}>
                {!isYou && <span className="text-xs text-blue-400 font-mono">{truncateKey(message.senderKey)}</span>}
                
                {message.type === 'file' && message.file && renderFile(message.file)}
                {message.type === 'event' && message.event && renderEvent(message.event)}
                {message.type === 'poll' && message.poll && renderPoll(message.poll)}

                {message.content && <p className={`text-sm text-gray-100 whitespace-pre-wrap break-words ${message.type !== 'text' ? 'mt-2' : ''}`}>{message.content}</p>}

                <div className="flex items-center justify-end mt-2 pt-2 border-t border-white/20">
                    <div className="flex items-center space-x-2 text-xs text-gray-300">{status.icon}<span>{status.text}</span></div>
                </div>
            </div>
        </div>
    );
};

// --- Modals ---
const CreateEventModal: React.FC<{
    onClose: () => void;
    onSubmit: (event: NonNullable<GroupMessage['event']>) => void;
}> = ({ onClose, onSubmit }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [eventTime, setEventTime] = useState('');

    const handleSubmit = () => {
        if (!title.trim() || !description.trim() || !eventTime) {
            alert("Event title, description, and time are required.");
            return;
        }
        onSubmit({ title: title.trim(), description: description.trim(), location: location.trim(), eventTime });
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-white/20 shadow-2xl space-y-4">
                <h2 className="text-lg font-bold">Create New Event</h2>
                <input type="text" placeholder="Event Title" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-700 rounded-lg px-3 py-2" />
                <textarea placeholder="Event Description" value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-gray-700 rounded-lg px-3 py-2 h-24 resize-none" />
                <input type="text" placeholder="Location (Optional)" value={location} onChange={e => setLocation(e.target.value)} className="w-full bg-gray-700 rounded-lg px-3 py-2" />
                <input type="datetime-local" value={eventTime} onChange={e => setEventTime(e.target.value)} className="w-full bg-gray-700 rounded-lg px-3 py-2" />
                <div className="flex space-x-3"><button onClick={onClose} className="flex-1 bg-gray-600 hover:bg-gray-500 rounded-lg py-2">Cancel</button><button onClick={handleSubmit} className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-lg py-2">Create</button></div>
            </div>
        </div>
    );
};

const CreatePollModal: React.FC<{
    onClose: () => void;
    onSubmit: (poll: NonNullable<GroupMessage['poll']>) => void;
}> = ({ onClose, onSubmit }) => {
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState(['', '']);

    const handleOptionChange = (index: number, value: string) => {
        setOptions(options.map((opt, i) => i === index ? value : opt));
    };
    const addOption = () => setOptions([...options, '']);
    const removeOption = (index: number) => {
        if (options.length > 2) setOptions(options.filter((_, i) => i !== index));
    };

    const handleSubmit = () => {
        const finalOptions = options.map(o => o.trim()).filter(Boolean);
        if (!question.trim() || finalOptions.length < 2) {
            alert("A poll requires a question and at least two non-empty options.");
            return;
        }
        onSubmit({ question: question.trim(), options: finalOptions });
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-white/20 shadow-2xl space-y-4">
                <h2 className="text-lg font-bold">Create New Poll</h2>
                <input type="text" placeholder="Poll Question" value={question} onChange={e => setQuestion(e.target.value)} className="w-full bg-gray-700 rounded-lg px-3 py-2" />
                <div className="space-y-2">
                    {options.map((option, index) => (
                        <div key={index} className="flex items-center space-x-2">
                            <input type="text" placeholder={`Option ${index + 1}`} value={option} onChange={e => handleOptionChange(index, e.target.value)} className="flex-1 bg-gray-700 rounded-lg px-3 py-2" />
                            <button onClick={() => removeOption(index)} disabled={options.length <= 2} className="p-2 text-red-400 disabled:opacity-50"><XCircleIcon className="w-5 h-5"/></button>
                        </div>
                    ))}
                </div>
                <button onClick={addOption} className="w-full bg-gray-600 hover:bg-gray-500 rounded-lg py-2 text-sm">Add Option</button>
                <div className="flex space-x-3"><button onClick={onClose} className="flex-1 bg-gray-600 hover:bg-gray-500 rounded-lg py-2">Cancel</button><button onClick={handleSubmit} className="flex-1 bg-indigo-600 hover:bg-indigo-700 rounded-lg py-2">Create</button></div>
            </div>
        </div>
    );
};

interface GroupChatPageProps {
  keys: ECDSAKeys;
}

const GroupChatPage: React.FC<GroupChatPageProps> = ({ keys }) => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');

  const [showComposerMenu, setShowComposerMenu] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dpInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Data Persistence ---
  useEffect(() => {
    if (!keys || !groupId) { navigate('/home'); return; }
    try {
        const allGroups = loadGroupsFromStorage(keys.publicKey);
        const currentGroup = allGroups.find(g => g.id === groupId);
        if (currentGroup) {
            const loadedMessages = loadGroupMessagesFromStorage(keys.publicKey, currentGroup.id);
            const updateMessages = loadedMessages.filter((m: GroupMessage) => m.type === 'group_update');
            if (updateMessages.length > 0) {
                const lastUpdate = updateMessages[updateMessages.length - 1].groupUpdate;
                if (lastUpdate) currentGroup.displayPicture = lastUpdate.displayPicture;
            }
            setActiveGroup(currentGroup);
            setMessages(loadedMessages);
        } else { navigate('/home'); }
    } catch(e) { console.error("Failed to load group data", e); navigate('/home'); }
  }, [groupId, keys, navigate]);
  
  const reloadMessagesForCurrentUser = useCallback(() => {
    if (!activeGroup || !keys) return;
    const updatedMessages = loadGroupMessagesFromStorage(keys.publicKey, activeGroup.id);
    setMessages(updatedMessages);
  }, [activeGroup, keys]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  
  // --- Message Sending Logic ---
  const sendMessage = async (payload: Omit<GroupMessage, 'id' | 'signature'>) => {
      if (!activeGroup) return false;
      try {
        const signature = await signGroupMessage(payload, keys.privateKey);
        const finalMessage: GroupMessage = { ...payload, id: payload.timestamp, signature };
        
        // "Deliver" to all members by saving the message to each member's storage.
        // This is the core of the "decentralized" simulation.
        activeGroup.memberKeys.forEach(memberKey => {
            const memberMessages = loadGroupMessagesFromStorage(memberKey, activeGroup.id);
            const updatedMessages = [...memberMessages, finalMessage];
            saveGroupMessagesToStorage(memberKey, activeGroup.id, updatedMessages);
        });
        
        // Update local state for the current user from storage to ensure consistency.
        reloadMessagesForCurrentUser();
        
        return true;
      } catch (e) { 
          console.error("Failed to sign and deliver group message", e); 
          alert("Error: Could not send message."); 
          return false;
      }
  };

  const handleSendTextMessage = async () => {
    if (!newMessage.trim() && !attachment) return;
    let messageFile: MessageFile | undefined;
    if (attachment) {
      if (attachment.size > MAX_FILE_SIZE) { alert(`File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB`); return; }
      const data = await fileToBase64(attachment);
      messageFile = { name: attachment.name, type: attachment.type, size: attachment.size, data };
    }
    const success = await sendMessage({
        groupId: activeGroup!.id, senderKey: keys.publicKey, timestamp: Date.now(),
        type: messageFile ? 'file' : 'text', content: newMessage.trim(), file: messageFile,
    });
    if (success) { setNewMessage(''); setAttachment(null); }
  };

  const handleSendEvent = async (eventData: NonNullable<GroupMessage['event']>) => {
      await sendMessage({
          groupId: activeGroup!.id, senderKey: keys.publicKey, timestamp: Date.now(),
          type: 'event', content: `Event: ${eventData.title}`, event: eventData
      });
      setShowEventModal(false);
  };
  
  const handleSendPoll = async (pollData: NonNullable<GroupMessage['poll']>) => {
      await sendMessage({
          groupId: activeGroup!.id, senderKey: keys.publicKey, timestamp: Date.now(),
          type: 'poll', content: `Poll: ${pollData.question}`, poll: pollData
      });
      setShowPollModal(false);
  };

  const handleVote = async (pollId: number, optionIndex: number) => {
      await sendMessage({
          groupId: activeGroup!.id, senderKey: keys.publicKey, timestamp: Date.now(),
          type: 'pollVote', content: `Voted on poll ${pollId}`, pollVote: { pollId, optionIndex }
      });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setAttachment(file); setShowComposerMenu(false); }
  };
  
  const handleDpChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && activeGroup) {
          try {
              const resized = await resizeImage(file, 256, 256);
              await sendMessage({
                  groupId: activeGroup.id, senderKey: keys.publicKey, timestamp: Date.now(),
                  type: 'group_update', content: `Group picture updated.`, groupUpdate: { displayPicture: resized },
              });
              const updatedGroup = { ...activeGroup, displayPicture: resized };
              setActiveGroup(updatedGroup);
              // Save the updated group info for all members
              activeGroup.memberKeys.forEach(memberKey => {
                const memberGroups = loadGroupsFromStorage(memberKey);
                const updatedMemberGroups = memberGroups.map(g => g.id === updatedGroup.id ? { ...g, displayPicture: resized } : g);
                saveGroupsToStorage(memberKey, updatedMemberGroups);
              });
          } catch (err) { console.error("Failed to update DP", err); alert("Failed to update group picture."); }
      }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendTextMessage(); }
  };

  const handleShareInvitation = async (group: Group) => {
      const invitation = JSON.stringify({ id: group.id, name: group.name, memberKeys: group.memberKeys, displayPicture: group.displayPicture }, null, 2);
      if (await copyToClipboard(invitation)) { alert('Group invitation copied to clipboard!'); } 
      else { alert('Failed to copy invitation.'); }
  };
  
  if (!activeGroup) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 to-purple-900 flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        <span className="ml-4">Loading Group...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 font-sans text-white flex flex-col">
        <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-20 flex-shrink-0">
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <button onClick={() => navigate('/home')} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"><ArrowLeftIcon className="w-5 h-5"/></button>
                    <GroupDp group={activeGroup} sizeClass="w-10 h-10" textClass="text-lg" />
                    <div>
                      <h1 className="text-xl font-bold">{activeGroup.name}</h1>
                      <p className="text-xs text-gray-400">{activeGroup.memberKeys.length} members</p>
                    </div>
                </div>
                <button onClick={() => setShowGroupInfo(!showGroupInfo)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><InfoIcon className="w-5 h-5"/></button>
            </div>
        </header>

        {showGroupInfo && (
            <div className="bg-gray-800/50 border-b border-gray-700/50 p-4 flex-shrink-0">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="relative group cursor-pointer" onClick={() => dpInputRef.current?.click()}>
                     <GroupDp group={activeGroup} sizeClass="w-20 h-20" textClass="text-4xl" />
                     <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><CameraIcon className="w-8 h-8"/></div>
                     <input type="file" ref={dpInputRef} onChange={handleDpChange} accept="image/*" className="hidden"/>
                  </div>
                  <h2 className="text-2xl font-bold">{activeGroup.name}</h2>
                </div>
                <h3 className="text-sm font-medium mb-3 flex items-center"><KeyIcon className="w-4 h-4 mr-2" />Member Public Keys ({activeGroup.memberKeys.length})</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto mb-4">
                    {activeGroup.memberKeys.map((key, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-700/50 rounded px-3 py-2">
                        <span className="text-sm font-mono text-gray-300">{truncateKey(key)}</span>
                        <button onClick={() => copyToClipboard(key).then(success => success && setCopiedKey(key))} className="text-gray-400 hover:text-white">{copiedKey === key ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}</button>
                    </div>
                    ))}
                </div>
                <button onClick={() => handleShareInvitation(activeGroup)} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm">Share Invitation</button>
            </div>
        )}

        <main className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
                {messages.map((message) => (
                    <GroupMessageBubble key={message.id} message={message} allMessages={messages} currentUserKey={keys.publicKey} onVote={handleVote} />
                ))}
                <div ref={messagesEndRef} />
            </div>
        </main>

        <footer className="p-4 border-t border-gray-700/50 bg-gray-900/20 flex-shrink-0">
            {attachment && <div className="p-2 mb-2 bg-gray-800/50 rounded-lg flex items-center space-x-3"><FileIcon className="w-8 h-8 text-gray-400" /><div className="flex-1 text-left"><p className="text-sm text-white truncate">{attachment.name}</p></div><button onClick={() => setAttachment(null)} className="p-1"><XCircleIcon className="w-5 h-5"/></button></div>}
            <div className="flex items-center space-x-3">
                <div className="relative">
                    <button onClick={() => setShowComposerMenu(!showComposerMenu)} className="p-3 bg-gray-800/70 hover:bg-gray-700/70 rounded-full transition-colors"><PlusIcon className="w-5 h-5"/></button>
                    {showComposerMenu && (
                        <div className="absolute bottom-14 left-0 bg-gray-700 rounded-lg border border-gray-600 shadow-xl z-10 w-48">
                            <button onClick={() => { fileInputRef.current?.click(); }} className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-600 text-left"><PaperclipIcon className="w-4 h-4"/><span>Attach File</span></button>
                            <button onClick={() => { setShowEventModal(true); setShowComposerMenu(false); }} className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-600 text-left border-t border-gray-600"><CalendarIcon className="w-4 h-4"/><span>Create Event</span></button>
                            <button onClick={() => { setShowPollModal(true); setShowComposerMenu(false); }} className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-600 text-left border-t border-gray-600"><BarChart3Icon className="w-4 h-4"/><span>Create Poll</span></button>
                        </div>
                    )}
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                <textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={handleKeyPress} className="flex-1 bg-gray-800/70 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-400 resize-none focus:outline-none focus:border-blue-500" placeholder="Type a message or caption..." rows={1}/>
                <button onClick={handleSendTextMessage} disabled={!newMessage.trim() && !attachment} className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-full transition-colors"><SendIcon className="w-5 h-5"/></button>
            </div>
        </footer>
        {showEventModal && <CreateEventModal onClose={() => setShowEventModal(false)} onSubmit={handleSendEvent} />}
        {showPollModal && <CreatePollModal onClose={() => setShowPollModal(false)} onSubmit={handleSendPoll} />}
    </div>
  );
};

export default GroupChatPage;
