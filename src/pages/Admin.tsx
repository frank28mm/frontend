import React from 'react';
import { useNavigate } from 'react-router-dom';

import { Header } from '@/components/ui/Header';

const Admin: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full max-w-md mx-auto bg-neu-bg flex flex-col font-display text-[#2D3748]">
      <Header
        title="管理后台"
        onBack={() => navigate(-1)}
        className="bg-neu-bg sticky top-0 z-10"
      />

      <main className="p-4 space-y-4">
        <div className="p-4 rounded-xl bg-neu-bg shadow-neu-flat border border-white/40">
          <div className="text-sm text-neu-text">
            该页面为占位。后续可在此添加审核、兑换码、配额等管理功能。
          </div>
        </div>
      </main>
    </div>
  );
};

export default Admin;
