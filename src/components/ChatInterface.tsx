import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, User, Sparkles, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/src/lib/utils';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: number;
}

const SongPlayer = ({ songName }: { songName: string }) => {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);

  useEffect(() => {
    fetch(`/api/search-song?q=${encodeURIComponent(songName)}`)
      .then(res => res.json())
      .then(data => setVideoId(data.videoId || null))
      .catch(err => console.error(err));
  }, [songName]);

  if (!videoId) return <div className="text-xs text-white/50">Searching for {songName}...</div>;

  if (!showPlayer) {
    return (
      <div className="mt-4 rounded-xl bg-black/20 p-4 border border-white/10 flex items-center justify-between">
        <p className="text-sm truncate">🎵 {songName}</p>
        <button 
          onClick={() => setShowPlayer(true)}
          className="bg-aura-blue text-white text-xs px-4 py-2 rounded-lg hover:bg-aura-blue/80 transition-colors"
        >
          Play
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl overflow-hidden bg-black/20 p-2 space-y-2">
      <iframe 
        width="100%" 
        height="200" 
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&origin=${window.location.origin}`}
        frameBorder="0" 
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" 
        allowFullScreen
        className="rounded-lg"
      ></iframe>
      <a 
        href={`https://www.youtube.com/watch?v=${videoId}`} 
        target="_blank" 
        rel="noopener noreferrer"
        className="block text-center text-xs text-aura-blue hover:text-aura-blue/80 py-1"
      >
        Video restricted? Click to listen on YouTube
      </a>
    </div>
  );
};

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const processChat = async (messagesToSend: Message[]) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messagesToSend }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403 || response.status === 400) {
          throw new Error("PERMISSION_DENIED: Please check your Gemini API key in the Settings > Secrets panel.");
        }
        throw new Error(data.error || 'Failed to connect to AURA');
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: data.text,
          isUser: false,
          timestamp: data.timestamp,
        },
      ]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: input,
      isUser: true,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    await processChat([...messages, userMessage]);
  };

  const handleRegenerate = async () => {
    if (isLoading) return;
    const messagesWithoutLastAssistant = messages.slice(0, -1);
    setMessages(messagesWithoutLastAssistant);
    await processChat(messagesWithoutLastAssistant);
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto px-4 py-8">
      <header className="flex flex-col items-center mb-10">
        <div className="w-12 h-12 rounded-2xl bg-aura-blue flex items-center justify-center shadow-2xl shadow-aura-blue/40 mb-4">
          <Sparkles className="text-white w-7 h-7" />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white mb-1">AURA Chat</h1>
        <p className="text-[10px] text-white/40 uppercase tracking-[0.3em] font-medium">Neural Companion v3.1</p>
      </header>

      <div className="flex-1 overflow-hidden relative flex flex-col">
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-2 py-4 space-y-8 scroll-smooth chat-container"
        >
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-30">
              <div className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center">
                <Bot className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <p className="text-xl font-medium font-display uppercase tracking-widest">Aura Online</p>
                <p className="text-sm max-w-xs mx-auto">Ask me anything, or just chat. I mirror your vibe.</p>
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              const playSongMatch = msg.text.match(/\[PLAY_SONG: (.*?)\]/);
              const songName = playSongMatch ? playSongMatch[1] : null;
              const cleanText = msg.text.replace(/\[PLAY_SONG: (.*?)\]/, '');

              return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={cn(
                  "flex flex-col max-w-[85%] sm:max-w-[75%]",
                  msg.isUser ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                <div className={cn(
                  "px-5 py-4 text-sm leading-relaxed shadow-xl",
                  msg.isUser 
                    ? "bg-aura-blue text-white rounded-2xl rounded-br-none" 
                    : "bg-aura-dark border border-white/5 text-white/90 rounded-2xl rounded-bl-none prose prose-invert prose-sm"
                )}>
                  {msg.isUser ? (
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  ) : (
                    <div className="chat-markdown">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ node, ...props }) => <div {...props} className="mb-2" />,
                          table: ({ node, ...props }) => (
                            <div className="overflow-x-auto my-4 w-full">
                              <table {...props} className="w-full border-collapse" />
                            </div>
                          ),
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            return !inline ? (
                              <SyntaxHighlighter
                                style={vscDarkPlus}
                                language={match ? match[1] : ''}
                                PreTag="div"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            ) : (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            );
                          }
                        }}
                      >
                        {cleanText}
                      </ReactMarkdown>
                      {songName && <SongPlayer songName={songName} />}
                    </div>
                  )}
                </div>
                <span className="block mt-2 text-[9px] opacity-30 uppercase tracking-widest font-mono">
                  {msg.isUser ? 'You' : 'AURA'} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {!msg.isUser && messages[messages.length - 1].id === msg.id && !isLoading && (
                    <button 
                      onClick={handleRegenerate} 
                      className="ml-2 hover:text-aura-blue transition-colors"
                      title="Regenerate response"
                    >
                      <RefreshCw size={10} />
                    </button>
                  )}
                </span>
              </motion.div>
              );
            })}
          </AnimatePresence>

          {isLoading && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="flex gap-4 mr-auto"
            >
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <Bot size={16} />
              </div>
              <div className="bg-white/5 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                <div className="flex gap-1">
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }} 
                    transition={{ repeat: Infinity, duration: 1 }} 
                    className="w-1.5 h-1.5 rounded-full bg-white/30" 
                  />
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }} 
                    transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} 
                    className="w-1.5 h-1.5 rounded-full bg-white/30" 
                  />
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }} 
                    transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} 
                    className="w-1.5 h-1.5 rounded-full bg-white/30" 
                  />
                </div>
              </div>
            </motion.div>
          )}

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="flex items-start gap-2 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs"
            >
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </motion.div>
          )}
        </div>

        <div className="mt-auto px-2">
          <div className="relative flex items-center gap-3">
            <div className="relative flex-1 group">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Talk to AURA..."
                className="w-full bg-aura-dark/50 border border-white/5 rounded-2xl px-6 py-5 text-sm focus:outline-none focus:ring-2 focus:ring-aura-blue/20 focus:border-aura-blue/40 transition-all placeholder:text-white/10 group-hover:border-white/10"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500",
                isLoading || !input.trim() 
                  ? "bg-white/5 text-white/10 cursor-not-allowed" 
                  : "bg-aura-blue text-white shadow-[0_0_20px_rgba(41,121,255,0.3)] hover:shadow-[0_0_30px_rgba(41,121,255,0.5)] hover:scale-105 active:scale-95"
              )}
            >
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
          </div>
        </div>
      </div>

      <footer className="text-center">
        <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-mono">
          Powered by Gemini AI • Distinctive Neural Interface
        </p>
      </footer>
    </div>
  );
}
