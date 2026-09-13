import { ENDPOINTS } from '../../config/api';
import { getWeekDates } from '../../utils/weekDates';

const PROPOSE_WEBHOOK_URL = ENDPOINTS.mealCreatorPropose;

export function createCreatorChatAdapter({ sessionId, setMessages, setProposals, addDebugLog }) {
  return {
    endpoint: PROPOSE_WEBHOOK_URL,
    createTypingMessage() {
      const typingId = Date.now() + Math.random();
      return { id: typingId, type: 'bot', content: '...', isTyping: true, timestamp: '' };
    },
    onSend(messageToSend) {
      addDebugLog('Sending proposal request...', messageToSend);
    },
    buildPayload(messageToSend) {
      const weekData = getWeekDates();
      const payload = {
        message: messageToSend,
        sessionId: sessionId,
        context: 'meal_creation',
        weekDateRange: weekData.displayRange,
        timestamp: new Date().toISOString()
      };
      return payload;
    },
    beforeRequest() {},
    async handleResponse(response, { typingId, removeTypingIndicator }) {
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

      const responseText = await response.text();
      addDebugLog('Raw propose response:', responseText);

      let data = JSON.parse(responseText);

      // Handle array wrapper from n8n
      if (Array.isArray(data) && data.length > 0) data = data[0];

      // Unwrap n8n AI Agent output
      let output = data;
      if (data.output && typeof data.output === 'object') output = data.output;
      else if (data.output && typeof data.output === 'string') {
        try { output = JSON.parse(data.output); } catch { output = data; }
      }

      addDebugLog('Parsed output:', output);

      // Remove typing indicator
      removeTypingIndicator(typingId);

      if (output.responseType === 'recipe_proposals' && output.proposals) {
        setProposals(output.proposals);
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: 'bot',
          content: output.message || "Here are some ideas! Pick one and I'll build the full recipe.",
          proposals: output.proposals,
          timestamp: new Date().toLocaleTimeString()
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: Date.now(),
          type: 'bot',
          content: output.message || output.text || JSON.stringify(output),
          timestamp: new Date().toLocaleTimeString()
        }]);
      }
    },
    handleError(error, { typingId, removeTypingIndicator }) {
      addDebugLog('Error in propose:', error.message);
      removeTypingIndicator(typingId);
      setMessages(prev => [...prev, {
        id: Date.now(),
        type: 'bot',
        content: error.name === 'AbortError'
          ? "That took too long — please try again with a simpler description."
          : "Something went wrong generating proposals. Please try again!",
        isRetryable: true,
        timestamp: new Date().toLocaleTimeString()
      }]);
    },
    retryText(payload) {
      return payload.message || payload.description || '';
    },
  };
}
