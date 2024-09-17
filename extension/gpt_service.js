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
    await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
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
    return data.data[0].content[0].text.value;
  },

  async getFormCompletion(prompt) {
    const threadId = await this.createThread();
    await this.addMessageToThread(threadId, prompt);
    const runId = await this.runAssistant(threadId);

    let status;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
      status = await this.getRunStatus(threadId, runId);
    } while (status !== 'completed' && status !== 'failed');

    if (status === 'failed') {
      throw new Error('Assistant run failed');
    }

    const response = await this.getAssistantResponse(threadId);
    return response; // Return the raw response
  }
};