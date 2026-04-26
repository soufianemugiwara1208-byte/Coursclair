// api/chat.js - Serverless Function pour Vercel/Netlify avec LongChat
export default async function handler(req, res) {
    // Vérifier que la requête est de type POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Récupérer les données de la requête
        const { text, question, action } = req.body;

        // Vérifier que la clé API LongChat est disponible
        if (!process.env.LONGCHAT_API_KEY) {
            return res.status(500).json({ error: 'LONGCHAT_API_KEY not configured' });
        }

        // Appeler l'API LongChat en fonction de l'action
        if (action === 'analyze') {
            // Prompt optimisé pour l'analyse du cours
            const prompt = `Tu es un professeur expert en pédagogie. Analyse ce texte en français et génère :
            1. **Explication détaillée** : Explique le sujet principal de manière claire et structurée (minimum 3 points clés).
            2. **Résumé concis** : Résume le texte en 3-5 phrases maximum.
            3. **3 exemples concrets** : Donne des exemples pratiques pour illustrer les concepts.
            4. **5 questions d'entraînement** :
               - 2 questions à choix multiples (QCM) avec 4 options
               - 2 questions ouvertes
               - 1 question de synthèse

            **Important** : Réponds uniquement en français. Structure ta réponse avec des titres clairs (Explication:, Résumé:, etc.).

            Texte à analyser : ${text}`;

            const response = await callLongChatAPI(prompt, 2000);
            const { explanation, summary, examples, questions } = parseAnalysisResponse(response);

            return res.status(200).json({
                explanation,
                summary,
                examples,
                questions
            });

        } else if (action === 'chat') {
            // Prompt optimisé pour le chatbot
            const prompt = `Tu es un assistant IA spécialisé dans l'aide aux devoirs et à la compréhension des cours.
            Réponds à cette question en français, de manière claire, détaillée et adaptée à un étudiant.
            Si un contexte est fourni, utilise-le pour enrichir ta réponse.

            Contexte : ${text || 'Aucun contexte spécifique'}
            Question : ${question}

            **Règles** :
            - Réponds toujours en français.
            - Sois précis et pédagogique.
            - Si tu ne connais pas la réponse, dis-le honnêtement.`;

            const response = await callLongChatAPI(prompt, 1000);
            return res.status(200).json({
                response: response
            });
        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }

    } catch (error) {
        console.error('Erreur dans api/chat:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

// Fonction pour appeler l'API LongChat avec retry
async function callLongChatAPI(prompt, maxTokens) {
    const apiKey = process.env.LONGCHAT_API_KEY;
    const apiUrl = 'https://api.longchat.ai/v1/chat/completions';

    // Configuration des retries
    const maxRetries = 3;
    const baseDelay = 1000; // 1 seconde

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "longchat-7b-v2",
                    messages: [
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: maxTokens
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`LongChat API error: ${response.status} - ${errorData.message || 'Unknown error'}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;

        } catch (error) {
            if (attempt === maxRetries) {
                throw error; // Lancer l'erreur après le dernier essai
            }
            // Attendre avant de réessayer (exponential backoff)
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.log(`Erreur LongChat (attempt ${attempt}/${maxRetries}), retry dans ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Fonction pour parser la réponse d'analyse
function parseAnalysisResponse(response) {
    // Nettoyer la réponse
    const cleanedResponse = response.trim();

    // Essayer de parser avec des expressions régulières
    const explanationMatch = cleanedResponse.match(/^(Explication détaillée|Explication|1\.)[\s\S]*?(?=\n\n|\n2\.|\nRésumé|$)/i);
    const summaryMatch = cleanedResponse.match(/^(Résumé concis|Résumé|2\.)[\s\S]*?(?=\n\n|\n3\.|\nExemples|$)/i);
    const examplesMatch = cleanedResponse.match(/^(3 exemples concrets|Exemples|3\.)[\s\S]*?(?=\n\n|\n4\.|\nQuestions|$)/i);
    const questionsMatch = cleanedResponse.match(/^(5 questions|Questions|4\.)[\s\S]*$/i);

    // Extraire les sections
    let explanation = explanationMatch ? explanationMatch[0].replace(/^(Explication détaillée|Explication|1\.)[\s:]*/, '').trim() : "";
    let summary = summaryMatch ? summaryMatch[0].replace(/^(Résumé concis|Résumé|2\.)[\s:]*/, '').trim() : "";
    let examples = examplesMatch ? examplesMatch[0].replace(/^(3 exemples concrets|Exemples|3\.)[\s:]*/, '').trim() : "";
    let questions = questionsMatch ? questionsMatch[0].replace(/^(5 questions|Questions|4\.)[\s:]*/, '').trim() : "";

    // Si le parsing échoue, essayer une approche alternative
    if (!explanation || !summary || !examples || !questions) {
        const sections = cleanedResponse.split(/\n\n|\n\d\./).filter(s => s.trim().length > 0);

        if (sections.length >= 4) {
            explanation = sections[0].trim();
            summary = sections[1].trim();
            examples = sections[2].trim();
            questions = sections[3].trim();
        } else {
            // Valeurs par défaut
            explanation = "Explication non disponible";
            summary = "Résumé non disponible";
            examples = "Exemples non disponibles";
            questions = "Questions non disponibles";
        }
    }

    // Formater les résultats en HTML
    return {
        explanation: `<p><strong>Explication détaillée :</strong></p><p>${explanation}</p>`,
        summary: `<p><strong>Résumé clair :</strong></p><p>${summary}</p>`,
        examples: `<p><strong>Exemples concrets :</strong></p><p>${examples}</p>`,
        questions: `<p><strong>Questions d'entraînement :</strong></p><p>${questions}</p>`
    };
}
