import React from 'react';
import { useNavigate } from 'react-router-dom';

const UnloggedInterceptor: React.FC = () => {
    const navigate = useNavigate();

    // Use Login style but as a modal/card
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm"></div>
            <div className="relative w-full max-w-sm bg-[#EFEEEE] rounded-[32px] shadow-[20px_20px_60px_#bebebe,-20px_-20px_60px_#ffffff] p-8 flex flex-col items-center">
                <button
                    onClick={() => navigate(-1)}
                    className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[#EFEEEE] shadow-[6px_6px_12px_#C5C9D2,-6px_-6px_12px_#FFFFFF] flex items-center justify-center text-gray-400 active:shadow-[inset_4px_4px_8px_#C5C9D2,inset_-4px_-4px_8px_#FFFFFF]"
                >
                    <span className="material-symbols-outlined">close</span>
                </button>

                <h2 className="text-xl font-bold text-[#324054] mb-2 mt-4">Login Required</h2>
                <p className="text-gray-500 text-sm text-center mb-8">Please login to access this feature.</p>

                <button
                    onClick={() => navigate('/login')}
                    className="flex w-full items-center justify-center rounded-2xl bg-[#EFEEEE] text-[#324054] h-12 text-sm font-bold tracking-wide shadow-[8px_8px_16px_#C5C9D2,-8px_-8px_16px_#FFFFFF] hover:shadow-[10px_10px_20px_#C5C9D2,-10px_-10px_20px_#FFFFFF] active:shadow-[inset_4px_4px_8px_#C5C9D2,inset_-4px_-4px_8px_#FFFFFF] active:scale-[0.98] transition-all uppercase border border-white/60 mb-4"
                >
                    Go to Login
                </button>
            </div>
        </div>
    );
};

export default UnloggedInterceptor;
