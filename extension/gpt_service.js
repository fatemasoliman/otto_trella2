import { config } from './config.js';

const API_BASE_URL = 'https://api.openai.com/v1';
const ASSISTANT_ID = 'asst_auGRoJqaRVySWahymKlPW90Q';

export const GPTService = {
    async getFormCompletion(prompt) {
        try {
            console.log('Starting OpenAI Assistant process...');

            // Create a thread
            const thread = await this.createThread();

            // Add a message to the thread
            await this.addMessageToThread(thread.id, prompt);

            // Run the assistant
            const run = await this.runAssistant(thread.id);

            // Wait for the run to complete
            await this.waitForRunCompletion(thread.id, run.id);

            // Retrieve the assistant's response
            const messages = await this.getThreadMessages(thread.id);
            const assistantResponse = messages.data.find(msg => msg.role === 'assistant');

            if (!assistantResponse) {
                throw new Error('No response from assistant');
            }

            console.log('Assistant response:', assistantResponse.content[0].text.value);
            return JSON.parse(assistantResponse.content[0].text.value);
        } catch (error) {
            console.error('Error in GPTService:', error);
            throw error;
        }
    },

    async createThread() {
        const response = await fetch(`${API_BASE_URL}/threads`, {
            method: 'POST',
            headers: this.getHeaders(),
        });
        return this.handleResponse(response);
    },

    async addMessageToThread(threadId, content) {
        const response = await fetch(`${API_BASE_URL}/threads/${threadId}/messages`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ role: 'user', content }),
        });
        return this.handleResponse(response);
    },

    async runAssistant(threadId) {
        const response = await fetch(`${API_BASE_URL}/threads/${threadId}/runs`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ assistant_id: ASSISTANT_ID }),
        });
        return this.handleResponse(response);
    },

    async waitForRunCompletion(threadId, runId) {
        let run;
        do {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
            run = await this.getRunStatus(threadId, runId);
        } while (run.status === 'queued' || run.status === 'in_progress');

        if (run.status !== 'completed') {
            throw new Error(`Run failed with status: ${run.status}`);
        }
    },

    async getRunStatus(threadId, runId) {
        const response = await fetch(`${API_BASE_URL}/threads/${threadId}/runs/${runId}`, {
            headers: this.getHeaders(),
        });
        return this.handleResponse(response);
    },

    async getThreadMessages(threadId) {
        const response = await fetch(`${API_BASE_URL}/threads/${threadId}/messages`, {
            headers: this.getHeaders(),
        });
        return this.handleResponse(response);
    },

    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'assistants=v1'
        };
    },

    async handleResponse(response) {
        if (!response.ok) {
            const errorBody = await response.text();
            console.error('OpenAI API error response:', errorBody);
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
        }
        return response.json();
    }
};