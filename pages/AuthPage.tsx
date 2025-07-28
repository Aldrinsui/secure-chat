import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldIcon, KeyIcon, LogInIcon, ArrowRightIcon } from '../components/Icons';
import Layout from '../components/Layout';
import Alert from '../components/Alert';
import { AlertType } from '../types';

const AuthPage: React.FC = () => {
    const navigate = useNavigate();

    const ActionCard = ({ icon, title, description, buttonText, onClick }: {
        icon: React.ReactNode;
        title: string;
        description: string;
        buttonText: string;
        onClick: () => void;
    }) => (
        <div 
            onClick={onClick}
            className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 shadow-2xl flex flex-col transition-all duration-300 hover:bg-white/10 hover:border-white/20 hover:scale-105 cursor-pointer"
        >
            {icon}
            <h2 className="text-2xl font-bold mb-2 text-white">{title}</h2>
            <p className="text-gray-300 mb-6 flex-grow">{description}</p>
            <div className="mt-auto w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center space-x-3">
                <span>{buttonText}</span>
                <ArrowRightIcon className="w-5 h-5" />
            </div>
        </div>
    );

    return (
        <Layout>
            <div className="max-w-4xl w-full text-center animate-fade-in">
                <div className="mx-auto w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-4 shadow-lg">
                    <ShieldIcon className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Welcome to SecureChat</h1>
                <p className="text-gray-300 mb-12 leading-relaxed">
                    A decentralized, end-to-end encrypted messaging application where you are in control.
                </p>

                <div className="grid md:grid-cols-2 gap-8 text-left">
                    <ActionCard
                        icon={<KeyIcon className="w-8 h-8 text-blue-400 mb-4" />}
                        title="New User"
                        description="Create a unique, secure cryptographic identity. No email or phone number required."
                        buttonText="Create New Identity"
                        onClick={() => navigate('/register')}
                    />
                    <ActionCard
                        icon={<LogInIcon className="w-8 h-8 text-green-400 mb-4" />}
                        title="Existing User"
                        description="Access your account by importing your previously saved and securely stored key file."
                        buttonText="Login With Key"
                        onClick={() => navigate('/login')}
                    />
                </div>

                <div className="mt-12 max-w-2xl mx-auto">
                    <Alert type={AlertType.WARNING} title="You Are In Control">
                        We don't store your keys on any server. If you generate new keys, you MUST back them up. If you lose your key file, access to your identity cannot be recovered.
                    </Alert>
                </div>
            </div>
        </Layout>
    );
};

export default AuthPage;
