import config from './config.js';

export class GPTService {
    constructor() {
        this.API_KEY = config.openAIKey;
        this.API_URL = 'https://api.openai.com/v1';
        this.ASSISTANT_ID = 'asst_auGRoJqaRVySWahymKlPW90Q';
    }

    getHeaders() {
        return {
            'Authorization': `Bearer ${this.API_KEY}`,
            'Content-Type': 'application/json',
            'OpenAI-Beta': 'assistants=v2'
        };
    }

    async createThread() {
        try {
            const response = await fetch(`${this.API_URL}/threads`, {
                method: 'POST',
                headers: this.getHeaders(),
            });
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Failed to create thread: ${response.status}. Body: ${errorBody}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error in createThread:', error);
            throw error;
        }
    }

    async addMessageToThread(threadId, content) {
        try {
            const response = await fetch(`${this.API_URL}/threads/${threadId}/messages`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    role: 'user',
                    content: content
                })
            });
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Failed to add message: ${response.status}. Body: ${errorBody}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error in addMessageToThread:', error);
            throw error;
        }
    }

    async runAssistant(threadId) {
        try {
            const response = await fetch(`${this.API_URL}/threads/${threadId}/runs`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    assistant_id: this.ASSISTANT_ID
                })
            });
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Failed to run assistant: ${response.status}. Body: ${errorBody}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error in runAssistant:', error);
            throw error;
        }
    }

    async checkRunStatus(threadId, runId) {
        try {
            const response = await fetch(`${this.API_URL}/threads/${threadId}/runs/${runId}`, {
                method: 'GET',
                headers: this.getHeaders(),
            });
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Failed to check run status: ${response.status}. Body: ${errorBody}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error in checkRunStatus:', error);
            throw error;
        }
    }

    async getMessages(threadId) {
        try {
            const response = await fetch(`${this.API_URL}/threads/${threadId}/messages`, {
                method: 'GET',
                headers: this.getHeaders(),
            });
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Failed to get messages: ${response.status}. Body: ${errorBody}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error in getMessages:', error);
            throw error;
        }
    }

    async getFormCompletion(emailBody, formFields) {
        try {
            console.log('Starting form completion process...');

            const thread = await this.createThread();
            console.log('Thread created:', thread.id);

            const prompt = `
                Please analyze the following email and extract information to fill out a form. 
                The form fields are: ${formFields.join(', ')}.
                
                Email content:
                ${emailBody}

                Please provide your response as a JSON object where the keys are the form field labels and the values are the extracted information.
            `;

            await this.addMessageToThread(thread.id, prompt);
            console.log('Message added to thread');

            const run = await this.runAssistant(thread.id);
            console.log('Assistant run started:', run.id);

            let runStatus;
            do {
                await new Promise(resolve => setTimeout(resolve, 1000));
                runStatus = await this.checkRunStatus(thread.id, run.id);
                console.log('Current run status:', runStatus.status);
            } while (runStatus.status !== 'completed');

            const messages = await this.getMessages(thread.id);
            console.log('Retrieved messages');

            const assistantMessage = messages.data.find(m => m.role === 'assistant');
            if (!assistantMessage) {
                throw new Error('No assistant message found');
            }

            const assistantResponse = assistantMessage.content[0].text.value;
            console.log('Assistant response:', assistantResponse);

            return JSON.parse(assistantResponse);
        } catch (error) {
            console.error('Error in getFormCompletion:', error);
            throw error;
        }
    }
}