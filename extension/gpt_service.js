import { CONFIG } from './config.js';

export const GPTService = {
  ASSISTANT_ID: 'asst_auGRoJqaRVySWahymKlPW90Q', 

  async createThread() {
    const response = await fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v1'
      }
    });
    const data = await response.json();
    return data.id;
  },

  async addMessageToThread(threadId, content) {
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v1'
      },
      body: JSON.stringify({
        role: 'user',
        content: content
      })
    });
    const data = await response.json();
    return data.id; // Return the message ID
  },

  async runAssistant(threadId) {
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v1'
      },
      body: JSON.stringify({
        assistant_id: this.ASSISTANT_ID
      })
    });
    const data = await response.json();
    return data.id;
  },

  async getRunStatus(threadId, runId) {
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
      headers: {
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v1'
      }
    });
    const data = await response.json();
    return data.status;
  },

  async getAssistantResponse(threadId) {
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: {
        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v1'
      }
    });
    const data = await response.json();
    
    console.log('Thread messages:', data);  // Log all messages for debugging

    if (!data.data || data.data.length === 0) {
      throw new Error('No messages found in the thread');
    }

    // Filter and sort assistant messages, getting the most recent one
    const assistantMessages = data.data
      .filter(message => message.role === 'assistant')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (assistantMessages.length === 0) {
      throw new Error('No assistant messages found in the thread');
    }

    const latestAssistantMessage = assistantMessages[0];
    console.log('Latest assistant message:', latestAssistantMessage);

    if (!latestAssistantMessage.content || latestAssistantMessage.content.length === 0 || !latestAssistantMessage.content[0].text) {
      throw new Error('Invalid message content structure');
    }

    return latestAssistantMessage.content[0].text.value;
  },

  async getFormCompletion(prompt, isDropdownQuery = false) {
    const threadId = await this.createThread();
    await this.addMessageToThread(threadId, prompt);
    const runId = await this.runAssistant(threadId);

    let status;
    let retries = 0;
    const maxRetries = 4;
    const retryDelay = 5000;

    do {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      status = await this.getRunStatus(threadId, runId);
      console.log('Run status:', status);
      retries++;
    } while (status !== 'completed' && status !== 'failed' && retries < maxRetries);

    if (status === 'failed') {
      throw new Error('Assistant run failed');
    }

    if (status !== 'completed') {
      throw new Error('Assistant run timed out');
    }

    const response = await this.getAssistantResponse(threadId);
    console.log('Raw response from assistant:', response);

    return response; // Return the raw response without any parsing
  }
};