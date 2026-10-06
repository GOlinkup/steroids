
import React from 'react';
import FeedbackForm from '@/components/FeedbackForm';

const AppHeader: React.FC = () => {
    return (
        <header className="w-full flex justify-between items-center mb-8 py-4 px-2">
            <div className="flex-1">
                {/* Placeholder for left-side content if needed */}
            </div>

            <div className="flex-1 text-center">
                <h1 className="text-4xl font-extrabold tracking-tight mb-2 bg-clip-text text-transparent bg-gradient-to-r from-brush-blue via-brush-purple to-brush-red animate-fade-in">
                    Gesture Canvas
                </h1>
                <p className="text-sm text-muted-foreground font-medium opacity-80 animate-fade-in animation-delay-200">
                    Touchless Creativity
                </p>
            </div>

            <div className="flex-1 flex justify-end">
                <FeedbackForm />
            </div>
        </header>
    );
};

export default AppHeader;
