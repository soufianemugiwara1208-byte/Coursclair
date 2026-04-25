// api/chat.js - Serverless Function Vercel — appel direct à l'API Groq
export default async function handler(req, res) {
    // Autoriser uniquement les requêtes POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Vérifier la présence de la clé API Groq
    if (!process.env.GROQ_API_KEY) {
        return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
    }

    try {
        const { text, question, action } = req.body;

        if (action === 'analyze') {
            const prompt = `Tu es un professeur patient et pédagogue. Analyse ce texte et génère :
1. Une explication simple et détaillée (en français)
2. Un résumé clair (en français)
3. 3 exemples concrets (en français)
4. 5 questions d'entraînement (2 QCM, 2 questions ouvertes, 1 question de synthèse) (en français)

Texte à analyser : ${text}`;

            const response = await callGroqAPI(prompt);
            const parsed = parseAnalysisResponse(response);
            return res.status(200).json(parsed);

        } else if (action === 'chat') {
            const prompt = `Tu es un assistant IA spécialisé dans l'aide aux devoirs. Réponds à cette question en français, de manière claire, détaillée et adaptée à un étudiant.
Contexte : ${text || 'Aucun contexte spécifique'}
Question : ${question}`;

            const response = await callGroqAPI(prompt);
            return res.status(200).json({ response });

        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }

    } catch (error) {
        console.error('Erreur dans api/chat:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}

// Appel direct à l'API Groq — aucun gateway, aucun SDK tiers
async function callGroqAPI(prompt) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: 'llama3-8b-8192', // Modèle gratuit et rapide sur Groq
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2000,
            stream: false
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Groq API error: ${response.status} — ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Parser la réponse structurée de l'analyse
function parseAnalysisResponse(response) {
    const sections = response.split('\n\n');

    let explanation = '';
    let summary = '';
    let examples = '';
    let questions = '';

    for (const section of sections) {
        const lower = section.toLowerCase();
        if (lower.includes('explication') && !explanation) {
            explanation = section.replace(/^1\.\s*/i, '').trim();
        } else if (lower.includes('résumé') && !summary) {
            summary = section.replace(/^2\.\s*/i, '').trim();
        } else if (lower.includes('exemple') && !examples) {
            examples = section.replace(/^3\.\s*/i, '').trim();
        } else if (lower.includes('question') && !questions) {
            questions = section.replace(/^4\.\s*/i, '').trim();
        }
    }

    // Fallback si le parsing échoue
    if (!explanation || !summary || !examples || !questions) {
        const parts = sections.filter(p => p.trim().length > 0);
        explanation = parts[0] || 'Explication non disponible';
        summary     = parts[1] || 'Résumé non disponible';
        examples    = parts[2] || 'Exemples non disponibles';
        questions   = parts[3] || 'Questions non disponibles';
    }

    return {
        explanation: `<p><strong>Explication détaillée :</strong></p><p>${explanation}</p>`,
        summary:     `<p><strong>Résumé clair :</strong></p><p>${summary}</p>`,
        examples:    `<p><strong>Exemples concrets :</strong></p><p>${examples}</p>`,
        questions:   `<p><strong>Questions d'entraînement :</strong></p><p>${questions}</p>`
    };
}
