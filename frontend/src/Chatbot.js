import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import './Chatbot.css';

const API_URL = 'https://warrantystoragebackend.onrender.com/warranty/setup/chatbot';

// Simple markdown parser for bold, lists, and code
function parseMarkdown(text) {
    if (!text) return '';
    // Escape HTML
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Unordered lists
    html = html.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    // Numbered lists
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
    // Line breaks
    html = html.replace(/\n/g, '<br/>');
    // Clean up list breaks
    html = html.replace(/<br\/><li>/g, '<li>');
    html = html.replace(/<\/li><br\/>/g, '</li>');
    return html;
}

function Chatbot() {
    const location = useLocation();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [hasGreeted, setHasGreeted] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Get auth state from localStorage
    const getAuthState = () => {
        const email = localStorage.getItem('Data');
        const token = localStorage.getItem('jwt_token');
        const storeName = localStorage.getItem('SN');
        const storeLocation = localStorage.getItem('SA');
        const isMerchant = !!(storeName && storeLocation);

        if (email && token) {
            return { email, isMerchant, storeName, storeLocation, loggedIn: true };
        }
        return { email: null, isMerchant: false, storeName: null, storeLocation: null, loggedIn: false };
    };

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Removed effect-based Text-to-Action listener, moved to sendMessage explicitly

    // Focus input when chat opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current.focus(), 100);
        }
    }, [isOpen]);

    // Check if user changed when opening chat or navigating
    const [lastEmail, setLastEmail] = useState(() => localStorage.getItem('Data'));
    useEffect(() => {
        const currentEmail = localStorage.getItem('Data');
        if (currentEmail !== lastEmail) {
            setLastEmail(currentEmail);
            setMessages([]);
            setHasGreeted(false); // Force new greeting
        }
    }, [isOpen, lastEmail, location.pathname]);

    // Generate greeting when first opened
    useEffect(() => {
        if (isOpen && !hasGreeted) {
            setHasGreeted(true);
            const auth = getAuthState();

            if (auth.loggedIn && auth.isMerchant) {
                setMessages([{
                    role: 'bot',
                    content: `Welcome back! 👋 I'm your **Warranty Storage Assistant**.\n\nYou're signed in as a merchant for **${auth.storeName}**. I can help you with:\n- Checking pending warranty verifications\n- Summarizing your store's warranty stats\n- Navigating the platform\n\nWhat would you like to know?`
                }]);
            } else if (auth.loggedIn) {
                setMessages([{
                    role: 'bot',
                    content: `Welcome back! 👋 I'm your **Warranty Storage Assistant**.\n\nI can see your warranty records. Ask me things like:\n- "How many warranties do I have?"\n- "Which warranties are pending?"\n- "When does my warranty expire?"\n\nHow can I help you today?`
                }]);
            } else {
                setMessages([{
                    role: 'bot',
                    content: `Hello! 👋 I'm the **Warranty Storage Assistant**.\n\nI can help you learn about the platform, how to register, upload warranties, and more.\n\n**Log in** to get personalized help with your warranty records!\n\nWhat would you like to know?`
                }]);
            }
        }
    }, [isOpen, hasGreeted]);

    // Get quick reply chips based on auth state
    const getChips = () => {
        const auth = getAuthState();
        if (auth.loggedIn && auth.isMerchant) {
            return [
                'How many pending warranties?',
                'Show warranty stats',
                'How do I verify a warranty?'
            ];
        } else if (auth.loggedIn) {
            return [
                'Show my warranties',
                'Any expiring soon?',
                'How do I add a warranty?'
            ];
        }
        return [
            'How does this platform work?',
            'How do I register?',
            'What are the features?'
        ];
    };

    const sendMessage = async (messageText) => {
        const text = messageText || input.trim();
        if (!text || isStreaming) return;

        const auth = getAuthState();

        // Add user message
        const userMsg = { role: 'user', content: text };
        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setInput('');
        setIsStreaming(true);

        // Build history for context (last 10 messages)
        const history = updatedMessages
            .slice(-10)
            .map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content }));

        // Add placeholder for bot response
        setMessages(prev => [...prev, { role: 'bot', content: '' }]);

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    email: auth.email,
                    isMerchant: auth.isMerchant,
                    storeName: auth.storeName,
                    storeLocation: auth.storeLocation,
                    history: history.slice(0, -1) // Exclude the last user message since it's sent as 'message'
                })
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let botContent = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed === 'data: [DONE]') continue;
                    if (trimmed.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(trimmed.slice(6));
                            if (json.error) {
                                botContent = json.error;
                            } else if (json.content) {
                                botContent += json.content;
                            }
                        } catch (e) {
                            // Skip malformed JSON
                        }
                    }
                }
                
                // Update the last bot message once per chunk
                if (botContent) {
                    // eslint-disable-next-line no-loop-func
                    setMessages(prev => {
                        const updated = [...prev];
                        updated[updated.length - 1] = { role: 'bot', content: botContent };
                        return updated;
                    });
                }
            }

            // If nothing was received
            if (!botContent) {
                setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: 'bot', content: 'Sorry, I couldn\'t generate a response. Please try again.' };
                    return updated;
                });
            }
        } catch (error) {
            console.error('Chatbot error:', error);
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                    role: 'bot',
                    content: 'Sorry, I\'m having trouble connecting right now. Please make sure the server is running and try again.'
                };
                return updated;
            });
        }

        setIsStreaming(false);
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleChipClick = (chipText) => {
        sendMessage(chipText);
    };

    const toggleChat = () => {
        setIsOpen(prev => !prev);
    };

    const chips = getChips();
    const showChips = messages.length <= 1 && !isStreaming;

    return (
        <>
            {/* Chat Window */}
            {isOpen && (
                <div className="chatbot-window">
                    {/* Header */}
                    <div className="chatbot-header">
                        <div className="chatbot-avatar">🤖</div>
                        <div className="chatbot-header-info">
                            <p className="chatbot-header-title">Warranty Assistant</p>
                            <p className="chatbot-header-status">
                                {isStreaming ? 'Typing...' : 'Online • Powered by AI'}
                            </p>
                        </div>
                        <button className="chatbot-close-btn" onClick={toggleChat} title="Close chat">
                            ✕
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="chatbot-messages">
                        {messages.map((msg, i) => (
                            <div key={i} className={`chatbot-msg ${msg.role === 'user' ? 'user' : 'bot'}`}>
                                {msg.role === 'bot' ? (
                                    msg.content ? (
                                        <span dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content) }} />
                                    ) : (
                                        <div className="chatbot-typing">
                                            <span></span><span></span><span></span>
                                        </div>
                                    )
                                ) : (
                                    msg.content
                                )}
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick Reply Chips */}
                    {showChips && (
                        <div className="chatbot-chips">
                            {chips.map((chip, i) => (
                                <button
                                    key={i}
                                    className="chatbot-chip"
                                    onClick={() => handleChipClick(chip)}
                                    disabled={isStreaming}
                                >
                                    {chip}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Input */}
                    <div className="chatbot-input-area">
                        <input
                            ref={inputRef}
                            type="text"
                            className="chatbot-input"
                            placeholder="Ask me anything..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyPress}
                            disabled={isStreaming}
                        />
                        <button
                            className="chatbot-send-btn"
                            onClick={() => sendMessage()}
                            disabled={isStreaming || !input.trim()}
                            title="Send message"
                        >
                            ➤
                        </button>
                    </div>
                </div>
            )}

            {/* Floating Toggle Button */}
            <button
                className={`chatbot-toggle-btn ${isOpen ? 'open' : ''}`}
                onClick={toggleChat}
                title={isOpen ? 'Close chat' : 'Chat with AI Assistant'}
            >
                {isOpen ? '✕' : '💬'}
            </button>
        </>
    );
}

export default Chatbot;
