// api/chat.js - Serverless Function pour Vercel avec appel direct à l'API Groq
export default async function handler(req, res) {
    // Vérifier que la requête est de type POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Récupérer les données de la requête
        const { text, question, action } = req.body;

        // Vérifier que la clé API Groq est disponible
        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
        }

        // Appeler l'API Groq en fonction de l'action
        if (action === 'analyze') {
            // Prompt pour l'analyse du cours
            const prompt = `Tu es un professeur patient et pédagogue. Analyse ce texte et génère :
            1. Une explication simple et détaillée (en français)
            2. Un résumé clair (en français)
            3. 3 exemples concrets (en français)
            4. 5 questions d'entraînement (2 QCM, 2 questions ouvertes, 1 question de synthèse) (en français)

            Texte à analyser : ${text}`;

            const response = await callGroqAPI(prompt);
            const { explanation, summary, examples, questions } = parseAnalysisResponse(response);

            return res.status(200).json({
                explanation,
                summary,
                examples,
                questions
            });

        } else if (action === 'chat') {
            // Prompt pour le chatbot
            const prompt = `Tu es un assistant IA spécialisé dans l'aide aux devoirs. Réponds à cette question en français, de manière claire, détaillée et adaptée à un étudiant.
            Contexte : ${text || 'Aucun contexte spécifique'}
            Question : ${question}`;

            const response = await callGroqAPI(prompt);
            return res.status(200).json({
                response: response
            });
        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }

    } catch (error) {
        console.error('Erreur dans api/chat:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}

// Fonction pour appeler l'API Groq (endpoint direct)
async function callGroqAPI(prompt) {
    const apiKey = process.env.GROQ_API_KEY;
    const apiUrl = 'https://api.groq.com/openai/v1/chat/completions';

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "mixtral-8x7b-32768", // Modèle puissant et rapide
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7, // Créativité modérée
            max_tokens: 2000, // Longueur maximale de la réponse
            stream: false // Désactive le streaming pour simplifier
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Groq API error: ${response.status} - ${errorData.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// Fonction pour parser la réponse d'analyse
function parseAnalysisResponse(response) {
    // Diviser la réponse en sections
    const sections = response.split('\n\n');

    // Extraire chaque partie
    let explanation = "";
    let summary = "";
    let examples = "";
    let questions = "";

    for (const section of sections) {
        if (section.toLowerCase().includes('explication')) {
            explanation = section.replace(/^1\.\s*/i, '').trim();
        } else if (section.toLowerCase().includes('résumé')) {
            summary = section.replace(/^2\.\s*/i, '').trim();
        } else if (section.toLowerCase().includes('exemple')) {
            examples = section.replace(/^3\.\s*/i, '').trim();
        } else if (section.toLowerCase().includes('question')) {
            questions = section.replace(/^4\.\s*/i, '').trim();
        }
    }

    // Si le parsing automatique échoue, utiliser des valeurs par défaut
    if (!explanation || !summary || !examples || !questions) {
        const parts = response.split('\n\n').filter(part => part.trim().length > 0);
        explanation = parts[0] || "Explication non disponible";
        summary = parts[1] || "Résumé non disponible";
        examples = parts[2] || "Exemples non disponibles";
        questions = parts[3] || "Questions non disponibles";
    }

    return {
        explanation: `<p><strong>Explication détaillée :</strong></p><p>${explanation}</p>`,
        summary: `<p><strong>Résumé clair :</strong></p><p>${summary}</p>`,
        examples: `<p><strong>Exemples concrets :</strong></p><p>${examples}</p>`,
        questions: `<p><strong>Questions d'entraînement :</strong></p><p>${questions}</p>`
    };
}
  
