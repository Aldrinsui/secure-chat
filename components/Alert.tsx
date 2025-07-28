
import React from 'react';
import { AlertTriangleIcon } from './Icons';
import { AlertType } from '../types';

interface AlertProps {
    type: AlertType;
    title: string;
    children: React.ReactNode;
}

const typeStyles = {
    [AlertType.WARNING]: {
        container: 'bg-yellow-500/10 border-yellow-500/30',
        icon: 'text-yellow-400',
        text: 'text-yellow-200',
    },
    [AlertType.CRITICAL]: {
        container: 'bg-red-500/10 border-red-500/30',
        icon: 'text-red-400',
        text: 'text-red-200',
    }
};

const Alert: React.FC<AlertProps> = ({ type, title, children }) => {
    const styles = typeStyles[type];

    return (
        <div className={`rounded-lg p-4 ${styles.container}`}>
            <div className="flex items-start space-x-3">
                <AlertTriangleIcon className={`w-5 h-5 ${styles.icon} mt-0.5 flex-shrink-0`} />
                <div className={`text-sm ${styles.text}`}>
                    <p className="font-semibold mb-1">{title}</p>
                    <div className="text-left">{children}</div>
                </div>
            </div>
        </div>
    );
};

export default Alert;
