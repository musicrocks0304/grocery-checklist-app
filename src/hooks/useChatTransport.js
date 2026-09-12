import { useRef } from 'react';
import { apiFetch } from '../config/api';

export default function useChatTransport({ inputMessage, setInputMessage, setMessages, setIsLoading, adapter }) {
  const lastPayloadRef = useRef(null);

  const removeTypingIndicator = typingId => {
    setMessages(prev => prev.filter(msg => msg.id !== typingId));
  };

  const sendMessage = async overrideText => {
    const rawText = typeof overrideText === 'string' ? overrideText : inputMessage;
    if (!rawText.trim()) return;
    const messageToSend = rawText.trim();
    const userMessage = {
      id: Date.now(), type: 'user', content: messageToSend,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    const typingMessage = adapter.createTypingMessage();
    const typingId = typingMessage.id;
    setMessages(prev => [...prev, typingMessage]);
    adapter.onSend(messageToSend);

    try {
      const payload = adapter.buildPayload(messageToSend);
      lastPayloadRef.current = payload;
      adapter.beforeRequest();
      const response = await apiFetch(adapter.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload), mode: 'cors', timeout: 120000, retries: 0,
      });
      await adapter.handleResponse(response, { typingId, removeTypingIndicator });
    } catch (error) {
      adapter.handleError(error, { typingId, removeTypingIndicator });
    } finally {
      setIsLoading(false);
    }
  };

  const retryLastMessage = () => {
    if (!lastPayloadRef.current) return;
    sendMessage(adapter.retryText(lastPayloadRef.current));
  };

  return { sendMessage, retryLastMessage };
}
