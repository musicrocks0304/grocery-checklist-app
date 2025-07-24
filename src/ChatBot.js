
import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, ChefHat, Wifi, ChevronDown, ChevronUp, ArrowLeft, Sparkles } from 'lucide-react';

const ChatBot = ({ onBack }) => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      content: "Hi! I'm your meal planning assistant. I can help you create delicious meal ideas based on your grocery list and preferences. What kind of meals are you looking to plan this week?",
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const messagesEndRef = useRef(null);

  // Your n8n webhook URL for the chatbot
  const CHATBOT_WEBHOOK_URL = 'https://n8n-grocery.needexcelexpert.com/webhook/your-chatbot-webhook-id/meal_planning';

  // Debug logging function
  const addDebugLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, { timestamp, message, data }]);
    console.log(`[${timestamp}] ${message}`, data || '');
  };

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Simulate typing indicator
  const showTypingIndicator = () => {
    const typingMessage = {
      id: Date.now(),
      type: 'bot',
      content: '...',
      isTyping: true,
      timestamp: new Date().toLocaleTimeString()
    };
    setMessages(prev => [...prev, typingMessage]);
    return typingMessage.id;
  };

  // Remove typing indicator
  const removeTypingIndicator = (typingId) => {
    setMessages(prev => prev.filter(msg => msg.id !== typingId));
  };

  // Send message to n8n webhook
  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputMessage.trim(),
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, userMessage]);
    const messageToSend = inputMessage.trim();
    setInputMessage('');
    setIsLoading(true);

    const typingId = showTypingIndicator();

    addDebugLog('Sending message to n8n chatbot webhook...', messageToSend);

    try {
      // Test connectivity first
      addDebugLog('Testing connectivity...');
      const testResponse = await fetch('https://api.github.com/zen', {
        method: 'GET',
        mode: 'cors'
      });
      
      if (testResponse.ok) {
        addDebugLog('✅ External connectivity working');
      }

      addDebugLog('Webhook URL:', CHATBOT_WEBHOOK_URL);
      
      const requestBody = {
        message: messageToSend,
        timestamp: new Date().toISOString(),
        context: 'meal_planning'
      };

      addDebugLog('Request payload:', requestBody);

      // For demo purposes, simulate API call with timeout
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));

      // Simulate different responses based on message content
      let botResponse = "";
      const lowerMessage = messageToSend.toLowerCase();
      
      if (lowerMessage.includes('breakfast')) {
        botResponse = "🍳 Great choice for breakfast planning! Based on your grocery list, I see you have almond milk and could add BelVita breakfast biscuits. Here are some ideas:\n\n• **Overnight Oats**: Mix almond milk with oats, add berries and nuts\n• **Smoothie Bowl**: Blend almond milk with frozen fruits, top with granola\n• **Avocado Toast**: If you get bread and avocados, perfect protein-rich start\n\nWould you like specific recipes for any of these?";
      } else if (lowerMessage.includes('lunch')) {
        botResponse = "🥗 Perfect! I notice you have grapes on your list. Here are some fresh lunch ideas:\n\n• **Chicken Grape Salad**: Grilled chicken with grapes, walnuts, and greens\n• **Pastry Pups Combo**: Quick option with a side salad using your grapes\n• **Mediterranean Wrap**: If you add some deli meat and cheese\n\nWhat type of lunch vibe are you going for - quick and easy or more elaborate?";
      } else if (lowerMessage.includes('dinner') || lowerMessage.includes('meal')) {
        botResponse = "🍽️ Excellent! Let me suggest some dinner ideas that work with your grocery preferences:\n\n• **Sheet Pan Dinner**: Protein + roasted vegetables (great use of any produce you pick up)\n• **Stir-fry Night**: Quick cooking with whatever proteins and veggies you have\n• **Comfort Food**: Something hearty using pantry staples like your peanut butter for sauces\n\nAny dietary restrictions or cuisines you're craving this week?";
      } else if (lowerMessage.includes('snack')) {
        botResponse = "🍇 I see you're thinking snacks! Your BelVita biscuits and grapes are perfect starts. Here are some ideas:\n\n• **Energy Bites**: Mix peanut butter with oats and mini chocolate chips\n• **Fruit & Nut Combo**: Grapes with almonds or cheese\n• **Yogurt Parfait**: Layer with your breakfast biscuits as crunch\n\nWould you like me to suggest quantities for your shopping list?";
      } else {
        botResponse = `✨ I'd love to help you plan some amazing meals! Based on your current grocery list (grapes, pastry pups, almond milk, BelVita biscuits, and peanut butter), I can suggest meals that incorporate these items plus some additional ingredients.\n\nWhat type of meals interest you most:\n• Quick weekday dinners\n• Healthy lunch prep\n• Breakfast ideas\n• Snack combinations\n\nOr tell me about any specific cravings or dietary goals you have this week!`;
      }

      addDebugLog('Simulated bot response:', botResponse);

      removeTypingIndicator(typingId);

      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: botResponse,
        timestamp: new Date().toLocaleTimeString()
      };

      setMessages(prev => [...prev, botMessage]);
      addDebugLog('✅ Message exchange completed');

    } catch (error) {
      addDebugLog('❌ Error in sendMessage:', error.message);
      removeTypingIndicator(typingId);
      
      const errorMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: "I'm having trouble connecting to my meal planning brain right now! 🧠💭 But I can still help with some basic suggestions. What type of meals are you thinking about?",
        timestamp: new Date().toLocaleTimeString()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getWeekDateRange = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const showNextWeek = dayOfWeek >= 4;
    
    const daysToSunday = dayOfWeek;
    const currentWeekSunday = new Date(today);
    currentWeekSunday.setDate(today.getDate() - daysToSunday);
    
    const targetSunday = new Date(currentWeekSunday);
    if (showNextWeek) {
      targetSunday.setDate(targetSunday.getDate() + 7);
    }
    
    const targetSaturday = new Date(targetSunday);
    targetSaturday.setDate(targetSunday.getDate() + 6);
    
    const formatDate = (date) => {
      const day = date.getDate();
      const month = date.toLocaleDateString('en-US', { month: 'long' });
      return `${month} ${day}${getOrdinalSuffix(day)}`;
    };
    
    const getOrdinalSuffix = (day) => {
      if (day > 3 && day < 21) return 'th';
      switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };
    
    const year = targetSunday.getFullYear();
    return `Meal planning for ${formatDate(targetSunday)} to ${formatDate(targetSaturday)}, ${year}`;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <ChefHat size={28} />
              <h1 className="text-2xl font-bold">AI Meal Planner</h1>
            </div>
            
            {/* Debug Toggle */}
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="flex items-center gap-2 text-sm hover:bg-white/20 px-3 py-2 rounded-lg transition-colors"
            >
              <Wifi size={16} />
              Debug Info
              {showDebug ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
          
          <div className="bg-white/20 rounded-lg p-3">
            <p className="text-sm font-medium">{getWeekDateRange()}</p>
            <p className="text-xs opacity-90 mt-1">Get personalized meal suggestions based on your preferences</p>
          </div>
        </div>

        {/* Debug Panel */}
        {showDebug && (
          <div className="p-4 bg-gray-900 text-white">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
              <Wifi size={20} />
              Chatbot Debug Information
            </h3>
            <div className="space-y-1 text-sm font-mono max-h-60 overflow-y-auto">
              {debugInfo.map((log, index) => (
                <div key={index} className="flex gap-2">
                  <span className="text-gray-400">[{log.timestamp}]</span>
                  <span className={
                    log.message.includes('✅') ? 'text-green-400' :
                    log.message.includes('❌') ? 'text-red-400' :
                    log.message.includes('⚠️') ? 'text-yellow-400' :
                    'text-gray-200'
                  }>
                    {log.message}
                  </span>
                  {log.data && (
                    <span className="text-gray-500">
                      {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : log.data}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chat Messages */}
        <div className="h-96 overflow-y-auto p-6 bg-gray-50">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl ${
                    message.type === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-800 shadow-md border'
                  }`}
                >
                  {message.isTyping ? (
                    <div className="flex items-center gap-1">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                      <Sparkles size={16} className="text-purple-500 ml-2" />
                    </div>
                  ) : (
                    <div>
                      <div className="whitespace-pre-line">{message.content}</div>
                      <div
                        className={`text-xs mt-2 ${
                          message.type === 'user' ? 'text-blue-200' : 'text-gray-500'
                        }`}
                      >
                        {message.timestamp}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-6 bg-white border-t border-gray-200">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me about meal ideas, recipes, or cooking tips..."
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows="2"
                disabled={isLoading}
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              <Send size={20} />
              Send
            </button>
          </div>
          
          <div className="flex items-center justify-between mt-3">
            <div className="text-sm text-gray-500">
              💡 Try asking about breakfast ideas, lunch prep, or dinner suggestions!
            </div>
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-purple-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                Thinking...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatBot;
