/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';

export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'ai', content: string}[]>([
    { role: 'ai', content: 'Halo! Saya WMS AI. Ada yang bisa saya bantu analisa hari ini?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg = input;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');
    setIsTyping(true);

    try {
      // Get context from local storage if available (mocking global state)
      // In a real app, you'd use a context provider or Zustand to pass the current UI state
      const res = await api.post('/chat', { 
        message: userMsg,
        context: {} // Passing empty context for now, can be expanded to read session storage
      });
      
      setMessages(prev => [...prev, { role: 'ai', content: res.data.reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', content: 'Maaf, terjadi kesalahan pada server AI.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="absolute bottom-16 right-0 w-80 h-96 bg-slate-900/95 border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.15)] backdrop-blur-xl rounded-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/10 bg-gradient-to-r from-cyan-950/50 to-slate-900 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-400" />
                <span className="font-semibold text-white">WMS AI Assistant</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-cyan-600 text-white rounded-br-none' : 'bg-slate-800 border border-white/5 text-slate-200 rounded-bl-none'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 border border-white/5 p-3 rounded-2xl rounded-bl-none flex gap-1 items-center">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            
            {/* Input */}
            <div className="p-3 border-t border-white/10 bg-slate-950/50">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Tanya sesuatu..."
                  className="flex-1 bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50"
                />
                <button 
                  onClick={handleSend}
                  className="bg-cyan-600 text-white p-2 rounded-xl hover:bg-cyan-500 transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full shadow-[0_0_20px_rgba(6,182,212,0.4)] flex items-center justify-center text-white hover:scale-110 transition-transform relative"
      >
        <Bot className="w-6 h-6" />
        <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
        <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full"></span>
      </button>
    </div>
  );
}

