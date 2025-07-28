
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ECDSAKeys, Contact, Group } from '../types';
import {
  UsersIcon, UserPlusIcon, MessageCircleIcon, SettingsIcon, KeyIcon, CopyIcon, CheckIcon, 
  DownloadIcon, RefreshCwIcon, AlertTriangleIcon, PlusIcon, ShieldIcon, Trash2Icon,
  EyeIcon, EyeOffIcon, HashIcon, EditIcon, QrCodeIcon, LogOutIcon, ShieldCheckIcon, XIcon
} from '../components/Icons';
import { downloadKeyFile } from '../services/cryptoService';
import { 
  loadContacts as loadContactsFromStorage, 
  saveContacts as saveContactsToStorage, 
  removeMessagesForContact,
  loadGroups as loadGroupsFromStorage,
  saveGroups as saveGroupsToStorage
} from '../services/storageService';
import { truncateKey, copyToClipboard } from '../utils/helpers';

interface ChatHomePageProps {
    keys: ECDSAKeys | null;
    onStartOver: () => void;
    onLogout: () => void;
}

const GroupDp: React.FC<{ group: Group; sizeClass: string; textClass?: string }> = ({ group, sizeClass, textClass = 'text-xl' }) => {
  if (group.displayPicture) {
      return <img src={group.displayPicture} alt={group.name} className={`${sizeClass} rounded-full object-cover`} />;
  }
  const firstLetter = group.name.charAt(0).toUpperCase() || '?';
  const colorIndex = group.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 5;
  const colors = ['bg-purple-600', 'bg-blue-600', 'bg-green-600', 'bg-pink-600', 'bg-indigo-600'];
  
  return (
      <div className={`${sizeClass} ${colors[colorIndex]} rounded-full flex items-center justify-center`}>
          <span className={`font-bold ${textClass}`}>{firstLetter}</span>
      </div>
  );
};


