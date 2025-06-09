// KKH Nursing Chatbot - Starter JS
// Future: Integrate TinyLlama and BAAI/bge-small-en-v1.5 for PDF QA

document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const chatWindow = document.getElementById('chat-window');
    const userInput = document.getElementById('user-input');

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = userInput.value.trim();
        if (message) {
            appendMessage('You', message);
            userInput.value = '';
            appendMessage('Bot', '<em>Thinking...</em>');
            // Send user message to LM Studio API
            try {
                const response = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'tinyllama-1.1b-chat-v1',
                        messages: [
                            { role: 'system', content: 'You are a helpful nurse assistant. Use the KKH Information file to answer questions about women’s and children’s care.' },
                            { role: 'user', content: message }
                        ]
                    })
                });
                const data = await response.json();
                // Remove the 'Thinking...' message
                const lastMsg = chatWindow.lastChild;
                if (lastMsg && lastMsg.innerHTML.includes('Thinking')) chatWindow.removeChild(lastMsg);
                if (data.choices && data.choices[0] && data.choices[0].message) {
                    appendMessage('Bot', data.choices[0].message.content);
                } else {
                    appendMessage('Bot', 'Sorry, I could not get a response from the assistant.');
                }
            } catch (err) {
                // Remove the 'Thinking...' message
                const lastMsg = chatWindow.lastChild;
                if (lastMsg && lastMsg.innerHTML.includes('Thinking')) chatWindow.removeChild(lastMsg);
                appendMessage('Bot', 'Error connecting to LM Studio. Is it running?');
            }
        }
    });

    function appendMessage(sender, text) {
        const msgDiv = document.createElement('div');
        msgDiv.innerHTML = `<strong>${sender}:</strong> ${text}`;
        msgDiv.setAttribute('tabindex', '0');
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // --- Quiz Generation from PDF ---
    const generateQuizBtn = document.getElementById('generate-quiz');
    const quizSection = document.getElementById('quiz-section');
    generateQuizBtn.addEventListener('click', async () => {
        quizSection.style.display = 'block';
        quizSection.innerHTML = '<em>Loading PDF and generating quiz...</em>';
        try {
            const pdfText = await extractPdfText('data/KKH Information file.pdf');
            if (!pdfText || pdfText.length < 100) {
                quizSection.innerHTML = 'PDF could not be loaded or is empty.';
                return;
            }
            // Ask LLM to generate a quiz from the PDF text
            const prompt = `Generate a multiple-choice quiz (3 questions) with correct answers based only on the following information. Format: Q: ...\nA) ...\nB) ...\nC) ...\nAnswer: ...\n\nPDF Content:\n${pdfText.slice(0, 2000)}`;
            const response = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'tinyllama-1.1b-chat-v1',
                    messages: [
                        { role: 'system', content: 'You are a helpful nurse assistant. Use only the provided PDF content to generate quiz questions and answers.' },
                        { role: 'user', content: prompt }
                    ]
                })
            });
            if (!response.ok) {
                quizSection.innerHTML = 'Failed to contact LLM API. Check LM Studio.';
                return;
            }
            const data = await response.json();
            const quizText = data.choices?.[0]?.message?.content || 'No quiz generated.';
            renderQuiz(quizText);
        } catch (err) {
            if (err.message && err.message.includes('pdfjsLib')) {
                quizSection.innerHTML = 'PDF.js failed to load. Check your internet connection or PDF.js script.';
            } else {
                quizSection.innerHTML = 'Failed to generate quiz. (PDF or LLM error)';
            }
        }
    });

    // --- Quiz Rendering and Answer Checking ---
    function renderQuiz(quizText) {
        // Parse quizText into questions, options, and answers
        const questions = [];
        const regex = /Q:\s*(.*?)\n([A-Z]\) .*?\n)+Answer:\s*([A-Z])/gs;
        let match;
        while ((match = regex.exec(quizText)) !== null) {
            const qText = match[1].trim();
            const optionsBlock = match[0].split('Answer:')[0];
            const options = Array.from(optionsBlock.matchAll(/([A-Z])\) (.*?)\n/g)).map(m => ({ key: m[1], text: m[2] }));
            const answer = match[3].trim();
            questions.push({ qText, options, answer });
        }
        if (questions.length === 0) {
            quizSection.innerHTML = '<pre>' + quizText + '</pre>';
            return;
        }
        let html = '<form id="quiz-form">';
        questions.forEach((q, i) => {
            html += `<div class="quiz-q"><strong>Q${i+1}: ${q.qText}</strong><br>`;
            q.options.forEach(opt => {
                html += `<label><input type="radio" name="q${i}" value="${opt.key}" required> ${opt.key}) ${opt.text}</label><br>`;
            });
            html += '</div><br>';
        });
        html += '<button type="submit">Check Answers</button></form>';
        html += '<div id="quiz-feedback"></div>';
        quizSection.innerHTML = html;
        document.getElementById('quiz-form').addEventListener('submit', function(e) {
            e.preventDefault();
            let score = 0;
            let feedback = '';
            questions.forEach((q, i) => {
                const userAns = this[`q${i}`].value;
                if (userAns === q.answer) {
                    score++;
                    feedback += `<div>Q${i+1}: Correct!</div>`;
                } else {
                    feedback += `<div>Q${i+1}: Incorrect. Correct answer: ${q.answer}</div>`;
                }
            });
            feedback += `<div><strong>Your score: ${score} / ${questions.length}</strong></div>`;
            document.getElementById('quiz-feedback').innerHTML = feedback;
        });
    }

    // --- PDF Extraction Helper ---
    async function extractPdfText(pdfUrl) {
        // Use PDF.js (browser-based) for PDF text extraction
        if (!window.pdfjsLib) {
            await loadPdfJs();
        }
        const loadingTask = window.pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(' ') + '\n';
        }
        return text;
    }
    async function loadPdfJs() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.js';
            script.onload = () => {
                window.pdfjsLib = window['pdfjs-dist/build/pdf'];
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js';
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // --- Fluid Calculator ---
    const openCalcBtn = document.getElementById('open-calculator');
    const calcSection = document.getElementById('calculator-section');
    const closeCalcBtn = document.getElementById('close-calculator');
    const fluidForm = document.getElementById('fluid-form');
    const fluidResult = document.getElementById('fluid-result');

    openCalcBtn.addEventListener('click', () => {
        calcSection.style.display = 'block';
    });
    closeCalcBtn.addEventListener('click', () => {
        calcSection.style.display = 'none';
        fluidResult.innerHTML = '';
        fluidForm.reset();
    });
    fluidForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const age = parseFloat(document.getElementById('age').value);
        const weight = parseFloat(document.getElementById('weight').value);
        const fluid = calculateFluidRequirement(age, weight);
        fluidResult.innerHTML = `<strong>Recommended daily fluid:</strong> ${fluid} mL`;
    });
    function calculateFluidRequirement(age, weight) {
        // Standard pediatric maintenance fluid calculation (Holliday-Segar method)
        if (weight <= 10) return Math.round(weight * 100);
        if (weight <= 20) return Math.round(1000 + (weight - 10) * 50);
        return Math.round(1500 + (weight - 20) * 20);
    }
});
