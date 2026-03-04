import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const QUICK_REPLIES = [
  'Help me prioritize',
  'I have a schedule conflict',
  'What should I bid?',
  'Tell me about a course',
];

export function ChatWidget() {
  const { isChatOpen, toggleChat, chatMessages, addChatMessage, student } = useApp();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isChatOpen && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatOpen]);

  useEffect(() => {
    if (isChatOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isChatOpen]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    addChatMessage({ id: `u-${Date.now()}`, role: 'user', text: text.trim() });
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        className={`chat-fab ${isChatOpen ? 'open' : ''}`}
        onClick={toggleChat}
        title="AI Counselor"
      >
        <span className="chat-fab-icon">{isChatOpen ? '✕' : '✦'}</span>
        {!isChatOpen && <span className="chat-fab-label">AI Counselor</span>}
      </button>

      {/* Chat panel */}
      <div className={`chat-panel ${isChatOpen ? 'open' : ''}`}>
        <div className="chat-panel-header">
          <div className="chat-header-left">
            <div className="chat-ai-avatar">✦</div>
            <div>
              <div className="chat-header-title">AI Counselor</div>
              <div className="chat-header-sub">Here to help {student.name.split(' ')[0]}</div>
            </div>
          </div>
          <button className="chat-close" onClick={toggleChat}>✕</button>
        </div>

        <div className="chat-messages">
          {chatMessages.map((msg) => (
            <div key={msg.id} className={`chat-bubble ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="bubble-avatar">✦</div>
              )}
              <div className="bubble-text">{msg.text}</div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Quick replies */}
        <div className="quick-replies">
          {QUICK_REPLIES.map((qr) => (
            <button key={qr} className="quick-reply-btn" onClick={() => sendMessage(qr)}>
              {qr}
            </button>
          ))}
        </div>

        <div className="chat-input-row">
          <input
            ref={inputRef}
            className="chat-input"
            type="text"
            placeholder="Ask anything..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="chat-send-btn"
            onClick={() => sendMessage(input)}
            disabled={!input.trim()}
          >
            ↑
          </button>
        </div>
      </div>

      {/* Backdrop */}
      {isChatOpen && <div className="chat-backdrop" onClick={toggleChat} />}
    </>
  );
}
