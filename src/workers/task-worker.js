const { parentPort } = require('worker_threads');

parentPort.on('message', async (task) => {
  try {
    const { type, data } = task;
    
    switch (type) {
      case 'llm_request':
        // Lazy load Ollama only when needed
        const Ollama = require('ollama').Ollama;
        const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://192.168.0.60:11434' });
        const response = await ollama.chat({
          model: data.model || 'llama2',
          messages: data.messages,
          stream: false
        });
        parentPort.postMessage({ success: true, result: response });
        break;
        
      case 'audio_process':
        // Audio processing logic here
        parentPort.postMessage({ success: true, result: data });
        break;
        
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  } catch (error) {
    parentPort.postMessage({ success: false, error: error.message });
  }
});