const ChatHomePage: React.FC<ChatHomePageProps> = ({ keys, onStartOver, onLogout }) => {
  const navigate = useNavigate();
  
  useEffect(() => { if (!keys) navigate('/'); }, [keys, navigate]);

  const [activeTab, setActiveTab] = useState('people');
  const [copiedItem, setCopiedItem] = useState<string | number | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showRegenerateWarning, setShowRegenerateWarning] = useState(false);

  // Contacts State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newContactKey, setNewContactKey] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [editingContact, setEditingContact] = useState<{ id: number; nickname: string } | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const contactFileInputRef = useRef<HTMLInputElement>(null);

  // Groups State
  const [groups, setGroups] = useState<Group[]>([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showJoinGroup, setShowJoinGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupKeys, setNewGroupKeys] = useState('');
  const [joinInvitation, setJoinInvitation] = useState('');
  const [groupActionError, setGroupActionError] = useState<string | null>(null);
  
  const loadData = useCallback(() => {
    if (!keys) return;
    setContacts(loadContactsFromStorage(keys.publicKey));
    setGroups(loadGroupsFromStorage(keys.publicKey));
  }, [keys]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCopyToClipboard = useCallback(async (text: string, item: string | number) => {
    if (await copyToClipboard(text)) {
      setCopiedItem(item);
      setTimeout(() => setCopiedItem(null), 2000);
    } else {
      alert('Failed to copy text.');
    }
  }, []);

  // --- Contact Functions ---
  const handleContactFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setContactError(null);
    try {
        const keyFromFile = await file.text();
        if (keyFromFile.trim()) {
            setNewContactKey(keyFromFile.trim());
        } else {
            throw new Error("The selected file is empty or invalid.");
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to read file.";
        setContactError(`Error reading file: ${message}`);
    }

    if (event.target) {
        event.target.value = ''; // Reset file input to allow re-selection of the same file
    }
  };

  const addContact = () => {
    setContactError(null);
    if (!newContactKey.trim() || !keys) return;

    const keyToAdd = newContactKey.trim();

    // Validation 1: Check for duplicate public key
    if (contacts.some(c => c.publicKey === keyToAdd)) {
        setContactError("This public key is already in your contacts list.");
        return;
    }

    // Validation 2: Check key format (must be 130 hex characters for uncompressed secp256k1)
    if (!/^[0-9a-fA-F]{130}$/.test(keyToAdd)) {
        setContactError("Invalid public key format. It should be a 130-character hexadecimal string.");
        return;
    }

    const newContact: Contact = {
      id: Date.now(),
      publicKey: keyToAdd,
      nickname: `Contact #${contacts.length + 1}`,
      addedAt: new Date().toISOString()
    };
    const updatedContacts = [...contacts, newContact];
    setContacts(updatedContacts);
    saveContactsToStorage(keys.publicKey, updatedContacts);
    setNewContactKey('');
    setShowAddContact(false);
  };

  const removeContact = (id: number) => {
    if (!keys) return;
    const updatedContacts = contacts.filter(c => c.id !== id);
    setContacts(updatedContacts);
    saveContactsToStorage(keys.publicKey, updatedContacts);
    removeMessagesForContact(keys.publicKey, id);
  };

  const updateContactNickname = (id: number, newNickname: string) => {
    if (!newNickname.trim() || !keys) return;
    const updatedContacts = contacts.map(c => c.id === id ? { ...c, nickname: newNickname.trim() } : c);
    setContacts(updatedContacts);
    saveContactsToStorage(keys.publicKey, updatedContacts);
    setEditingContact(null);
  };
  
  // --- Group Functions ---
  const handleCreateGroup = () => {
    setGroupActionError(null);
    if (!newGroupKeys.trim() || !keys) {
      // Allow creating a group with just the current user
      const finalKeys = [keys.publicKey];
       const newGroup: Group = {
        id: Date.now().toString(),
        name: newGroupName.trim() || `Group ${Date.now().toString().slice(-4)}`,
        memberKeys: finalKeys
      };
      const updatedGroups = [...groups, newGroup];
      setGroups(updatedGroups);
      saveGroupsToStorage(keys.publicKey, updatedGroups);
      setNewGroupName('');
      setNewGroupKeys('');
      setShowCreateGroup(false);
      return;
    }

    const memberKeys = newGroupKeys.split('\n').map(k => k.trim()).filter(Boolean);
    const uniqueKeys = [...new Set(memberKeys)];
    const finalKeys = [...new Set([keys.publicKey, ...uniqueKeys])];

    const newGroup: Group = {
      id: Date.now().toString(),
      name: newGroupName.trim() || `Group ${Date.now().toString().slice(-4)}`,
      memberKeys: finalKeys
    };
    const updatedGroups = [...groups, newGroup];
    setGroups(updatedGroups);
    saveGroupsToStorage(keys.publicKey, updatedGroups);
    setNewGroupName('');
    setNewGroupKeys('');
    setShowCreateGroup(false);
  };

  const handleJoinGroup = () => {
    setGroupActionError(null);
    if (!joinInvitation.trim() || !keys) return;
    try {
        const groupData = JSON.parse(joinInvitation) as Partial<Group>;
        if (!groupData.id || !groupData.name || !groupData.memberKeys || !Array.isArray(groupData.memberKeys)) throw new Error("Invalid invitation data format.");
        if (groups.some(g => g.id === groupData.id)) {
            setGroupActionError("You are already a member of this group."); return;
        }
        const newGroup: Group = { id: groupData.id, name: groupData.name, memberKeys: [...new Set([keys.publicKey, ...groupData.memberKeys])], displayPicture: groupData.displayPicture };
        const updatedGroups = [...groups, newGroup];
        setGroups(updatedGroups);
        saveGroupsToStorage(keys.publicKey, updatedGroups);
        setJoinInvitation('');
        setShowJoinGroup(false);
    } catch (e) { setGroupActionError("Invalid invitation data. Please make sure you copied the correct JSON string."); }
  };
  
  const startChat = (contact: Contact) => navigate(`/chat/${contact.id}`);
  const startGroupChat = (group: Group) => navigate(`/group/${group.id}`);
  const handleDownloadPrivateKey = () => { if (keys) downloadKeyFile(keys); };
  const regenerateKeys = () => { setShowRegenerateWarning(false); onStartOver(); };
  
  if (!keys) return null;

  const tabs = [{ id: 'people', label: 'People', icon: UsersIcon }, { id: 'groups', label: 'Groups', icon: HashIcon }, { id: 'settings', label: 'Settings', icon: SettingsIcon }];

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 font-sans text-white">
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3"><div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center"><ShieldIcon className="w-6 h-6 text-white" /></div><div><h1 className="text-xl font-bold text-white">SecureChat</h1><p className="text-xs text-gray-400">Digitally Signed Messaging</p></div></div>
          <div className="text-right"><p className="text-xs text-gray-400">Your ID</p><code className="text-xs text-gray-300 font-mono">{truncateKey(keys.publicKey, 12, 6)}</code></div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-6 pb-6 w-full">
        <div className="flex space-x-1 bg-white/5 backdrop-blur-md rounded-xl p-1 border border-white/10 mb-6">
          {tabs.map(tab => (<button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-lg transition-all duration-200 ${activeTab === tab.id ? 'bg-white/20 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}><tab.icon className="w-5 h-5" /><span className="font-medium">{tab.label}</span></button>))}
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 min-h-[calc(100vh-250px)]">
          {activeTab === 'people' && <div className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h2 className="text-2xl font-bold text-white">Contacts</h2>
              <div className="flex items-center space-x-2">
                <button onClick={() => navigate('/qr')} className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"><QrCodeIcon className="w-4 h-4" /><span>Scan QR</span></button>
                <button onClick={() => { setShowAddContact(!showAddContact); setContactError(null); }} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"><UserPlusIcon className="w-4 h-4" /><span>Add Manually</span></button>
              </div>
            </div>
            {showAddContact && (
              <div className="bg-gray-800/50 rounded-lg p-4 mb-6 border border-gray-700 animate-fade-in">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-white font-semibold">Add New Contact</h3>
                    <button onClick={() => { setShowAddContact(false); setContactError(null); }} className="p-1 text-gray-400 hover:text-white">
                        <XIcon className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="space-y-3">
                    {contactError && <p className="text-sm text-red-300 bg-red-500/10 px-3 py-2 rounded-md">{contactError}</p>}
                    
                    <textarea 
                        placeholder="Paste public key here..." 
                        value={newContactKey} 
                        onChange={(e) => setNewContactKey(e.target.value)}
                        className="w-full h-24 bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 font-mono text-xs"
                        spellCheck="false"
                    />

                    <div className="flex items-center justify-between gap-4">
                        <p className="text-sm text-gray-400">
                            or{' '}
                            <button onClick={() => contactFileInputRef.current?.click()} className="text-blue-400 hover:underline">
                                upload public key file
                            </button>
                            <input 
                                type="file"
                                ref={contactFileInputRef}
                                onChange={handleContactFileSelected}
                                accept=".txt,text/plain"
                                className="hidden"
                            />
                        </p>
                        <button 
                            onClick={addContact} 
                            disabled={!newContactKey.trim()} 
                            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg transition-colors"
                        >
                            Add Contact
                        </button>
                    </div>
                </div>
              </div>
            )}
            {contacts.length === 0 ? <div className="text-center py-12"><UsersIcon className="w-16 h-16 text-gray-500 mx-auto mb-4" /><p className="text-gray-400 text-lg">No contacts yet</p><p className="text-gray-500 text-sm">Add someone's public key to start a conversation</p></div> : <div className="space-y-3">{contacts.map(contact => (<div key={contact.id} className="bg-gray-800/30 rounded-lg p-4 border border-gray-700/50">
              <div className="flex items-center justify-between">
                <div className="flex-1 mr-4">
                  {editingContact?.id === contact.id ? <input type="text" value={editingContact.nickname} onChange={(e) => setEditingContact({...editingContact, nickname: e.target.value})} onBlur={() => updateContactNickname(contact.id, editingContact.nickname)} onKeyPress={(e) => { if (e.key === 'Enter') updateContactNickname(contact.id, editingContact.nickname); }} autoFocus className="text-white font-medium bg-gray-700/50 rounded px-2 py-1 w-full"/> : <div className="flex items-center space-x-2"><h3 className="text-white font-medium">{contact.nickname}</h3><button onClick={() => setEditingContact({id: contact.id, nickname: contact.nickname})} className="p-1 text-gray-400 hover:text-white"><EditIcon className="w-4 h-4" /></button></div>}
                  <div className="flex items-center space-x-2 mt-1"><code className="text-sm text-gray-400 font-mono break-all">{truncateKey(contact.publicKey)}</code><button onClick={() => handleCopyToClipboard(contact.publicKey, contact.id)} className="p-1 hover:bg-gray-700 rounded transition-colors flex-shrink-0">{copiedItem === contact.id ? <CheckIcon className="w-3 h-3 text-green-400" /> : <CopyIcon className="w-3 h-3 text-gray-400" />}</button></div>
                </div>
                <div className="flex items-center space-x-2"><button onClick={() => startChat(contact)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"><MessageCircleIcon className="w-4 h-4" /><span>Chat</span></button><button onClick={() => removeContact(contact.id)} className="p-2 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"><Trash2Icon className="w-4 h-4" /></button></div>
              </div>
            </div>))}</div>}
          </div>}

          {activeTab === 'groups' && <div className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h2 className="text-2xl font-bold text-white">Groups</h2>
              <div className="flex items-center space-x-2">
                <button onClick={() => {setShowJoinGroup(!showJoinGroup); setShowCreateGroup(false);}} className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"><UsersIcon className="w-4 h-4" /><span>Join</span></button>
                <button onClick={() => {setShowCreateGroup(!showCreateGroup); setShowJoinGroup(false);}} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"><PlusIcon className="w-4 h-4" /><span>Create</span></button>
              </div>
            </div>
            {(showCreateGroup || showJoinGroup) && <div className="bg-gray-800/50 rounded-lg p-4 mb-6 border border-gray-700 space-y-4">
              {showCreateGroup && <>
                <h3 className="text-white font-semibold">Create a New Group</h3>
                <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="w-full bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-2 text-white" placeholder="Group Name"/>
                <textarea value={newGroupKeys} onChange={(e) => setNewGroupKeys(e.target.value)} className="w-full h-24 bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-2 text-white resize-none" placeholder="Paste public keys of members (one per line)..."/>
                {groupActionError && <p className="text-sm text-red-300">{groupActionError}</p>}
                <button onClick={handleCreateGroup} disabled={!newGroupName.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors w-full">Create Group</button>
              </>}
              {showJoinGroup && <>
                <h3 className="text-white font-semibold">Join an Existing Group</h3>
                <textarea value={joinInvitation} onChange={(e) => setJoinInvitation(e.target.value)} className="w-full h-24 bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-2 text-white resize-none" placeholder="Paste group invitation data here..."/>
                {groupActionError && <p className="text-sm text-red-300">{groupActionError}</p>}
                <button onClick={handleJoinGroup} disabled={!joinInvitation.trim()} className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors w-full">Join Group</button>
              </>}
            </div>}
            {groups.length === 0 ? <div className="text-center py-12"><HashIcon className="w-16 h-16 text-gray-500 mx-auto mb-4" /><p className="text-gray-400 text-lg">No groups yet</p><p className="text-gray-500 text-sm">Create or join a group to start a conversation</p></div> : <div className="space-y-3">{groups.map(group => (<button key={group.id} onClick={() => startGroupChat(group)} className="w-full bg-gray-800/30 hover:bg-gray-800/60 rounded-lg p-4 text-left transition-colors border border-gray-700/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4"><GroupDp group={group} sizeClass="w-12 h-12" /><div className="flex-1"><h3 className="font-medium">{group.name}</h3><p className="text-sm text-gray-400">{group.memberKeys.length} members</p></div></div>
                <div className="flex items-center space-x-2"><ShieldCheckIcon className="w-4 h-4 text-green-400" /></div>
              </div>
            </button>))}</div>}
          </div>}
          
          {activeTab === 'settings' && <div className="p-6 space-y-6"><h2 className="text-2xl font-bold text-white">Settings</h2><div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700/50"><h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2"><KeyIcon className="w-5 h-5 text-blue-400" /><span>Your Cryptographic Identity</span></h3><div className="mb-4"><label className="block text-sm font-medium text-gray-300 mb-2">Public Key</label><div className="flex items-center space-x-3"><code className="flex-1 bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-300 font-mono break-all">{keys.publicKey}</code><button onClick={() => handleCopyToClipboard(keys.publicKey, 'userPublic')} className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">{copiedItem === 'userPublic' ? <CheckIcon className="w-4 h-4 text-white" /> : <CopyIcon className="w-4 h-4 text-white" />}</button></div></div><div className="mb-4"><label className="block text-sm font-medium text-gray-300 mb-2">Private Key</label><div className="flex items-center space-x-3"><code className="flex-1 bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-300 font-mono break-all">{showPrivateKey ? keys.privateKey : '•'.repeat(64)}</code><button onClick={() => setShowPrivateKey(!showPrivateKey)} className="p-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors">{showPrivateKey ? <EyeOffIcon className="w-4 h-4 text-white" /> : <EyeIcon className="w-4 h-4 text-white" />}</button></div></div><div className="flex flex-wrap gap-3"><button onClick={handleDownloadPrivateKey} className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"><DownloadIcon className="w-4 h-4" /><span>Backup Keys</span></button><button onClick={onLogout} className="flex items-center space-x-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors"><LogOutIcon className="w-4 h-4" /><span>Logout</span></button><button onClick={() => setShowRegenerateWarning(true)} className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"><RefreshCwIcon className="w-4 h-4" /><span>Regenerate & Wipe</span></button></div></div><div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4"><div className="flex items-start space-x-3"><ShieldIcon className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" /><div className="text-sm text-blue-200"><p className="font-semibold mb-1">Privacy First</p><p>All cryptographic operations happen locally in your browser. We never see your messages, keys, or any other sensitive data.</p></div></div></div></div>}
        </div>
      </main>

      {showRegenerateWarning && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"><div className="bg-slate-800 rounded-2xl p-6 max-w-md w-full border border-red-500/30 shadow-2xl"><div className="flex items-center space-x-3 mb-4"><AlertTriangleIcon className="w-6 h-6 text-red-400" /><h3 className="text-lg font-bold text-white">Regenerate Keys?</h3></div><p className="text-gray-300 mb-6">This will permanently delete your current keys and all saved contacts. You'll lose access to existing conversations. This action cannot be undone.</p><div className="flex space-x-3"><button onClick={() => setShowRegenerateWarning(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors">Cancel</button><button onClick={regenerateKeys} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors">Regenerate & Wipe</button></div></div></div>}
    </div>
  );
};

export default ChatHomePage;
