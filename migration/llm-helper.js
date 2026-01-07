/**
 * LLM Helper for Migration Script
 * 
 * This module provides LLM integration for complex parsing tasks:
 * - Extracting split ratios from ambiguous descriptions
 * - Generating meaningful notes from instrument descriptions
 * - Classifying unknown transaction types
 */

const fs = require('fs');

// Try to load configuration from environment or config file
let LLM_CONFIG = {
    provider: process.env.LLM_PROVIDER || 'openai', // 'openai', 'anthropic', 'azure'
    apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    enabled: false
};

// Try to load from config file
try {
    if (fs.existsSync('./llm-config.json')) {
        const configFile = JSON.parse(fs.readFileSync('./llm-config.json', 'utf-8'));
        LLM_CONFIG = { ...LLM_CONFIG, ...configFile };
    }
} catch (e) {
    // Ignore config file errors
}

LLM_CONFIG.enabled = !!LLM_CONFIG.apiKey;

/**
 * Call OpenAI API
 */
async function callOpenAI(prompt, systemPrompt = null) {
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LLM_CONFIG.apiKey}`
        },
        body: JSON.stringify({
            model: LLM_CONFIG.model,
            messages,
            temperature: 0.1,
            max_tokens: 500
        })
    });

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

/**
 * Call Anthropic API
 */
async function callAnthropic(prompt, systemPrompt = null) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': LLM_CONFIG.apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: LLM_CONFIG.model || 'claude-3-haiku-20240307',
            max_tokens: 500,
            system: systemPrompt || '',
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
}

/**
 * Generic LLM call
 */
async function callLLM(prompt, systemPrompt = null) {
    if (!LLM_CONFIG.enabled) {
        return null;
    }

    try {
        switch (LLM_CONFIG.provider) {
            case 'openai':
            case 'azure':
                return await callOpenAI(prompt, systemPrompt);
            case 'anthropic':
                return await callAnthropic(prompt, systemPrompt);
            default:
                console.warn(`Unknown LLM provider: ${LLM_CONFIG.provider}`);
                return null;
        }
    } catch (error) {
        console.error(`LLM call failed: ${error.message}`);
        return null;
    }
}

/**
 * Extract split ratio from instrument description using LLM
 */
async function extractSplitRatioWithLLM(instrumentDescription) {
    const prompt = `Extract the stock split ratio from this description. 
Return ONLY a JSON object with numerator and denominator, nothing else.
Example: {"numerator": 3, "denominator": 1} for a 3:1 split.

Description: "${instrumentDescription}"`;

    const response = await callLLM(prompt);
    if (!response) return null;

    try {
        const match = response.match(/\{[^}]+\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
    } catch (e) {
        return null;
    }
    return null;
}

/**
 * Classify transaction type using LLM
 */
async function classifyTransactionWithLLM(record) {
    const prompt = `Classify this stock transaction. Return ONLY one of: BUY, SELL, SPLIT, BONUS, TRANSFER, MERGER, SPINOFF, UNKNOWN.

Platform: ${record['Platform']}
Instrument: ${record['Instrument']}
Symbol: ${record['Symbol']}
B/S: ${record['B/S']}
Amount: ${record['Amount']}
Price: ${record['Price']}`;

    const response = await callLLM(prompt);
    if (!response) return null;

    const validTypes = ['BUY', 'SELL', 'SPLIT', 'BONUS', 'TRANSFER', 'MERGER', 'SPINOFF', 'UNKNOWN'];
    const cleaned = response.trim().toUpperCase();
    return validTypes.includes(cleaned) ? cleaned : null;
}

/**
 * Generate meaningful notes from instrument description
 */
async function generateNotesWithLLM(instrumentDescription, actionType) {
    const prompt = `Create a concise note (max 50 chars) for this stock ${actionType} from the description.

Description: "${instrumentDescription}"

Return ONLY the note text, nothing else.`;

    const response = await callLLM(prompt);
    return response ? response.trim().substring(0, 100) : null;
}

/**
 * Batch process records to minimize LLM calls
 */
async function batchClassifyRecords(records) {
    if (!LLM_CONFIG.enabled || records.length === 0) {
        return new Map();
    }

    // Batch records into groups of 10
    const results = new Map();
    const batchSize = 10;

    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const descriptions = batch.map((r, idx) =>
            `${idx + 1}. Platform: ${r['Platform']}, Instrument: ${r['Instrument']}, B/S: ${r['B/S']}, Amount: ${r['Amount']}`
        ).join('\n');

        const prompt = `Classify each transaction. Return a JSON array of types.
Valid types: BUY, SELL, SPLIT, BONUS, TRANSFER_IN, TRANSFER_OUT, MERGER, SPINOFF, UNKNOWN

Transactions:
${descriptions}

Return ONLY a JSON array like: ["BUY", "SELL", "SPLIT", ...]`;

        const response = await callLLM(prompt);
        if (response) {
            try {
                const match = response.match(/\[[^\]]+\]/);
                if (match) {
                    const types = JSON.parse(match[0]);
                    batch.forEach((r, idx) => {
                        if (types[idx]) {
                            results.set(r._lineNumber, types[idx]);
                        }
                    });
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
    }

    return results;
}

module.exports = {
    LLM_CONFIG,
    callLLM,
    extractSplitRatioWithLLM,
    classifyTransactionWithLLM,
    generateNotesWithLLM,
    batchClassifyRecords
};
