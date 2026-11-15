import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/ui/Header';
import { apiClient } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

interface FeedbackMessage {
  id: string;
  sender: 'user' | 'admin';
  content: string;
  created_at: string;
}

const MineHelpFeedback: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    try {
      const res = await apiClient.get('/feedback', { params: { limit: 50 } });
      if (res.data?.messages) {
        setMessages(prev => {
          const currentJson = JSON.stringify(prev);
          const newJson = JSON.stringify(res.data.messages);
          return currentJson !== newJson ? res.data.messages : prev;
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchMessages(); // eslint-disable-line react-hooks/set-state-in-effect
    const timer = setInterval(fetchMessages, 5000); // Poll for replies
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const content = input.trim();
    setInput('');
    
    // Optimistic add
    const tempMsg: FeedbackMessage = {
      id: Date.now().toString(),
      sender: 'user',
      content: content,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      await apiClient.post('/feedback', { content });
      fetchMessages(); 
    } catch {
      showToast('发送失败', 'error');
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
      setInput(content);
    }
  };

  return (
    <div className="min-h-screen w-full max-w-md mx-auto bg-neu-bg flex flex-col font-display text-[#2D3748]">
      <Header title="帮助与反馈" onBack={() => navigate(-1)} className="bg-neu-bg sticky top-0 z-10" />
      
      <div className="flex-1 overflow-y-auto p-4 pb-20 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-neu-text-secondary text-sm mt-10">
            有什么问题或建议？发消息告诉我们吧。
          </div>
        )}
        
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex w-full",
              msg.sender === 'user' ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed border shadow-sm break-words",
                msg.sender === 'user'
                  ? "bg-black text-white border-black rounded-br-none"
                  : "bg-white text-neu-text border-gray-200 rounded-bl-none"
              )}
            >
              {msg.content}
              <div className={cn("text-[10px] mt-1 opacity-70 text-right", msg.sender === 'user' ? "text-white" : "text-gray-400")}>
                {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </div>
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 w-full max-w-md mx-auto p-4 bg-neu-bg border-t border-white/50 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入您的问题..."
            className="flex-1 px-4 py-3 rounded-xl bg-white shadow-neu-inner border-none focus:ring-1 focus:ring-primary/50 text-neu-text outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center shadow-md active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
          >
            <span className="material-symbols-outlined text-xl font-bold">arrow_upward</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MineHelpFeedback;
